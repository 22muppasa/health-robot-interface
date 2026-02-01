from fastapi import FastAPI, WebSocket, HTTPException, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, Dict, Any, List
import asyncio
import json
import os
from pathlib import Path
from dotenv import load_dotenv
import uuid
import logging

# Load environment variables from .env file with explicit path
env_path = Path(__file__).parent / ".env"
load_dotenv(dotenv_path=env_path, override=True)

# Debug: Check if Supabase keys are loaded
print(f"[DEBUG] Working directory: {os.getcwd()}")
print(f"[DEBUG] .env path: {env_path} (exists: {env_path.exists()})")
print(f"[DEBUG] SUPABASE_URL: {os.getenv('SUPABASE_URL', 'NOT SET')[:30]}...")
print(f"[DEBUG] SUPABASE_SERVICE_KEY exists: {bool(os.getenv('SUPABASE_SERVICE_KEY'))}")

from contextlib import asynccontextmanager
from fastapi.responses import StreamingResponse
from datetime import datetime, timedelta

# Import our modules
from voice_service import VoiceService
from conferencing import ConferencingService
from robot_actions import RobotActions
from extended_commands import COMMANDS, CommandCategory
from reminders import ReminderManager, ReminderType, ReminderFrequency
from realtime_data import data_fetcher
from contacts import contact_manager, Contact, Guardian, Patient
from chat_history import save_message, get_history, clear_history, get_all_patients_with_history, set_broadcast_callback
from supabase_client import (
    get_supabase, is_supabase_configured, SupabaseNotConfiguredError,
    PatientDB, GuardianDB, PatientSettingsDB, ContactsDB, RemindersDB,
    ConversationDB, ActivityLogDB, AuthHelpers
)

logger = logging.getLogger(__name__)

# Configuration
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
JITSI_BASE_URL = os.getenv("JITSI_BASE_URL", "https://meet.jit.si" )
DEFAULT_ROOM = os.getenv("DEFAULT_ROOM", "nurse-station")

# WebRTC TURN Server Configuration
TURN_SERVER_URL = os.getenv("TURN_SERVER_URL", "turn:a.relay.metered.ca:443")
TURN_SERVER_USERNAME = os.getenv("TURN_SERVER_USERNAME", "e8e8e8e8e8e8e8e8e8e8e8e8")
TURN_SERVER_CREDENTIAL = os.getenv("TURN_SERVER_CREDENTIAL", "e8e8e8e8e8e8e8e8e8e8e8e8")

# Global state
class SystemState:
    def __init__(self):
        self.assistant_enabled = True  # Auto-enabled for voice commands
        self.assistant_state = "idle"  # idle, listening, processing, speaking
        self.last_transcript = ""
        self.last_intent = ""
        self.last_response = ""
        self.last_audio = ""
        self.call_state = "not_in_call"
        self.last_error = ""
        self.pending_command = None
        self.connections: set[WebSocket] = set()
        self.user_profile = {}  # Store user/patient information
        self.microphone_sensitivity = 0.7  # 0.0-1.0
        self.output_delay_ms = 0  # For measuring output delay
        self.active_call_info = None  # Store active call details for frontend
        self.call_event = None  # Transient call events (answered, rejected, missed)

    async def broadcast_update(self):
        update = {
            "assistant_enabled": self.assistant_enabled,
            "assistant_state": self.assistant_state,
            "last_transcript": self.last_transcript,
            "last_intent": self.last_intent,
            "last_response": self.last_response,
            "last_audio": self.last_audio,
            "call_state": self.call_state,
            "last_error": self.last_error,
            "microphone_sensitivity": self.microphone_sensitivity,
            "pending_command": self.pending_command,
            "active_call_info": self.active_call_info,
            "call_event": self.call_event,
        }
        for connection in self.connections.copy():
            try:
                await connection.send_json({"type": "system_update", "payload": update})
            except:
                self.connections.discard(connection)

    async def broadcast_conversation_update(self, patient_id: str, message: dict):
        """Broadcast a new conversation message to all connected clients."""
        update = {
            "type": "conversation_update",
            "patient_id": patient_id,
            "message": message,
        }
        for connection in self.connections.copy():
            try:
                await connection.send_json(update)
            except:
                self.connections.discard(connection)

state = SystemState()

# Services
voice_service = VoiceService(state, OPENAI_API_KEY)
conferencing_service = ConferencingService(state, JITSI_BASE_URL)
robot_actions = RobotActions(state)
reminder_manager = ReminderManager()

# Models
class CommandRequest(BaseModel):
    intent: str
    slots: Optional[Dict[str, Any]] = {}
    source: str = "ui"

class TextCommandRequest(BaseModel):
    text: str

# Video Conferencing Models
class VideoJoinRequest(BaseModel):
    room_id: Optional[str] = "default-room"
    session_id: Optional[str] = None

class InitiateCallRequest(BaseModel):
    initiator_id: str  # Guardian ID
    initiator_name: str  # Guardian name
    initiator_role: str = "Guardian"
    patient_id: str  # Patient/User ID
    call_type: str = "video"  # video, audio, etc.

class AnswerCallRequest(BaseModel):
    call_id: str
    patient_id: str

class SDPOfferRequest(BaseModel):
    participant_id: str
    sdp: str

class SDPAnswerRequest(BaseModel):
    participant_id: str
    to_participant_id: str
    sdp: str

class ICECandidateRequest(BaseModel):
    participant_id: str
    candidate: dict

class VideoMuteRequest(BaseModel):
    participant_id: str

class VideoUnmuteRequest(BaseModel):
    participant_id: str

class VideoToggleRequest(BaseModel):
    participant_id: str
    video_on: bool

class VideoEndRequest(BaseModel):
    participant_id: str

class ReminderRequest(BaseModel):
    title: str
    description: str
    reminder_type: str
    scheduled_time: str
    frequency: str = "once"
    metadata: Optional[Dict[str, Any]] = {}

class UserProfileRequest(BaseModel):
    patient_name: Optional[str] = None
    family_contacts: Optional[list] = None
    medical_history: Optional[str] = None
    emergency_contacts: Optional[list] = None
    medications: Optional[list] = None
    allergies: Optional[list] = None

class MicrophoneSettingsRequest(BaseModel):
    sensitivity: float  # 0.0-1.0

class PatientSettingsRequest(BaseModel):
    patient_id: str = "patient-main"
    wake_word_sensitivity: str = "medium"  # low, medium, high
    voice_speed: str = "normal"  # slow, normal, fast
    auto_answer_family_calls: bool = False
    quiet_hours_start: str = "22:00"
    quiet_hours_end: str = "08:00"

# Contact Management Request Models
class AddContactRequest(BaseModel):
    contact_id: Optional[str] = None
    name: str
    phone: Optional[str] = None
    email: Optional[str] = None
    relationship: str = "other"
    contact_type: str = "family"  # family, emergency, healthcare_provider
    is_video_capable: bool = True

class AddPatientRequest(BaseModel):
    patient_id: Optional[str] = None
    name: str
    email: str
    age: Optional[int] = None
    medical_history: Optional[str] = None

class AddGuardianRequest(BaseModel):
    guardian_id: Optional[str] = None
    name: str
    email: str
    role: str = "guardian"
    phone: Optional[str] = None

class LinkGuardianRequest(BaseModel):
    guardian_id: str
    patient_id: str

class AddPatientContactRequest(BaseModel):
    patient_id: str
    contact_id: str
    contact_type: str = "family"  # family, emergency, other

class InitiateContactCallRequest(BaseModel):
    initiator_id: str
    initiator_name: str
    initiator_role: str = "user"
    contact_id: str
    contact_name: str
    call_type: str = "video"  # video, audio

# Device Pairing Models
class DeviceRegisterRequest(BaseModel):
    device_serial: str  # Unique hardware identifier

class DeviceRegisterResponse(BaseModel):
    device_id: str
    status: str

class DevicePairRequest(BaseModel):
    device_id: str
    pairing_code: str

class DevicePairResponse(BaseModel):
    success: bool
    patient_id: Optional[str] = None
    patient_name: Optional[str] = None
    room_number: Optional[str] = None
    message: str

class DeviceIdentityResponse(BaseModel):
    patient_id: str
    patient_name: str
    room_number: Optional[str] = None
    settings: Dict[str, Any]
    contacts: List[Dict[str, Any]]

# Per-patient state management
patient_states: Dict[str, "SystemState"] = {}

def get_patient_state(patient_id: str) -> "SystemState":
    """Get or create a SystemState for a specific patient."""
    if patient_id not in patient_states:
        patient_states[patient_id] = SystemState()
    return patient_states[patient_id]

# Device registry (in-memory, synced with Supabase)
device_registry: Dict[str, Dict[str, Any]] = {}  # device_id -> {patient_id, device_serial}

# Lifespan
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    
    # Reset and reinitialize Supabase client with fresh env vars
    from supabase_client import reset_supabase_client, get_supabase
    reset_supabase_client()
    try:
        get_supabase()  # Force initialization with service_role key
    except Exception as e:
        logger.warning(f"Supabase not configured: {e}")
    
    await voice_service.start()
    await data_fetcher.start()
    await reminder_manager.start_monitoring()
    
    # Register conversation broadcast callback for real-time updates
    set_broadcast_callback(state.broadcast_conversation_update)
    
    # Initialize sample contacts for demo
    contact_manager.add_contact(
        "mom-1", "Mom", phone="555-123-4567",
        relationship="mother", contact_type="family", is_video_capable=True
    )
    contact_manager.add_contact(
        "dad-1", "Dad", phone="555-234-5678",
        relationship="father", contact_type="family", is_video_capable=True
    )
    contact_manager.add_contact(
        "sarah-1", "Sarah", phone="555-345-6789",
        relationship="daughter", contact_type="family", is_video_capable=True
    )
    contact_manager.add_contact(
        "john-1", "John", phone="555-456-7890",
        relationship="son", contact_type="family", is_video_capable=True
    )
    contact_manager.add_contact(
        "doctor-1", "Dr. Smith", phone="555-111-0000",
        relationship="doctor", contact_type="emergency", is_video_capable=True
    )
    contact_manager.add_contact(
        "nurse-1", "Nurse Station", phone="555-999-0000",
        relationship="nurse", contact_type="emergency", is_video_capable=True
    )
    
    # Initialize default user profile with family contacts
    state.user_profile = {
        "name": "Patient",
        "family_contacts": [
            {"name": "Mom", "phone": "555-123-4567", "relationship": "mother"},
            {"name": "Dad", "phone": "555-234-5678", "relationship": "father"},
            {"name": "Sarah", "phone": "555-345-6789", "relationship": "daughter"},
            {"name": "John", "phone": "555-456-7890", "relationship": "son"},
        ],
        "emergency_contacts": [
            {"name": "Dr. Smith", "phone": "555-111-0000", "relationship": "doctor"},
            {"name": "Nurse Station", "phone": "555-999-0000", "relationship": "nurse"},
        ]
    }
    
    # Register reminder callback with TTS announcement
    async def on_reminder_triggered(reminder):
        # Create announcement message
        announcement = f"Reminder: {reminder.title}."
        if reminder.description:
            announcement += f" {reminder.description}"
        
        state.last_response = announcement
        state.assistant_state = "speaking"
        
        # Generate TTS audio for the reminder
        try:
            audio_base64 = await voice_service.text_to_speech(announcement)
            if audio_base64:
                state.last_audio = audio_base64
        except Exception as tts_error:
            print(f"TTS error for reminder: {tts_error}")
        
        # Set pending command so frontend knows to display/play reminder
        state.pending_command = {
            "intent": "reminder_alert",
            "slots": {
                "reminder_id": reminder.id,
                "title": reminder.title,
                "description": reminder.description
            }
        }
        
        await state.broadcast_update()
        
        # Reset assistant state after a delay
        await asyncio.sleep(3)
        state.assistant_state = "idle"
        state.pending_command = None
        await state.broadcast_update()
    
    reminder_manager.register_callback(on_reminder_triggered)
    
    # Start call cleanup background task
    cleanup_task = asyncio.create_task(cleanup_old_calls())
    
    yield
    # Shutdown
    cleanup_task.cancel()
    try:
        await cleanup_task
    except asyncio.CancelledError:
        pass
    await voice_service.stop()
    await data_fetcher.stop()
    await reminder_manager.stop_monitoring()
    conferencing_service.cleanup()

app = FastAPI(lifespan=lifespan)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================================================
# DEVICE PAIRING AND IDENTITY ENDPOINTS
# ============================================================================

@app.post("/api/device/register", response_model=DeviceRegisterResponse)
async def register_device(request: DeviceRegisterRequest):
    """Register a new CLAIRE device. Returns a unique device_id."""
    device_id = str(uuid.uuid4())
    
    # Store in memory (this would also go to Supabase devices table)
    device_registry[device_id] = {
        "device_serial": request.device_serial,
        "patient_id": None,
        "registered_at": datetime.utcnow().isoformat()
    }
    
    if is_supabase_configured():
        try:
            get_supabase().table("devices").insert({
                "id": device_id,
                "device_serial": request.device_serial,
                "is_online": True
            }).execute()
        except Exception as e:
            logger.error(f"Failed to save device to Supabase: {e}")
    
    return DeviceRegisterResponse(device_id=device_id, status="registered")


@app.post("/api/device/pair", response_model=DevicePairResponse)
async def pair_device(request: DevicePairRequest):
    """Pair a device with a patient using their pairing code."""
    
    if not is_supabase_configured():
        # Demo mode - use default patient
        patient_id = "demo-patient-" + request.pairing_code
        device_registry[request.device_id] = {
            "patient_id": patient_id,
            "paired_at": datetime.utcnow().isoformat()
        }
        return DevicePairResponse(
            success=True,
            patient_id=patient_id,
            patient_name="Demo Patient",
            room_number="101",
            message="Paired in demo mode"
        )
    
    # Verify pairing code in Supabase
    patient = await PatientDB.verify_pairing_code(request.pairing_code)
    
    if not patient:
        return DevicePairResponse(
            success=False,
            message="Invalid or expired pairing code"
        )
    
    # Update patient with device_id
    try:
        get_supabase().table("patients").update({
            "device_id": request.device_id,
            "pairing_code": None,  # Clear code after use
            "pairing_code_expires_at": None
        }).eq("id", patient["id"]).execute()
        
        # Create or update device in registry (upsert)
        try:
            get_supabase().table("devices").upsert({
                "id": request.device_id,
                "patient_id": patient["id"],
                "is_online": True,
                "device_type": "tablet",
                "last_seen": datetime.utcnow().isoformat()
            }).execute()
        except Exception as device_err:
            # Device table update is optional - log but don't fail
            logger.warning(f"Failed to update devices table: {device_err}")
        
        # Store in memory
        device_registry[request.device_id] = {
            "patient_id": patient["id"],
            "paired_at": datetime.utcnow().isoformat()
        }
        
        return DevicePairResponse(
            success=True,
            patient_id=patient["id"],
            patient_name=patient["name"],
            room_number=patient.get("room_number"),
            message=f"Successfully paired with {patient['name']}"
        )
    except Exception as e:
        logger.error(f"Failed to pair device: {e}")
        return DevicePairResponse(
            success=False,
            message="Failed to complete pairing"
        )


@app.get("/api/device/identity")
async def get_device_identity(x_device_id: str = Header(None)):
    """Get the patient identity for a paired device."""
    
    if not x_device_id:
        raise HTTPException(status_code=400, detail="X-Device-Id header required")
    
    # Check memory first
    device_info = device_registry.get(x_device_id)
    
    if not device_info or not device_info.get("patient_id"):
        # Try Supabase
        if is_supabase_configured():
            try:
                patient = await PatientDB.get_by_device_id(x_device_id)
                if patient:
                    device_info = {"patient_id": patient["id"]}
                    device_registry[x_device_id] = device_info
            except Exception as e:
                logger.error(f"Error looking up device: {e}")
        
        if not device_info or not device_info.get("patient_id"):
            raise HTTPException(status_code=404, detail="Device not paired")
    
    patient_id = device_info["patient_id"]
    
    # Get patient info
    patient = None
    settings = {}
    contacts = []
    
    if is_supabase_configured():
        try:
            patient = await PatientDB.get_by_id(patient_id)
            settings_data = await PatientSettingsDB.get(patient_id)
            if settings_data:
                settings = settings_data
            contacts_data = await ContactsDB.get_all(patient_id)
            if contacts_data:
                contacts = contacts_data
        except Exception as e:
            logger.error(f"Error fetching patient data: {e}")
    
    if not patient:
        # Demo mode
        patient = {"id": patient_id, "name": "Demo Patient", "room_number": "101"}
    
    return {
        "patient_id": patient["id"],
        "patient_name": patient["name"],
        "room_number": patient.get("room_number"),
        "settings": settings,
        "contacts": contacts
    }


@app.post("/api/device/unpair")
async def unpair_device(x_device_id: str = Header(None)):
    """Unpair a device from its patient (admin function)."""
    if not x_device_id:
        raise HTTPException(status_code=400, detail="X-Device-Id header required")
    
    if x_device_id in device_registry:
        patient_id = device_registry[x_device_id].get("patient_id")
        del device_registry[x_device_id]
        
        if is_supabase_configured() and patient_id:
            try:
                get_supabase().table("patients").update({
                    "device_id": None
                }).eq("id", patient_id).execute()
                
                get_supabase().table("devices").update({
                    "patient_id": None,
                    "is_online": False
                }).eq("id", x_device_id).execute()
            except Exception as e:
                logger.error(f"Error unpairing in Supabase: {e}")
    
    return {"success": True, "message": "Device unpaired"}


async def get_current_patient_id(x_device_id: str = Header(None)) -> str:
    """Dependency to extract patient ID from device."""
    if not x_device_id:
        return "patient-main"  # Fallback for backwards compatibility
    
    device_info = device_registry.get(x_device_id)
    if device_info and device_info.get("patient_id"):
        return device_info["patient_id"]
    
    if is_supabase_configured():
        try:
            patient = await PatientDB.get_by_device_id(x_device_id)
            if patient:
                return patient["id"]
        except Exception:
            pass
    
    return "patient-main"


# Routes
@app.get("/api/status")
async def get_status():
    return {
        "assistant_enabled": state.assistant_enabled,
        "assistant_state": state.assistant_state,
        "last_transcript": state.last_transcript,
        "last_intent": state.last_intent,
        "last_response": state.last_response,
        "last_audio": state.last_audio,
        "call_state": state.call_state,
        "last_error": state.last_error,
        "microphone_sensitivity": state.microphone_sensitivity,
        "pending_command": state.pending_command,
        "active_call_info": state.active_call_info,
    }

@app.get("/api/ice-servers")
async def get_ice_servers():
    """Get ICE server configuration for WebRTC connections."""
    return {
        "iceServers": [
            {"urls": "stun:stun.l.google.com:19302"},
            {"urls": "stun:stun1.l.google.com:19302"},
            {
                "urls": TURN_SERVER_URL,
                "username": TURN_SERVER_USERNAME,
                "credential": TURN_SERVER_CREDENTIAL,
            },
            {
                "urls": TURN_SERVER_URL.replace(":443", ":80"),
                "username": TURN_SERVER_USERNAME,
                "credential": TURN_SERVER_CREDENTIAL,
            },
            {
                "urls": TURN_SERVER_URL + "?transport=tcp",
                "username": TURN_SERVER_USERNAME,
                "credential": TURN_SERVER_CREDENTIAL,
            },
        ]
    }

@app.post("/api/command")
async def handle_command(request: CommandRequest, x_device_id: str = Header(None), patient_id_override: str = None):
    allowed_intents = {
        "check_vitals", "call_nurse", "navigate", "stop",
        "join_call", "mute_call", "unmute_call", "end_call", "answer_call", "reject_call",
        "assistant_enable", "assistant_disable", "assistant_ptt_start", "assistant_ptt_stop",
        "medication_reminder", "schedule_checkup", "call_family", "call_contact", "send_message",
        "set_reminder", "list_reminders", "adjust_volume", "enhance_microphone",
        "weather", "time", "date", "news", "emergency",
        "room_service", "pain_assessment", "mood_check", "health_tips", "medication_taken",
        "toggle_camera", "share_screen", "switch_mode", "show_contacts", "add_contact", "remove_contact", "cancel_reminder",
        "generate_invite_code"
    }

    if request.intent not in allowed_intents:
        raise HTTPException(status_code=400, detail=f"Invalid intent: {request.intent}")
    
    # Get patient ID - prefer override (from programmatic call) over header
    patient_id = patient_id_override or await get_current_patient_id(x_device_id)

    try:
        if request.intent == "assistant_enable":
            state.assistant_enabled = True
            await voice_service.enable()
        elif request.intent == "assistant_disable":
            state.assistant_enabled = False
            await voice_service.disable()
        elif request.intent == "assistant_ptt_start":
            await voice_service.start_ptt()
        elif request.intent == "assistant_ptt_stop":
            await voice_service.stop_ptt()
        elif request.intent == "join_call":
            room = request.slots.get("room", DEFAULT_ROOM) if request.slots else DEFAULT_ROOM
            # Use new video API - this will be handled by frontend calling /api/video/join
            state.last_response = f"Initiating video call to {room}. Please accept the connection."
        elif request.intent == "mute_call":
            # Frontend will call POST /api/video/mute directly
            state.last_response = "Microphone muted"
        elif request.intent == "unmute_call":
            # Frontend will call POST /api/video/unmute directly
            state.last_response = "Microphone unmuted"
        elif request.intent == "end_call":
            # Frontend will call POST /api/video/end directly
            state.last_response = "Video call ended"
            state.call_state = "not_in_call"
            state.active_call_info = None
        elif request.intent == "answer_call":
            # Answer an incoming call - frontend handles WebRTC
            call_id = request.slots.get("call_id") if request.slots else None
            if call_id and call_id in incoming_calls:
                incoming_call = incoming_calls[call_id]
                incoming_call.answered = True
                state.call_state = "in_call"
                state.last_response = f"Answering call from {incoming_call.initiator_name}"
                state.pending_command = {
                    "intent": "join_call",
                    "slots": {"room": incoming_call.room_id, "call_id": call_id}
                }
            else:
                state.last_response = "Answering the call"
        elif request.intent == "reject_call":
            # Reject an incoming call
            call_id = request.slots.get("call_id") if request.slots else None
            if call_id and call_id in incoming_calls:
                incoming_calls[call_id].rejected = True
                state.last_response = f"Call declined"
            else:
                state.last_response = "Call declined"
        elif request.intent == "toggle_camera":
            state.last_response = "Camera toggled"
        elif request.intent == "share_screen":
            state.last_response = "Screen sharing toggled"
        elif request.intent == "check_vitals":
            await robot_actions.check_vitals()
        elif request.intent == "call_nurse":
            state.last_response = "Calling the nurse station. Please wait for connection."
            await robot_actions.call_nurse()
        elif request.intent == "call_family":
            contact_name = request.slots.get("contact_name") if request.slots else "family"
            
            # Find the contact using fuzzy matching
            found_contact = contact_manager.get_contact_by_name(contact_name)
            
            if not found_contact:
                # Try to find similar contacts
                similar_contacts = contact_manager.find_contacts_by_fuzzy_name(contact_name, limit=3)
                if similar_contacts:
                    names = ", ".join([c.name for c in similar_contacts])
                    state.last_response = f"I couldn't find {contact_name} in your contacts. Did you mean one of these: {names}?"
                else:
                    state.last_response = f"I couldn't find anyone named {contact_name} in your contacts. You can say 'show my contacts' to see who's available."
                return {"status": "contact_not_found", "message": state.last_response}
            
            # Create a call room and initiate call
            call_id = str(uuid.uuid4())
            room_id = f"call-{found_contact.name.lower().replace(' ', '-')}-{call_id[:8]}"
            
            # Create an incoming call notification for the contact
            incoming_call = IncomingCall(
                call_id=call_id,
                initiator_id="patient-self",
                initiator_name="Patient",
                initiator_role="Patient",
                patient_id=found_contact.id,
                room_id=room_id
            )
            incoming_calls[call_id] = incoming_call
            
            if found_contact.id not in pending_notifications:
                pending_notifications[found_contact.id] = []
            pending_notifications[found_contact.id].append(call_id)
            
            # Log notification (placeholder for actual SMS/email)
            print(f"[NOTIFICATION] Sending call notification to {found_contact.name} (ID: {found_contact.id})")
            print(f"[NOTIFICATION] Call link: /family-call?room={room_id}&token={call_id}")
            
            state.last_response = f"Calling {found_contact.name} now. The video call will connect shortly."
            state.call_state = "connecting"
            state.pending_command = {
                "intent": "join_call",
                "slots": {"room_id": room_id, "call_id": call_id, "contact_name": found_contact.name}
            }
            
        elif request.intent == "call_contact":
            contact_name = request.slots.get("contact_name") if request.slots else "contact"
            video_call = request.slots.get("video_call", True) if request.slots else True
            
            # Find the contact using fuzzy matching
            found_contact = contact_manager.get_contact_by_name(contact_name)
            
            if not found_contact:
                # Try to find similar contacts
                similar_contacts = contact_manager.find_contacts_by_fuzzy_name(contact_name, limit=3)
                if similar_contacts:
                    names = ", ".join([c.name for c in similar_contacts])
                    state.last_response = f"I couldn't find {contact_name} in your contacts. Did you mean one of these: {names}?"
                else:
                    state.last_response = f"I couldn't find anyone named {contact_name} in your contacts. You can say 'show my contacts' to see who's available."
                return {"status": "contact_not_found", "message": state.last_response}
            
            # Create a call room and initiate call
            call_id = str(uuid.uuid4())
            room_id = f"call-{found_contact.name.lower().replace(' ', '-')}-{call_id[:8]}"
            
            # Create an incoming call notification for the contact
            incoming_call = IncomingCall(
                call_id=call_id,
                initiator_id="patient-self",
                initiator_name="Patient",
                initiator_role="Patient",
                patient_id=found_contact.id,
                room_id=room_id
            )
            incoming_calls[call_id] = incoming_call
            
            if found_contact.id not in pending_notifications:
                pending_notifications[found_contact.id] = []
            pending_notifications[found_contact.id].append(call_id)
            
            # Log notification (placeholder for actual SMS/email)
            print(f"[NOTIFICATION] Sending call notification to {found_contact.name} (ID: {found_contact.id})")
            print(f"[NOTIFICATION] Call link: /family-call?room={room_id}&token={call_id}")
            if found_contact.email:
                print(f"[NOTIFICATION] Email would be sent to: {found_contact.email}")
            if found_contact.phone:
                print(f"[NOTIFICATION] SMS would be sent to: {found_contact.phone}")
            
            state.last_response = f"Calling {found_contact.name} now. I'm notifying them to join the video call."
            state.call_state = "connecting"
            
            # Store call info for frontend to pick up
            state.pending_command = {
                "intent": "join_call",
                "slots": {"room_id": room_id, "call_id": call_id, "contact_name": found_contact.name, "video_call": video_call}
            }
        elif request.intent == "navigate":
            destination = request.slots.get("destination") if request.slots else None
            await robot_actions.navigate(destination)
        elif request.intent == "stop":
            await robot_actions.stop()
        elif request.intent == "weather":
            location = request.slots.get("location") if request.slots else None
            weather_data = await data_fetcher.get_weather(location)
            state.last_response = f"Weather in {weather_data.get('location', 'your area')}: {weather_data.get('description', 'unavailable')}, {weather_data.get('temperature', 'N/A')}°C"
        elif request.intent == "time":
            time_data = data_fetcher.get_current_time()
            state.last_response = f"The current time is {time_data['formatted']}"
        elif request.intent == "date":
            date_data = data_fetcher.get_current_date()
            state.last_response = f"Today is {date_data['date']}"
        elif request.intent == "news":
            category = request.slots.get("category", "health") if request.slots else "health"
            news_data = await data_fetcher.get_news(category)
            if news_data.get("articles"):
                headlines = "; ".join([a["title"] for a in news_data["articles"][:2]])
                state.last_response = f"Latest {category} news: {headlines}"
            else:
                state.last_response = "Could not fetch news at this time"
        elif request.intent == "enhance_microphone":
            level = request.slots.get("sensitivity_level", 0.8) if request.slots else 0.8
            state.microphone_sensitivity = min(1.0, max(0.0, level))
            state.last_response = f"Microphone sensitivity enhanced to {int(state.microphone_sensitivity * 100)}%"
        elif request.intent == "adjust_volume":
            level = request.slots.get("level", 0.7) if request.slots else 0.7
            state.last_response = f"Volume adjusted to {int(level * 100)}%"
        elif request.intent == "emergency":
            state.last_response = "Emergency services contacted. Help is on the way."
            # TODO: Implement actual emergency notification
        elif request.intent == "room_service":
            service_type = request.slots.get("service_type") if request.slots else "assistance"
            await robot_actions.room_service_request(service_type)
        elif request.intent == "pain_assessment":
            pain_level = request.slots.get("pain_level") if request.slots else None
            if pain_level:
                state.last_response = f"Thank you for letting me know your pain level is {pain_level}. I'll notify your nurse right away for pain management assistance."
            else:
                state.last_response = "I'm sorry you're experiencing pain. On a scale of 1-10, with 10 being the worst pain imaginable, how would you rate your pain right now?"
        elif request.intent == "mood_check":
            mood_state = request.slots.get("mood_state") if request.slots else None
            if mood_state:
                state.last_response = f"I appreciate you sharing that you're feeling {mood_state}. Remember, it's normal to have different feelings during recovery. Would you like me to call someone to talk to, or would you prefer some relaxation techniques?"
            else:
                state.last_response = "How are you feeling today? I'm here to listen and support you."
        elif request.intent == "health_tips":
            await robot_actions.provide_health_tips()
        elif request.intent == "medication_taken":
            medication_name = request.slots.get("medication_name") if request.slots else "medication"
            await robot_actions.take_medication_reminder(medication_name)
        elif request.intent == "list_reminders":
            reminders = reminder_manager.get_upcoming_reminders()
            if reminders:
                reminder_list = "; ".join([r.title for r in reminders[:3]])
                state.last_response = f"Upcoming reminders: {reminder_list}"
            else:
                state.last_response = "No upcoming reminders"
        elif request.intent == "set_reminder":
            # Voice-based reminder creation with proper time parsing
            title = request.slots.get("reminder_text") if request.slots else "Reminder"
            description = request.slots.get("description", "") if request.slots else ""
            reminder_type = request.slots.get("reminder_type", "custom") if request.slots else "custom"
            time_str = request.slots.get("time") if request.slots else None
            frequency_str = request.slots.get("frequency", "once") if request.slots else "once"
            
            # Parse time from voice command
            from datetime import timedelta as td
            import re
            scheduled_time = None
            
            if time_str:
                time_str = time_str.lower().strip()
                now = datetime.now()
                
                # Parse relative times like "in 5 minutes", "in 1 hour"
                relative_match = re.search(r'in\s+(\d+)\s+(minute|hour|min|hr)', time_str)
                if relative_match:
                    amount = int(relative_match.group(1))
                    unit = relative_match.group(2)
                    if 'hour' in unit or unit == 'hr':
                        scheduled_time = now + td(hours=amount)
                    else:
                        scheduled_time = now + td(minutes=amount)
                else:
                    # Parse absolute times like "2 PM", "14:30", "2:30 PM"
                    time_patterns = [
                        (r'(\d{1,2}):(\d{2})\s*(am|pm)', lambda m: (int(m.group(1)) % 12 + (12 if m.group(3) == 'pm' else 0), int(m.group(2)))),
                        (r'(\d{1,2})\s*(am|pm)', lambda m: (int(m.group(1)) % 12 + (12 if m.group(2) == 'pm' else 0), 0)),
                        (r'(\d{1,2}):(\d{2})', lambda m: (int(m.group(1)), int(m.group(2)))),
                    ]
                    
                    for pattern, extractor in time_patterns:
                        match = re.search(pattern, time_str)
                        if match:
                            hour, minute = extractor(match)
                            scheduled_time = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
                            # If time is in the past, schedule for tomorrow
                            if scheduled_time <= now:
                                scheduled_time += td(days=1)
                            break
            
            # Default to 1 hour from now if no time parsed
            if not scheduled_time:
                scheduled_time = datetime.now() + td(hours=1)
            
            try:
                reminder_id = reminder_manager.add_reminder(
                    title=title,
                    description=description,
                    scheduled_time=scheduled_time,
                    reminder_type=ReminderType(reminder_type.lower()) if reminder_type.lower() in ['medication', 'appointment', 'custom', 'vital_check'] else ReminderType.CUSTOM,
                    frequency=ReminderFrequency(frequency_str.lower()) if frequency_str.lower() in ['once', 'daily', 'weekly', 'monthly'] else ReminderFrequency.ONCE
                )
                time_display = scheduled_time.strftime('%I:%M %p')
                if scheduled_time.date() != datetime.now().date():
                    time_display = scheduled_time.strftime('%B %d at %I:%M %p')
                state.last_response = f"OK! I've set a reminder for '{title}' at {time_display}. I'll let you know when it's time."
            except Exception as e:
                state.last_response = f"I had trouble setting that reminder: {str(e)}"
        
        elif request.intent == "cancel_reminder":
            # Cancel a reminder by text/description
            reminder_text = request.slots.get("reminder_text", "") if request.slots else ""
            reminders = reminder_manager.get_upcoming_reminders()
            
            if not reminders:
                state.last_response = "You don't have any reminders to cancel."
            else:
                # Find matching reminder
                reminder_text_lower = reminder_text.lower().strip()
                found_reminder = None
                
                for r in reminders:
                    if reminder_text_lower in r.title.lower() or r.title.lower() in reminder_text_lower:
                        found_reminder = r
                        break
                
                if found_reminder:
                    reminder_manager.delete_reminder(found_reminder.id)
                    state.last_response = f"OK, I've cancelled your '{found_reminder.title}' reminder."
                else:
                    # List available reminders for user to choose
                    reminder_list = ", ".join([r.title for r in reminders[:3]])
                    state.last_response = f"I couldn't find a reminder matching '{reminder_text}'. Your current reminders are: {reminder_list}"
        
        elif request.intent == "show_contacts":
            # Show contacts list - set a pending command for the frontend
            state.pending_command = {"intent": "show_contacts", "slots": {}}
            contacts = contact_manager.list_contacts()
            if contacts:
                contact_names = ", ".join([c.name for c in contacts[:5]])
                state.last_response = f"Here are your contacts: {contact_names}. I'm displaying them on screen for you."
            else:
                state.last_response = "You don't have any contacts saved yet. Would you like me to add one?"
        
        elif request.intent == "add_contact":
            # Add a new contact via voice
            contact_name = request.slots.get("contact_name") if request.slots else None
            phone = request.slots.get("phone") if request.slots else None
            relationship = request.slots.get("relationship", "family") if request.slots else "family"
            
            if not contact_name:
                state.last_response = "What's the name of the contact you want to add?"
            else:
                contact_id = str(uuid.uuid4())[:8]
                contact_manager.add_contact(
                    contact_id=contact_id,
                    name=contact_name,
                    phone=phone,
                    relationship=relationship,
                    contact_type="family",
                    is_video_capable=True
                )
                if phone:
                    state.last_response = f"Done! I've added {contact_name} with phone number {phone} to your contacts."
                else:
                    state.last_response = f"Done! I've added {contact_name} to your contacts. You can call them anytime."
        
        elif request.intent == "remove_contact":
            # Remove a contact by name
            contact_name = request.slots.get("contact_name") if request.slots else None
            
            if not contact_name:
                state.last_response = "Which contact would you like to remove?"
            else:
                contact = contact_manager.get_contact_by_name(contact_name)
                if contact:
                    contact_manager.delete_contact(contact.id)
                    state.last_response = f"OK, I've removed {contact.name} from your contacts."
                else:
                    state.last_response = f"I couldn't find a contact named '{contact_name}'. Say 'show my contacts' to see who you have saved."
        
        elif request.intent == "switch_mode":
            # Switch Claire's display mode
            mode_name = request.slots.get("mode_name", "chat") if request.slots else "chat"
            valid_modes = ["chat", "face", "ambient", "sleep", "emergency", "companion", "photo"]
            
            # Normalize mode name
            mode_name = mode_name.lower().strip()
            
            # Handle aliases
            mode_aliases = {
                "normal": "chat", "dashboard": "chat", "home": "chat",
                "night": "sleep", "dim": "sleep", "dark": "sleep", "goodnight": "sleep",
                "clock": "ambient", "smart display": "ambient", "display": "ambient",
                "photos": "photo", "picture": "photo", "pictures": "photo", "photo frame": "photo", "frame": "photo",
                "help": "emergency", "sos": "emergency",
                "talk": "companion", "chat with me": "companion", "friend": "companion",
                "claire": "face", "your face": "face", "show yourself": "face"
            }
            mode_name = mode_aliases.get(mode_name, mode_name)
            
            if mode_name not in valid_modes:
                state.last_response = f"I don't recognize '{mode_name}' mode. Available modes are: chat, face, ambient, sleep, emergency, companion, and photo."
            else:
                # Mode-specific responses
                mode_responses = {
                    "chat": "Switching to chat mode.",
                    "face": "Here I am!",
                    "ambient": "Switching to ambient mode. I'll show you the time and weather.",
                    "sleep": "Switching to sleep mode. Goodnight! Just say 'Claire' if you need me.",
                    "emergency": "Switching to emergency mode. Quick call buttons are now available.",
                    "companion": "Switching to companion mode. I'm here to chat with you!",
                    "photo": "Switching to photo frame mode. Enjoy your memories!"
                }
                state.last_response = mode_responses.get(mode_name, f"Switching to {mode_name} mode.")
                state.pending_command = {
                    "intent": "switch_mode",
                    "slots": {"mode_name": mode_name}
                }
        
        elif request.intent == "generate_invite_code":
            # Generate a 6-digit pairing code for family members
            if is_supabase_configured() and patient_id:
                try:
                    code = await PatientDB.generate_pairing_code(patient_id)
                    if code:
                        state.last_response = f"Here's your family pairing code: {code}. It's valid for 24 hours. Give this code to your family member so they can connect their device."
                        state.pending_command = {
                            "intent": "generate_invite_code",
                            "slots": {"code": code}
                        }
                    else:
                        state.last_response = "I'm sorry, I couldn't generate a pairing code right now. Please try again."
                except Exception as e:
                    logger.error(f"Error generating invite code: {e}")
                    state.last_response = "I'm sorry, there was an error generating the pairing code."
            else:
                # In-memory fallback
                import random
                code = ''.join([str(random.randint(0, 9)) for _ in range(6)])
                patient_invite_codes[code] = patient_id
                state.last_response = f"Here's your family pairing code: {code}. It's valid for 24 hours."

        await state.broadcast_update()
        
        # Log activity to Supabase
        if is_supabase_configured() and patient_id:
            try:
                # Log important intents
                loggable_intents = {
                    "call_nurse": "Called nurse station",
                    "call_family": f"Called family member",
                    "call_contact": f"Called contact: {request.slots.get('contact_name', 'unknown') if request.slots else 'unknown'}",
                    "emergency": "Emergency button pressed",
                    "check_vitals": "Requested vitals check",
                    "set_reminder": f"Set reminder: {request.slots.get('reminder_text', '') if request.slots else ''}",
                    "medication_taken": "Confirmed medication taken",
                    "switch_mode": f"Switched mode to {request.slots.get('mode_name', 'unknown') if request.slots else 'unknown'}",
                    "pain_assessment": "Started pain assessment",
                    "mood_check": "Completed mood check",
                    "generate_invite_code": "Generated family pairing code",
                }
                if request.intent in loggable_intents:
                    description = loggable_intents[request.intent]
                    await ActivityLogDB.log(
                        patient_id=patient_id,
                        activity_type=f"command_{request.intent}",
                        description=description,
                        metadata={"intent": request.intent, "slots": request.slots}
                    )
            except Exception as log_error:
                logger.warning(f"Failed to log activity: {log_error}")
        
        return {"success": True, "message": f"Executed {request.intent}"}

    except Exception as e:
        state.last_error = str(e)
        await state.broadcast_update()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/text-command")
async def handle_text_command(request: TextCommandRequest, x_device_id: str = Header(None)):
    if not state.assistant_enabled:
        raise HTTPException(status_code=400, detail="Assistant is not enabled.")
    
    try:
        # Get patient ID from device header
        patient_id = await get_current_patient_id(x_device_id)
        
        # Process command with patient context
        await voice_service.process_text_command(request.text, patient_id=patient_id)
        
        if state.pending_command:
            cmd = state.pending_command
            intent = cmd["intent"]
            slots = cmd.get("slots", {})
            
            # Execute the command using the command handler, passing patient_id
            cmd_req = CommandRequest(intent=intent, slots=slots)
            await handle_command(cmd_req, patient_id_override=patient_id)
            
            # Commands that require frontend action should NOT be cleared here
            # The frontend will clear them via /api/clear-pending-command
            frontend_action_commands = ["switch_mode", "show_contacts", "incoming_call", "call_family", "answer_call", "join_call", "end_call", "mute_call", "unmute_call", "toggle_camera", "call_nurse"]
            if intent not in frontend_action_commands:
                state.pending_command = None
        
        # Broadcast update so WebSocket listeners also get the pending command
        await state.broadcast_update()
        
        # Return full response with text and audio for immediate playback
        return {
            "success": True, 
            "message": "Text command processed.",
            "response": state.last_response,
            "audio": state.last_audio,
            "intent": state.last_intent,
            "pending_command": state.pending_command  # Include pending command in response
        }
    except Exception as e:
        state.last_error = str(e)
        await state.broadcast_update()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/clear-pending-command")
async def clear_pending_command():
    """Clear the pending command from state."""
    state.pending_command = None
    await state.broadcast_update()
    return {"success": True, "message": "Pending command cleared."}

@app.post("/api/reminders")
async def create_reminder(request: ReminderRequest, x_device_id: str = Header(None)):
    """Create a new reminder."""
    patient_id = await get_current_patient_id(x_device_id)
    
    try:
        scheduled_time = datetime.fromisoformat(request.scheduled_time)
        frequency = ReminderFrequency(request.frequency.lower())
        reminder_type = ReminderType(request.reminder_type.lower())
        
        # Store in Supabase if configured
        if is_supabase_configured():
            reminder = await RemindersDB.create(
                patient_id=patient_id,
                title=request.title,
                reminder_type=request.reminder_type,
                scheduled_time=scheduled_time.strftime("%H:%M"),
                is_active=True
            )
            if reminder:
                # Log activity
                await ActivityLogDB.log(patient_id, "reminder_created", f"Created reminder: {request.title}")
                return {"success": True, "reminder_id": reminder.get("id")}
        
        # Fallback to in-memory
        reminder_id = reminder_manager.add_reminder(
            title=request.title,
            description=request.description,
            scheduled_time=scheduled_time,
            reminder_type=reminder_type,
            frequency=frequency,
            metadata=request.metadata
        )
        
        return {"success": True, "reminder_id": reminder_id}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/reminders")
async def get_reminders(x_device_id: str = Header(None)):
    """Get all reminders for the current patient."""
    patient_id = await get_current_patient_id(x_device_id)
    
    # Try Supabase first
    if is_supabase_configured():
        try:
            reminders = await RemindersDB.get_all(patient_id)
            return {"reminders": reminders}
        except Exception as e:
            logger.error(f"Error fetching reminders from Supabase: {e}")
    
    # Fallback to in-memory
    reminders = reminder_manager.get_all_reminders()
    return {"reminders": [r.to_dict() for r in reminders]}

@app.get("/api/reminders/upcoming")
async def get_upcoming_reminders(hours_ahead: int = 24):
    """Get upcoming reminders."""
    reminders = reminder_manager.get_upcoming_reminders(hours_ahead)
    return {"reminders": [r.to_dict() for r in reminders], "hours_ahead": hours_ahead}

@app.post("/api/user-profile")
async def update_user_profile(request: UserProfileRequest):
    """Update user/patient profile."""
    if request.patient_name:
        state.user_profile["patient_name"] = request.patient_name
    if request.family_contacts:
        state.user_profile["family_contacts"] = request.family_contacts
    if request.medical_history:
        state.user_profile["medical_history"] = request.medical_history
    if request.emergency_contacts:
        state.user_profile["emergency_contacts"] = request.emergency_contacts
    if request.medications:
        state.user_profile["medications"] = request.medications
    if request.allergies:
        state.user_profile["allergies"] = request.allergies
    
    await state.broadcast_update()
    return {"success": True, "profile": state.user_profile}

@app.get("/api/user-profile")
async def get_user_profile():
    """Get user profile."""
    return {"profile": state.user_profile}

@app.post("/api/microphone-settings")
async def set_microphone_settings(request: MicrophoneSettingsRequest):
    """Set microphone sensitivity."""
    state.microphone_sensitivity = max(0.0, min(1.0, request.sensitivity))
    await state.broadcast_update()
    return {"success": True, "sensitivity": state.microphone_sensitivity}


# ============================================================================
# PATIENT SETTINGS ENDPOINTS
# ============================================================================

# Store patient settings as JSON files
SETTINGS_DIR = Path(__file__).parent / "patient_settings"
SETTINGS_DIR.mkdir(exist_ok=True)

def get_patient_settings_path(patient_id: str) -> Path:
    """Get the file path for a patient's settings."""
    safe_id = "".join(c for c in patient_id if c.isalnum() or c in "-_")
    return SETTINGS_DIR / f"{safe_id}.json"

def load_patient_settings(patient_id: str) -> dict:
    """Load patient settings from file."""
    path = get_patient_settings_path(patient_id)
    if path.exists():
        with open(path, "r") as f:
            return json.load(f)
    # Return defaults
    return {
        "patient_id": patient_id,
        "wake_word_sensitivity": "medium",
        "voice_speed": "normal",
        "auto_answer_family_calls": False,
        "quiet_hours_start": "22:00",
        "quiet_hours_end": "08:00"
    }

def save_patient_settings(settings: dict) -> None:
    """Save patient settings to file."""
    patient_id = settings.get("patient_id", "patient-main")
    path = get_patient_settings_path(patient_id)
    with open(path, "w") as f:
        json.dump(settings, f, indent=2)

@app.get("/api/patient-settings/{patient_id}")
async def get_patient_settings(patient_id: str):
    """Get patient settings."""
    settings = load_patient_settings(patient_id)
    return {"success": True, "settings": settings}

@app.post("/api/patient-settings")
async def update_patient_settings(request: PatientSettingsRequest):
    """Update patient settings."""
    settings = {
        "patient_id": request.patient_id,
        "wake_word_sensitivity": request.wake_word_sensitivity,
        "voice_speed": request.voice_speed,
        "auto_answer_family_calls": request.auto_answer_family_calls,
        "quiet_hours_start": request.quiet_hours_start,
        "quiet_hours_end": request.quiet_hours_end
    }
    save_patient_settings(settings)
    await state.broadcast_update()
    return {"success": True, "settings": settings}


# ============================================================================
# FAMILY AUTHENTICATION ENDPOINTS
# ============================================================================

# In-memory storage for family accounts (use a database in production)
family_accounts: Dict[str, Dict[str, Any]] = {}
family_sessions: Dict[str, Dict[str, Any]] = {}
patient_invite_codes: Dict[str, str] = {}  # invite_code -> patient_id

class FamilyRegisterRequest(BaseModel):
    name: str
    email: str
    password: str
    relationship: str = "Family Member"
    patient_code: str

class FamilyLoginRequest(BaseModel):
    email: str
    password: str

@app.post("/api/family/register")
async def family_register(request: FamilyRegisterRequest):
    """Register a new family member account using Supabase Auth."""
    
    # Use Supabase if configured
    if is_supabase_configured():
        try:
            # Verify patient invite code first
            patient = await PatientDB.verify_pairing_code(request.patient_code)
            if not patient:
                raise HTTPException(status_code=400, detail="Invalid or expired invite code")
            
            # Create guardian through Supabase Auth (creates auth user + guardian profile)
            result = await AuthHelpers.signup_guardian(
                email=request.email.lower(),
                password=request.password,
                name=request.name,
                relationship=request.relationship
            )
            
            if not result.get("success"):
                error_msg = result.get("error", "Registration failed")
                # Check for common error types
                if "rate limit" in error_msg.lower():
                    raise HTTPException(status_code=429, detail="Too many registration attempts. Please wait a few minutes and try again.")
                elif "already registered" in error_msg.lower() or "already exists" in error_msg.lower():
                    raise HTTPException(status_code=400, detail="This email is already registered. Please login instead.")
                else:
                    raise HTTPException(status_code=400, detail=f"Registration failed: {error_msg}")
            
            guardian_id = result["user"].id if result.get("user") else result["guardian"]["id"]
            
            # Link guardian to patient
            await GuardianDB.link_to_patient(
                guardian_id=guardian_id,
                patient_id=patient["id"],
                is_primary=True
            )
            
            # Log activity
            await ActivityLogDB.log(patient["id"], "guardian_registered", 
                f"New guardian registered: {request.name}")
            
            return {
                "success": True, 
                "message": "Account created successfully",
                "guardian_id": guardian_id
            }
            
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Supabase registration error: {e}")
            raise HTTPException(status_code=500, detail=f"Registration failed: {str(e)}")
    
    # Fallback to in-memory (demo mode only)
    # Check if email already exists
    if request.email.lower() in [acc.get("email", "").lower() for acc in family_accounts.values()]:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Validate patient invite code
    patient_id = patient_invite_codes.get(request.patient_code.upper())
    
    # For demo purposes, accept any code and link to default patient
    if not patient_id:
        patient_id = "patient-main"  # Default patient
    
    # Create account
    family_id = f"family-{uuid.uuid4().hex[:8]}"
    family_accounts[family_id] = {
        "id": family_id,
        "name": request.name,
        "email": request.email.lower(),
        "password": request.password,  # In production, hash this!
        "relationship": request.relationship,
        "patient_id": patient_id,
        "created_at": datetime.now().isoformat(),
    }
    
    return {"success": True, "message": "Account created successfully"}

@app.post("/api/family/login")
async def family_login(request: FamilyLoginRequest):
    """Login as a family member using Supabase Auth."""
    
    # Use Supabase Auth if configured
    supabase_login_failed = False
    if is_supabase_configured():
        try:
            result = await AuthHelpers.login_guardian(
                email=request.email.lower(),
                password=request.password
            )
            
            if result:
                guardian = result.get("guardian")
                patients = result.get("patients", [])
                session = result.get("session")
                
                # Get first patient (or None if not linked to any)
                patient_id = patients[0]["id"] if patients else None
                patient_name = patients[0].get("name", "Unknown") if patients else None
                
                return {
                    "success": True,
                    "token": session.access_token if session else None,
                    "refresh_token": session.refresh_token if session else None,
                    "family_id": guardian.get("id") if guardian else result["user"].id,
                    "name": guardian.get("name") if guardian else request.email.split("@")[0],
                    "patient_id": patient_id,
                    "patient_name": patient_name,
                    "patients": [{"id": p["id"], "name": p["name"], "room_number": p.get("room_number")} 
                                for p in patients],
                    "expires_at": session.expires_at if session else None
                }
            else:
                supabase_login_failed = True
                
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Supabase login error: {e}")
            supabase_login_failed = True
    
    # If Supabase auth failed or not configured, allow demo mode login
    # Users can login with any email using "demo" as password
    if not request.password or (request.password != "demo" and supabase_login_failed):
        # Check in-memory accounts for regular fallback
        account = None
        for acc in family_accounts.values():
            if acc.get("email", "").lower() == request.email.lower():
                account = acc
                break
        
        if not account or account.get("password") != request.password:
            raise HTTPException(status_code=401, detail="Invalid email or password")
    else:
        # Demo mode: allow login with password "demo" or any email when Supabase is not configured
        account = None
        for acc in family_accounts.values():
            if acc.get("email", "").lower() == request.email.lower():
                account = acc
                break
        
        if not account:
            # Try to get the first patient from Supabase for demo mode
            demo_patient_id = "patient-main"
            demo_patient_name = "Patient"
            if is_supabase_configured():
                try:
                    from supabase_client import get_supabase
                    sb = get_supabase()
                    result = sb.table("patients").select("id, name").limit(1).execute()
                    if result.data:
                        demo_patient_id = result.data[0]["id"]
                        demo_patient_name = result.data[0].get("name", "Patient")
                except Exception as e:
                    logger.warning(f"Could not fetch demo patient: {e}")
            
            # Create demo account on-the-fly
            family_id = f"family-{uuid.uuid4().hex[:8]}"
            account = {
                "id": family_id,
                "name": request.email.split("@")[0].title(),
                "email": request.email.lower(),
                "password": request.password,
                "relationship": "Family Member",
                "patient_id": demo_patient_id,
                "patient_name": demo_patient_name,
                "created_at": datetime.now().isoformat(),
            }
            family_accounts[family_id] = account
    
    # Create session token
    token = f"session-{uuid.uuid4().hex}"
    family_sessions[token] = {
        "family_id": account["id"],
        "created_at": datetime.now().isoformat(),
    }
    
    return {
        "success": True,
        "token": token,
        "family_id": account["id"],
        "name": account["name"],
        "patient_id": account["patient_id"],
        "patient_name": account.get("patient_name"),
    }

@app.post("/api/family/logout")
async def family_logout(token: str = ""):
    """Logout family member."""
    if token in family_sessions:
        del family_sessions[token]
    return {"success": True}

@app.get("/api/family/patient/{patient_id}")
async def get_family_patient_data(patient_id: str):
    """Get patient data for family dashboard (read-only)."""
    # In a real app, verify the session token and that family member has access to this patient
    robot_status = robot_actions.get_status()
    
    return {
        "patient": {
            "id": patient_id,
            "name": state.user_profile.get("name", "Patient"),
            "is_online": True,
            "vitals": robot_status.get("vitals", {
                "heart_rate": 72,
                "blood_pressure": "120/80",
                "temperature": 98.6,
                "oxygen_saturation": 98,
            }),
            "mood": robot_status.get("mood", "Good"),
            "pain_level": robot_status.get("pain_level", 0),
            "last_medication": robot_status.get("last_medication", "Not recorded"),
        }
    }

# --- Store for call history (in-memory, will be replaced with Supabase) ---
call_history: Dict[str, list] = {}  # patient_id -> list of call records

@app.get("/api/patient/{patient_id}/status")
async def get_patient_status(patient_id: str):
    """
    Get patient online status - checks if device is online based on last heartbeat.
    Returns patient details including online status, device info, and last seen time.
    """
    is_online = False
    last_seen = None
    device_id = None
    patient_name = "Patient"
    room_number = None
    
    # Use Supabase if configured
    if is_supabase_configured():
        try:
            patient = await PatientDB.get_by_id(patient_id)
            if patient:
                patient_name = patient.get("name", "Patient")
                room_number = patient.get("room_number")
                # Device ID is stored on patient record
                patient_device_id = patient.get("device_id")
                if patient_device_id:
                    device_id = patient_device_id
                    # Check if device is in registry (active connection)
                    if device_id in device_registry:
                        is_online = True
                        last_seen = datetime.now().isoformat()
                    else:
                        # Try getting from devices table
                        try:
                            result = get_supabase().table("devices").select("*").eq("patient_id", patient_id).limit(1).execute()
                            if result.data:
                                device = result.data[0]
                                last_seen_str = device.get("last_seen_at")
                                if last_seen_str:
                                    last_seen_dt = datetime.fromisoformat(last_seen_str.replace('Z', '+00:00'))
                                    last_seen = last_seen_str
                                    age = (datetime.now(last_seen_dt.tzinfo) - last_seen_dt).total_seconds()
                                    is_online = age < 120
                        except:
                            pass
        except Exception as e:
            logger.error(f"Error fetching patient status: {e}")
    
    # Fallback to in-memory device registry
    if not device_id:
        for dev_id, dev_info in device_registry.items():
            if dev_info.get("patient_id") == patient_id:
                device_id = dev_id
                is_online = True  # Assume online if in registry
                last_seen = datetime.now().isoformat()
                break
    
    # If device is in registry, it's online regardless of DB state
    if device_id and device_id in device_registry:
        is_online = True
        last_seen = datetime.now().isoformat()
    
    return {
        "patient_id": patient_id,
        "name": patient_name,
        "room_number": room_number,
        "is_online": is_online,
        "last_seen": last_seen,
        "device_id": device_id,
    }

@app.get("/api/family/call-history/{patient_id}")
async def get_call_history(patient_id: str, limit: int = 20):
    """Get call history for a patient."""
    calls = []
    
    # Use Supabase if configured
    if is_supabase_configured():
        try:
            from supabase_client import supabase
            result = supabase.table("call_sessions").select("*").eq(
                "patient_id", patient_id
            ).order("started_at", desc=True).limit(limit).execute()
            
            if result.data:
                # Map to frontend expected format
                calls = [{
                    "id": c["id"],
                    "caller_name": c.get("caller_name", "Unknown"),
                    "patient_name": "Patient",
                    "started_at": c.get("started_at"),
                    "ended_at": c.get("ended_at"),
                    "duration_seconds": (
                        int((datetime.fromisoformat(c["ended_at"].replace("Z", "+00:00")) - 
                             datetime.fromisoformat(c["started_at"].replace("Z", "+00:00"))).total_seconds())
                        if c.get("ended_at") and c.get("started_at") else 0
                    ),
                    "status": c.get("status", "completed"),
                    "direction": "incoming" if c.get("caller_type") == "guardian" else "outgoing",
                } for c in result.data]
        except Exception as e:
            logger.error(f"Error fetching call history from Supabase: {e}")
    
    # Fallback to in-memory
    if not calls:
        calls = call_history.get(patient_id, [])[-limit:]
        calls.reverse()  # Most recent first
    
    return {"calls": calls, "patient_id": patient_id}

@app.post("/api/family/log-call")
async def log_call(request: dict):
    """Log a call attempt/completion for history."""
    patient_id = request.get("patient_id")
    caller_name = request.get("caller_name", "Unknown")
    status = request.get("status", "unknown")
    duration = request.get("duration_seconds", 0)
    error = request.get("error")
    call_id = request.get("call_id", str(uuid.uuid4()))
    
    # Map status to call_sessions status
    status_map = {
        "completed": "completed",
        "missed": "missed",
        "rejected": "declined",
        "failed": "missed",
    }
    db_status = status_map.get(status, status)
    
    # Use Supabase if configured
    if is_supabase_configured():
        try:
            from supabase_client import supabase
            
            # Check if call session exists
            existing = supabase.table("call_sessions").select("id").eq("id", call_id).execute()
            
            if existing.data:
                # Update existing call session
                supabase.table("call_sessions").update({
                    "status": db_status,
                    "ended_at": datetime.now().isoformat(),
                    "end_reason": "completed" if status == "completed" else error or status,
                }).eq("id", call_id).execute()
            else:
                # Create new call session
                supabase.table("call_sessions").insert({
                    "id": call_id,
                    "patient_id": patient_id,
                    "caller_type": "guardian",
                    "caller_name": caller_name,
                    "call_type": "video",
                    "status": db_status,
                    "started_at": datetime.now().isoformat(),
                    "ended_at": datetime.now().isoformat() if status in ["completed", "failed", "rejected"] else None,
                    "end_reason": error if error else None,
                }).execute()
                
        except Exception as e:
            logger.error(f"Error logging call to Supabase: {e}")
    
    # Also store in memory as fallback
    call_record = {
        "id": call_id,
        "patient_id": patient_id,
        "caller_name": caller_name,
        "status": status,
        "duration_seconds": duration,
        "started_at": datetime.now().isoformat(),
        "ended_at": datetime.now().isoformat() if status in ["completed", "failed", "rejected"] else None,
        "error": error,
        "direction": "incoming",
    }
    
    if patient_id not in call_history:
        call_history[patient_id] = []
    call_history[patient_id].append(call_record)
    
    # Keep only last 100 calls in memory
    if len(call_history[patient_id]) > 100:
        call_history[patient_id] = call_history[patient_id][-100:]
    
    return {"success": True, "call_id": call_id}

@app.post("/api/patient/generate-invite-code")
async def generate_patient_invite_code(x_device_id: str = Header(None)):
    """Generate an invite code for family members to link to this patient."""
    patient_id = await get_current_patient_id(x_device_id)
    
    # Use Supabase if configured
    if is_supabase_configured():
        try:
            code = await PatientDB.generate_pairing_code(patient_id)
            if code:
                await ActivityLogDB.log(patient_id, "invite_code_generated", 
                    "Generated family invite code")
                return {"invite_code": code, "patient_id": patient_id}
        except Exception as e:
            logger.error(f"Error generating invite code in Supabase: {e}")
    
    # Fallback to in-memory
    import random
    import string
    code = ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))
    patient_invite_codes[code] = patient_id
    
    return {"invite_code": code, "patient_id": patient_id}

@app.get("/api/activity-log")
async def get_activity_log(x_device_id: str = Header(None), limit: int = 50):
    """Get recent activity log for a patient."""
    patient_id = await get_current_patient_id(x_device_id)
    
    if is_supabase_configured():
        try:
            activities = await ActivityLogDB.get_recent(patient_id, limit)
            return {"activities": activities, "patient_id": patient_id}
        except Exception as e:
            logger.error(f"Error fetching activity log: {e}")
    
    # Fallback: return empty if not configured
    return {"activities": [], "patient_id": patient_id}

@app.get("/api/family/activity-log/{patient_id}")
async def get_family_activity_log(patient_id: str, limit: int = 50):
    """Get activity log for family dashboard (requires authenticated family member)."""
    # TODO: Verify family member has access to this patient
    
    if is_supabase_configured():
        try:
            activities = await ActivityLogDB.get_recent(patient_id, limit)
            return {"activities": activities, "patient_id": patient_id}
        except Exception as e:
            logger.error(f"Error fetching family activity log: {e}")
    
    return {"activities": [], "patient_id": patient_id}

@app.get("/api/commands")
async def get_commands(category: Optional[str] = None):
    """Get available commands, optionally filtered by category."""
    if category:
        try:
            cat = CommandCategory(category.lower())
            cmds = {name: cmd.to_dict() for name, cmd in 
                   [(n, COMMANDS[n]) for n in COMMANDS if COMMANDS[n].category == cat]}
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid category: {category}")
    else:
        cmds = {name: cmd.to_dict() for name, cmd in 
               [(n, COMMANDS[n]) for n in COMMANDS]}
    
    return {"commands": cmds}


# ===== Chat History API =====

class ChatMessageRequest(BaseModel):
    role: str
    content: str
    intent: Optional[str] = None


@app.get("/api/chat-history/{patient_id}")
async def get_chat_history(patient_id: str, limit: int = 50, offset: int = 0):
    """Get conversation history for a patient."""
    # Try Supabase first
    if is_supabase_configured():
        try:
            messages = await ConversationDB.get_history(patient_id, limit=limit)
            return {"messages": messages, "patient_id": patient_id}
        except Exception as e:
            logger.error(f"Error fetching chat history from Supabase: {e}")
    
    # Fallback to file-based
    try:
        history = get_history(patient_id, limit=limit, offset=offset)
        return history
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/chat-history/{patient_id}")
async def save_chat_message(patient_id: str, message: ChatMessageRequest):
    """Save a message to the patient's conversation history."""
    # Store in Supabase if configured
    if is_supabase_configured():
        try:
            saved = await ConversationDB.save_message(
                patient_id=patient_id,
                role=message.role,
                content=message.content,
                intent=message.intent
            )
            if saved:
                return {"status": "saved", "message": saved}
        except Exception as e:
            logger.error(f"Error saving to Supabase: {e}")
    
    # Fallback to file-based
    try:
        saved_message = save_message(
            patient_id=patient_id,
            role=message.role,
            content=message.content,
            intent=message.intent
        )
        return {"status": "saved", "message": saved_message}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/chat-history/{patient_id}")
async def delete_chat_history(patient_id: str):
    """Clear all conversation history for a patient."""
    try:
        cleared = clear_history(patient_id)
        return {"status": "cleared" if cleared else "no_history", "patient_id": patient_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/chat-history")
async def list_patients_with_history():
    """List all patients that have conversation history."""
    try:
        patient_ids = get_all_patients_with_history()
        return {"patients": patient_ids}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/realtime/info")
async def get_realtime_info(query_type: str = "weather"):
    """Get real-time information (weather, time, news, etc.)."""
    if query_type == "weather":
        return await data_fetcher.get_weather()
    elif query_type == "time":
        return data_fetcher.get_current_time()
    elif query_type == "date":
        return data_fetcher.get_current_date()
    elif query_type == "news":
        return await data_fetcher.get_news()
    elif query_type == "health_tips":
        return data_fetcher.get_health_tips()
    else:
        raise HTTPException(status_code=400, detail=f"Unknown query type: {query_type}")

@app.get("/api/robot-status")
async def get_robot_status():
    """Get current robot status and location."""
    status = robot_actions.get_status()
    return {"status": status}

# ============================================================================
# CONTACT & RELATIONSHIP MANAGEMENT ENDPOINTS
# ============================================================================

@app.post("/api/contacts")
async def create_contact(request: AddContactRequest, x_device_id: str = Header(None)):
    """Create a new contact."""
    patient_id = await get_current_patient_id(x_device_id)
    
    try:
        contact_id = request.contact_id or f"contact-{uuid.uuid4().hex[:8]}"
        
        # Store in Supabase if configured
        if is_supabase_configured():
            contact = await ContactsDB.create(
                patient_id=patient_id,
                name=request.name,
                phone=request.phone,
                email=request.email,
                relationship=request.relationship,
                is_emergency=(request.contact_type == "emergency")
            )
            if contact:
                # Log activity
                await ActivityLogDB.log(patient_id, "contact_added", f"Added contact: {request.name}")
                return {"success": True, "contact": contact}
        
        # Fallback to in-memory
        contact = contact_manager.add_contact(
            contact_id=contact_id,
            name=request.name,
            phone=request.phone,
            email=request.email,
            relationship=request.relationship,
            contact_type=request.contact_type,
            is_video_capable=request.is_video_capable
        )
        return {"success": True, "contact": contact.to_dict()}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/contacts/{contact_id}")
async def get_contact(contact_id: str):
    """Get a contact by ID."""
    contact = contact_manager.get_contact(contact_id)
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")
    return {"contact": contact.to_dict()}

@app.get("/api/contacts/by-name/{contact_name}")
async def get_contact_by_name(contact_name: str):
    """Find a contact by name."""
    contact = contact_manager.get_contact_by_name(contact_name)
    if not contact:
        raise HTTPException(status_code=404, detail=f"Contact '{contact_name}' not found")
    return {"contact": contact.to_dict()}

@app.put("/api/contacts/{contact_id}")
async def update_contact(contact_id: str, request: AddContactRequest):
    """Update a contact."""
    try:
        contact = contact_manager.update_contact(
            contact_id,
            name=request.name,
            phone=request.phone,
            email=request.email,
            relationship=request.relationship,
            contact_type=request.contact_type,
            is_video_capable=request.is_video_capable
        )
        if not contact:
            raise HTTPException(status_code=404, detail="Contact not found")
        return {"success": True, "contact": contact.to_dict()}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.delete("/api/contacts/{contact_id}")
async def delete_contact(contact_id: str):
    """Delete a contact."""
    if contact_manager.delete_contact(contact_id):
        return {"success": True}
    raise HTTPException(status_code=404, detail="Contact not found")

@app.get("/api/contacts")
async def list_contacts(x_device_id: str = Header(None)):
    """Get all contacts for the current patient."""
    patient_id = await get_current_patient_id(x_device_id)
    
    # Try Supabase first
    if is_supabase_configured():
        try:
            contacts = await ContactsDB.get_all(patient_id)
            return {"contacts": contacts}
        except Exception as e:
            logger.error(f"Error fetching contacts from Supabase: {e}")
    
    # Fallback to in-memory
    contacts = contact_manager.list_contacts()
    return {"contacts": [c.to_dict() for c in contacts]}

# Patient Management Endpoints
@app.post("/api/patients")
async def create_patient(request: AddPatientRequest):
    """Create a new patient."""
    try:
        patient_id = request.patient_id or f"patient-{uuid.uuid4().hex[:8]}"
        patient = contact_manager.add_patient(
            patient_id=patient_id,
            name=request.name,
            email=request.email,
            age=request.age,
            medical_history=request.medical_history
        )
        return {"success": True, "patient": patient.to_dict()}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/patients/{patient_id}")
async def get_patient(patient_id: str):
    """Get a patient by ID."""
    patient = contact_manager.get_patient(patient_id)
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    return {"patient": patient.to_dict()}

@app.get("/api/patients/by-email/{email}")
async def get_patient_by_email(email: str):
    """Find a patient by email."""
    patient = contact_manager.get_patient_by_email(email)
    if not patient:
        raise HTTPException(status_code=404, detail=f"Patient with email '{email}' not found")
    return {"patient": patient.to_dict()}

@app.delete("/api/patients/{patient_id}")
async def delete_patient(patient_id: str):
    """Delete a patient."""
    if contact_manager.delete_patient(patient_id):
        return {"success": True}
    raise HTTPException(status_code=404, detail="Patient not found")

# Guardian Management Endpoints
@app.post("/api/guardians")
async def create_guardian(request: AddGuardianRequest):
    """Create a new guardian."""
    try:
        guardian_id = request.guardian_id or f"guardian-{uuid.uuid4().hex[:8]}"
        guardian = contact_manager.add_guardian(
            guardian_id=guardian_id,
            name=request.name,
            email=request.email,
            role=request.role,
            phone=request.phone
        )
        return {"success": True, "guardian": guardian.to_dict()}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/guardians/{guardian_id}")
async def get_guardian(guardian_id: str):
    """Get a guardian by ID."""
    guardian = contact_manager.get_guardian(guardian_id)
    if not guardian:
        raise HTTPException(status_code=404, detail="Guardian not found")
    return {"guardian": guardian.to_dict()}

@app.get("/api/guardians/by-email/{email}")
async def get_guardian_by_email(email: str):
    """Find a guardian by email."""
    guardian = contact_manager.get_guardian_by_email(email)
    if not guardian:
        raise HTTPException(status_code=404, detail=f"Guardian with email '{email}' not found")
    return {"guardian": guardian.to_dict()}

@app.delete("/api/guardians/{guardian_id}")
async def delete_guardian(guardian_id: str):
    """Delete a guardian."""
    if contact_manager.delete_guardian(guardian_id):
        return {"success": True}
    raise HTTPException(status_code=404, detail="Guardian not found")

# Guardian-Patient Relationship Endpoints
@app.post("/api/relationships/guardian-patient")
async def link_guardian_to_patient(request: LinkGuardianRequest):
    """Link a guardian to a patient."""
    try:
        if contact_manager.add_guardian_to_patient(request.guardian_id, request.patient_id):
            return {"success": True, "message": f"Guardian linked to patient"}
        raise HTTPException(status_code=400, detail="Failed to link guardian to patient")
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.delete("/api/relationships/guardian-patient")
async def unlink_guardian_from_patient(request: LinkGuardianRequest):
    """Unlink a guardian from a patient."""
    try:
        if contact_manager.remove_guardian_from_patient(request.guardian_id, request.patient_id):
            return {"success": True, "message": f"Guardian unlinked from patient"}
        raise HTTPException(status_code=400, detail="Failed to unlink guardian from patient")
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/patients/{patient_id}/guardians")
async def get_patient_guardians(patient_id: str):
    """Get all guardians for a patient."""
    guardians = contact_manager.get_patient_guardians(patient_id)
    return {"guardians": [g.to_dict() for g in guardians]}

@app.get("/api/guardians/{guardian_id}/patients")
async def get_guardian_patients(guardian_id: str):
    """Get all patients for a guardian."""
    patients = contact_manager.get_guardian_patients(guardian_id)
    return {"patients": [p.to_dict() for p in patients]}

# Patient Contact Management Endpoints
@app.post("/api/patients/{patient_id}/contacts")
async def add_contact_to_patient(patient_id: str, request: AddPatientContactRequest):
    """Add a contact to a patient's contact list."""
    try:
        if contact_manager.add_contact_to_patient(patient_id, request.contact_id, request.contact_type):
            return {"success": True}
        raise HTTPException(status_code=400, detail="Failed to add contact to patient")
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.delete("/api/patients/{patient_id}/contacts/{contact_id}")
async def remove_contact_from_patient(patient_id: str, contact_id: str):
    """Remove a contact from a patient."""
    try:
        if contact_manager.remove_contact_from_patient(patient_id, contact_id):
            return {"success": True}
        raise HTTPException(status_code=404, detail="Contact not found for patient")
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/patients/{patient_id}/contacts")
async def get_patient_contacts(patient_id: str, contact_type: str = "all"):
    """Get all contacts for a patient."""
    contacts = contact_manager.get_patient_contacts(patient_id, contact_type)
    return {"contacts": [c.to_dict() for c in contacts]}

@app.get("/api/patients/{patient_id}/contacts/by-name/{contact_name}")
async def find_patient_contact(patient_id: str, contact_name: str):
    """Find a specific contact for a patient by name."""
    contact = contact_manager.find_contact_for_patient(patient_id, contact_name)
    if not contact:
        raise HTTPException(status_code=404, detail=f"Contact '{contact_name}' not found for patient")
    return {"contact": contact.to_dict()}

# Contact Calling Endpoints
@app.post("/api/calls/contact")
async def initiate_contact_call(request: InitiateContactCallRequest):
    """
    Initiate a call to a specific contact.
    Creates a video call room and sends notification to contact.
    """
    try:
        call_id = str(uuid.uuid4())
        room_id = f"call-{call_id}"
        
        # Create incoming call object
        incoming_call = IncomingCall(
            call_id=call_id,
            initiator_id=request.initiator_id,
            initiator_name=request.initiator_name,
            initiator_role=request.initiator_role,
            patient_id=request.contact_id,  # For compatibility
            room_id=room_id
        )
        
        # Store incoming call
        incoming_calls[call_id] = incoming_call
        
        # Add to contact's pending notifications
        if request.contact_id not in pending_notifications:
            pending_notifications[request.contact_id] = []
        pending_notifications[request.contact_id].append(call_id)
        
        state.last_response = f"Calling {request.contact_name}..."
        await state.broadcast_update()
        
        return {
            "success": True,
            "call_id": call_id,
            "room_id": room_id,
            "contact_name": request.contact_name,
            "message": f"Calling {request.contact_name}"
        }
    
    except Exception as e:
        state.last_error = str(e)
        await state.broadcast_update()
        raise HTTPException(status_code=500, detail=str(e))

# ============================================================================
# VIDEO CONFERENCING ENDPOINTS - WebRTC Signaling
# ============================================================================

@app.post("/api/video/join")
async def video_join(request: VideoJoinRequest):
    """
    Join a video conference room.
    Returns participant info and other participants in room.
    """
    try:
        result = await conferencing_service.join_call(request.room_id, request.session_id)
        return result
    except Exception as e:
        state.last_error = str(e)
        await state.broadcast_update()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/video/offer")
async def video_send_offer(request: SDPOfferRequest):
    """
    Send WebRTC SDP offer to be broadcast to other participants.
    """
    try:
        result = await conferencing_service.send_sdp_offer(
            request.participant_id, 
            request.sdp
        )
        return result
    except Exception as e:
        state.last_error = str(e)
        await state.broadcast_update()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/video/answer")
async def video_send_answer(request: SDPAnswerRequest):
    """
    Send WebRTC SDP answer to a specific participant.
    """
    try:
        result = await conferencing_service.send_sdp_answer(
            request.participant_id,
            request.sdp,
            request.to_participant_id
        )
        return result
    except Exception as e:
        state.last_error = str(e)
        await state.broadcast_update()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/video/ice-candidate")
async def video_ice_candidate(request: ICECandidateRequest):
    """
    Add ICE candidate and broadcast to other participants.
    """
    try:
        result = await conferencing_service.add_ice_candidate(
            request.participant_id,
            request.candidate
        )
        return result
    except Exception as e:
        state.last_error = str(e)
        await state.broadcast_update()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/video/mute")
async def video_mute(request: VideoMuteRequest):
    """Mute audio for participant."""
    try:
        result = await conferencing_service.mute_call(request.participant_id)
        await state.broadcast_update()
        return result
    except Exception as e:
        state.last_error = str(e)
        await state.broadcast_update()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/video/unmute")
async def video_unmute(request: VideoUnmuteRequest):
    """Unmute audio for participant."""
    try:
        result = await conferencing_service.unmute_call(request.participant_id)
        await state.broadcast_update()
        return result
    except Exception as e:
        state.last_error = str(e)
        await state.broadcast_update()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/video/toggle-video")
async def video_toggle(request: VideoToggleRequest):
    """Toggle video on/off for participant."""
    try:
        result = await conferencing_service.toggle_video(
            request.participant_id,
            request.video_on
        )
        await state.broadcast_update()
        return result
    except Exception as e:
        state.last_error = str(e)
        await state.broadcast_update()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/video/end")
async def video_end(request: VideoEndRequest):
    """End video call for participant."""
    try:
        result = await conferencing_service.end_call(request.participant_id)
        await state.broadcast_update()
        return result
    except Exception as e:
        state.last_error = str(e)
        await state.broadcast_update()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/video/room/{room_id}")
async def get_video_room_status(room_id: str):
    """Get status of a video conference room."""
    try:
        result = await conferencing_service.get_room_status(room_id)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/video/participant/{participant_id}")
async def get_video_participant_status(participant_id: str):
    """Get status of a specific video participant."""
    try:
        result = await conferencing_service.get_participant_status(participant_id)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.websocket("/ws/video/{participant_id}")
async def websocket_video_endpoint(websocket: WebSocket, participant_id: str):
    """
    WebSocket endpoint for real-time video signaling.
    Handles offer/answer/ICE candidate exchange.
    """
    await websocket.accept()
    print(f"[WS VIDEO] WebSocket connected for participant {participant_id}")
    
    # Register connection for signaling
    conferencing_service.register_signaling_connection(participant_id, websocket)
    
    try:
        # Send initial status
        status = await conferencing_service.get_participant_status(participant_id)
        await websocket.send_json({
            "type": "connection_established",
            "payload": status
        })
        print(f"[WS VIDEO] Sent connection_established to {participant_id}")
        
        # Listen for incoming messages
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            
            # Handle different message types
            message_type = message.get("type")
            print(f"[WS VIDEO] Received {message_type} from {participant_id}")
            
            if message_type == "ice_candidate":
                candidate = message.get("candidate")
                await conferencing_service.add_ice_candidate(participant_id, candidate)
            
            elif message_type == "sdp_offer":
                sdp = message.get("sdp")
                print(f"[WS VIDEO] {participant_id} sent SDP offer, storing and broadcasting...")
                await conferencing_service.send_sdp_offer(participant_id, sdp)
            
            elif message_type == "sdp_answer":
                sdp = message.get("sdp")
                to_participant_id = message.get("to_participant_id")
                print(f"[WS VIDEO] {participant_id} sent SDP answer to {to_participant_id}")
                await conferencing_service.send_sdp_answer(participant_id, sdp, to_participant_id)
            
            elif message_type == "mute":
                await conferencing_service.mute_call(participant_id)
            
            elif message_type == "unmute":
                await conferencing_service.unmute_call(participant_id)
            
            elif message_type == "video_toggle":
                video_on = message.get("video_on", True)
                await conferencing_service.toggle_video(participant_id, video_on)
            
            elif message_type == "participant_ready":
                # New participant is ready - re-send any existing offers
                print(f"[WS VIDEO] {participant_id} signaled ready, checking for stored offers...")
                await conferencing_service.handle_participant_ready(participant_id)
            
            elif message_type == "end_call":
                print(f"[WS VIDEO] {participant_id} ending call")
                await conferencing_service.end_call(participant_id)
                break
    
    except Exception as e:
        print(f"[WS VIDEO] WebSocket error for participant {participant_id}: {e}")
        # Clean up on disconnect
        await conferencing_service.end_call(participant_id)
    
    finally:
        # Unregister connection
        print(f"[WS VIDEO] Unregistering WebSocket for participant {participant_id}")
        conferencing_service.unregister_signaling_connection(participant_id)

# ============================================================================
# INCOMING CALL MANAGEMENT - Guardian → Patient Calls
# ============================================================================

class IncomingCall:
    """Represents an incoming call from guardian to patient."""
    def __init__(self, call_id: str, initiator_id: str, initiator_name: str, 
                 initiator_role: str, patient_id: str, room_id: str):
        self.call_id = call_id
        self.initiator_id = initiator_id
        self.initiator_name = initiator_name
        self.initiator_role = initiator_role
        self.patient_id = patient_id
        self.room_id = room_id
        self.created_at = datetime.now()
        self.answered = False
        self.rejected = False

# Store incoming calls in memory
incoming_calls: Dict[str, IncomingCall] = {}
pending_notifications: Dict[str, list] = {}  # patient_id -> list of pending calls

# Call cleanup - remove calls older than 5 minutes
async def cleanup_old_calls():
    """Remove calls that are older than 5 minutes or already handled."""
    while True:
        try:
            await asyncio.sleep(60)  # Run every minute
            now = datetime.now()
            calls_to_remove = []
            
            for call_id, call in incoming_calls.items():
                age = (now - call.created_at).total_seconds()
                # Remove if older than 5 minutes or already answered/rejected
                if age > 300 or call.answered or call.rejected:
                    calls_to_remove.append(call_id)
            
            for call_id in calls_to_remove:
                call = incoming_calls.pop(call_id, None)
                if call:
                    # Also remove from pending notifications
                    patient_id = call.patient_id
                    if patient_id in pending_notifications:
                        if call_id in pending_notifications[patient_id]:
                            pending_notifications[patient_id].remove(call_id)
                        if not pending_notifications[patient_id]:
                            del pending_notifications[patient_id]
                    
                    # Clear state if this was the active pending call
                    if state.pending_command and state.pending_command.get("intent") == "incoming_call":
                        if state.pending_command.get("slots", {}).get("call_id") == call_id:
                            state.pending_command = None
                            state.active_call_info = None
        except Exception as e:
            print(f"Call cleanup error: {e}")

@app.post("/api/calls/initiate")
async def initiate_call(request: InitiateCallRequest):
    """
    Guardian initiates a call to patient.
    Creates a call room and sends notification to patient.
    Claire announces the incoming call.
    """
    try:
        call_id = str(uuid.uuid4())
        room_id = f"call-{call_id}"
        
        # Create incoming call object
        incoming_call = IncomingCall(
            call_id=call_id,
            initiator_id=request.initiator_id,
            initiator_name=request.initiator_name,
            initiator_role=request.initiator_role,
            patient_id=request.patient_id,
            room_id=room_id
        )
        
        # Store incoming call
        incoming_calls[call_id] = incoming_call
        
        # Add to patient's pending notifications
        if request.patient_id not in pending_notifications:
            pending_notifications[request.patient_id] = []
        pending_notifications[request.patient_id].append(call_id)
        
        # Claire announces the incoming call
        announcement = f"{request.initiator_name} is calling you. Would you like me to answer?"
        state.last_response = announcement
        state.assistant_state = "speaking"
        
        # Generate TTS for the announcement
        try:
            audio_base64 = await voice_service.text_to_speech(announcement)
            if audio_base64:
                state.last_audio = audio_base64
        except Exception as tts_error:
            print(f"TTS error during call announcement: {tts_error}")
        
        # Set pending command so frontend shows incoming call dialog
        state.pending_command = {
            "intent": "incoming_call",
            "slots": {
                "call_id": call_id,
                "caller_name": request.initiator_name,
                "caller_role": request.initiator_role,
                "room_id": room_id
            }
        }
        
        # Store active call info for frontend
        state.active_call_info = {
            "call_id": call_id,
            "caller_name": request.initiator_name,
            "room_id": room_id,
            "status": "ringing"
        }
        
        # Broadcast notification to all clients about pending call
        await state.broadcast_update()
        
        # Reset assistant state after short delay
        await asyncio.sleep(3)
        state.assistant_state = "idle"
        await state.broadcast_update()
        
        return {
            "success": True,
            "call_id": call_id,
            "room_id": room_id,
            "message": f"Call initiated to {request.patient_id}"
        }
    
    except Exception as e:
        state.last_error = str(e)
        await state.broadcast_update()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/calls/answer")
async def answer_call(request: AnswerCallRequest):
    """
    Patient answers an incoming call.
    Both guardian and patient join the same video room.
    """
    try:
        if request.call_id not in incoming_calls:
            raise HTTPException(status_code=404, detail="Call not found")
        
        incoming_call = incoming_calls[request.call_id]
        
        # Mark as answered
        incoming_call.answered = True
        
        # Clear pending command and active call info since call is being answered
        state.pending_command = None
        state.active_call_info = None
        
        # DON'T join patient here - SimpleVideoCall will do it via /api/video/join
        # This avoids creating an orphan participant with no WebSocket
        
        state.call_state = "connecting"
        state.last_response = f"Call answered with {incoming_call.initiator_name}"
        
        # Add call_answered event for family portal
        state.call_event = {
            "type": "call_answered",
            "call_id": request.call_id,
            "patient_id": request.patient_id,
            "initiator_id": incoming_call.initiator_id,
            "room_id": incoming_call.room_id,
            "timestamp": datetime.now().isoformat()
        }
        
        await state.broadcast_update()
        
        # Clear the event after broadcast
        state.call_event = None
        
        return {
            "success": True,
            "call_id": request.call_id,
            "room_id": incoming_call.room_id,
            "initiator_id": incoming_call.initiator_id,
            "initiator_name": incoming_call.initiator_name
        }
    
    except Exception as e:
        state.last_error = str(e)
        await state.broadcast_update()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/calls/reject")
async def reject_call(request: AnswerCallRequest):
    """
    Patient rejects an incoming call.
    """
    try:
        if request.call_id not in incoming_calls:
            raise HTTPException(status_code=404, detail="Call not found")
        
        incoming_call = incoming_calls[request.call_id]
        incoming_call.rejected = True
        
        # Clear pending command and active call info since call is being rejected
        state.pending_command = None
        state.active_call_info = None
        
        # Remove from pending
        if request.patient_id in pending_notifications:
            if request.call_id in pending_notifications[request.patient_id]:
                pending_notifications[request.patient_id].remove(request.call_id)
        
        state.last_response = f"Call rejected by {request.patient_id}"
        
        # Add call_rejected event for family portal
        state.call_event = {
            "type": "call_rejected",
            "call_id": request.call_id,
            "patient_id": request.patient_id,
            "initiator_id": incoming_call.initiator_id,
            "room_id": incoming_call.room_id,
            "timestamp": datetime.now().isoformat()
        }
        
        await state.broadcast_update()
        
        # Clear the event after broadcast
        state.call_event = None
        
        # Log as missed call
        if incoming_call.patient_id not in call_history:
            call_history[incoming_call.patient_id] = []
        call_history[incoming_call.patient_id].append({
            "id": request.call_id,
            "patient_id": incoming_call.patient_id,
            "caller_name": incoming_call.initiator_name,
            "status": "rejected",
            "duration_seconds": 0,
            "started_at": incoming_call.created_at.isoformat(),
            "ended_at": datetime.now().isoformat(),
            "direction": "incoming",
        })
        
        return {
            "success": True,
            "call_id": request.call_id,
            "rejected": True
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/calls/{call_id}/status")
async def get_call_status(call_id: str):
    """Get status of a specific call."""
    try:
        if call_id not in incoming_calls:
            raise HTTPException(status_code=404, detail="Call not found")
        
        call = incoming_calls[call_id]
        return {
            "call_id": call_id,
            "initiator_name": call.initiator_name,
            "initiator_role": call.initiator_role,
            "patient_id": call.patient_id,
            "room_id": call.room_id,
            "answered": call.answered,
            "rejected": call.rejected,
            "created_at": call.created_at.isoformat()
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/calls/pending/{patient_id}")
async def get_pending_calls(patient_id: str):
    """Get pending incoming calls for a patient."""
    try:
        pending = pending_notifications.get(patient_id, [])
        calls_info = []
        
        for call_id in pending:
            if call_id in incoming_calls:
                call = incoming_calls[call_id]
                if not call.answered and not call.rejected:
                    calls_info.append({
                        "call_id": call_id,
                        "initiator_name": call.initiator_name,
                        "initiator_role": call.initiator_role,
                        "call_type": "video",
                        "created_at": call.created_at.isoformat()
                    })
        
        return {
            "success": True,
            "patient_id": patient_id,
            "pending_calls": calls_info
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    state.connections.add(websocket)
    try:
        # Clean up stale incoming call notifications before sending state
        if state.pending_command and state.pending_command.get("intent") == "incoming_call":
            call_id = state.pending_command.get("slots", {}).get("call_id")
            if call_id:
                call = incoming_calls.get(call_id)
                if not call or call.answered or call.rejected:
                    state.pending_command = None
                    state.active_call_info = None
        
        await websocket.send_json({"type": "system_update", "payload": await get_status()})
        
        while True:
            try:
                # Set a timeout for receiving messages (heartbeat interval)
                data = await asyncio.wait_for(websocket.receive_text(), timeout=60.0)
                
                # Handle ping/pong for connection keep-alive
                try:
                    message = json.loads(data)
                    if message.get("type") == "ping":
                        await websocket.send_json({"type": "pong", "timestamp": message.get("timestamp")})
                except json.JSONDecodeError:
                    pass  # Not JSON, ignore
                    
            except asyncio.TimeoutError:
                # Send a ping to check if connection is still alive
                try:
                    await websocket.send_json({"type": "ping"})
                except:
                    break  # Connection is dead
    except Exception as e:
        # Connection closed or errored
        pass
    finally:
        state.connections.discard(websocket)

@app.post("/api/stream-response")
async def stream_response(request: TextCommandRequest, x_device_id: str = Header(None)):
    """Stream Claire's response token by token for real-time conversation."""
    if not state.assistant_enabled:
        raise HTTPException(status_code=400, detail="Assistant is not enabled.")
    
    # Get patient ID from device header
    patient_id = await get_current_patient_id(x_device_id)
    
    async def generate():
        try:
            state.last_transcript = request.text
            state.assistant_state = "processing"
            await state.broadcast_update()
            
            full_response = ""
            sentence_buffer = ""
            audio_generated = False
            
            # Load patient context for this conversation
            await voice_service.load_patient_context(patient_id)
            
            async for token in voice_service.conversation_manager.stream_response(request.text):
                full_response += token
                sentence_buffer += token
                
                # Stream token to client immediately
                yield f"data: {json.dumps({'token': token, 'type': 'response'})}\n\n"
                
                # Optimized delay: reduced for faster response
                await asyncio.sleep(0.001)
                
                # Check if we have a complete sentence or substantial text
                if (len(sentence_buffer) > 100 and any(sentence_buffer.endswith(p) for p in ['.', '!', '?'])) or len(sentence_buffer) > 200:
                    # Generate audio for the current sentence in background
                    if not audio_generated and len(sentence_buffer) > 50:
                        asyncio.create_task(
                            _generate_audio_background(voice_service, sentence_buffer)
                        )
                        audio_generated = True
                    sentence_buffer = ""
            
            state.last_response = full_response
            state.assistant_state = "generating_audio"
            await state.broadcast_update()
            
            print(f"Generating audio for response: {full_response[:50]}...")
            audio_base64 = await voice_service.text_to_speech(full_response)
            state.last_audio = audio_base64
            
            if audio_base64:
                print(f"Audio generated successfully ({len(audio_base64)} bytes)")
                yield f"data: {json.dumps({'type': 'audio_ready', 'audio_url': '/api/audio/last'})}\n\n"
            else:
                print("Failed to generate audio")
                yield f"data: {json.dumps({'type': 'audio_failed'})}\n\n"
            
            state.assistant_state = "idle"
            await state.broadcast_update()
            
        except Exception as e:
            state.last_error = str(e)
            print(f"Stream response error: {e}")
            await state.broadcast_update()
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
    
    return StreamingResponse(generate(), media_type="text/event-stream")

async def _generate_audio_background(voice_service: 'VoiceService', text: str):
    """Generate audio in background without blocking response stream."""
    try:
        # This can be extended to cache partial audio chunks
        pass
    except Exception as e:
        print(f"Background audio generation error: {e}")

@app.get("/api/audio/{audio_id}")
async def get_audio(audio_id: str):
    """Get audio for a response (base64 encoded MP3)."""
    if audio_id == "last" and state.last_audio:
        import base64
        audio_bytes = base64.b64decode(state.last_audio)
        return StreamingResponse(iter([audio_bytes]), media_type="audio/mpeg")
    
    raise HTTPException(status_code=404, detail="Audio not found")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

