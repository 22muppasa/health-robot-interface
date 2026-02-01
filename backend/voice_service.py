import asyncio
import webrtcvad
import numpy as np
import openai
from typing import Optional, Any
import io
import wave
from pydub import AudioSegment
from pydub.playback import play
import json
from conversation_manager import ConversationManager
from supabase_client import PatientDB, ContactsDB, is_supabase_configured
import base64
# import sounddevice as sd # Commented out for Codespaces compatibility

class VoiceService:
    def __init__(self, state, api_key: str, patient_id: str = "patient-main"):
        self.state = state
        self.api_key = api_key
        self.client = openai.AsyncOpenAI(api_key=api_key)
        self.vad = webrtcvad.Vad(3)  # Aggressiveness 0-3
        self.sample_rate = 16000
        self.frame_duration = 30  # ms
        self.frame_size = int(self.sample_rate * self.frame_duration / 1000)
        self.stream: Optional[Any] = None # Changed type hint for Codespaces compatibility
        self.is_enabled = False
        self.ptt_active = False
        self.recording = False
        self.audio_buffer = []
        # Initialize conversation manager with configurable patient ID
        self.patient_id = patient_id
        self.conversation_manager = ConversationManager(self.client, patient_id=patient_id)
        # Cache for patient context to avoid repeated lookups
        self._patient_context_cache = {}

    async def load_patient_context(self, patient_id: str):
        """Load patient context from database and update conversation manager."""
        if not patient_id or patient_id == "patient-main":
            return
        
        # Check cache first (cache for 5 minutes)
        import time
        cache_key = patient_id
        cached = self._patient_context_cache.get(cache_key)
        if cached and time.time() - cached.get("timestamp", 0) < 300:
            self.conversation_manager.set_patient_context(cached["context"])
            return
        
        if not is_supabase_configured():
            return
        
        try:
            # Fetch patient data
            patient = await PatientDB.get_by_id(patient_id)
            if not patient:
                return
            
            # Fetch contacts
            contacts = await ContactsDB.get_all(patient_id)
            
            # Build context
            context = {
                "patient_name": patient.get("name", "Patient"),
                "patient_id": patient_id,
                "room_number": patient.get("room_number"),
                "contacts": [
                    {"name": c.get("name"), "relationship": c.get("relationship"), "is_emergency": c.get("is_emergency_contact")}
                    for c in contacts
                ] if contacts else []
            }
            
            # Cache the context
            self._patient_context_cache[cache_key] = {
                "context": context,
                "timestamp": time.time()
            }
            
            # Update conversation manager
            self.conversation_manager.set_patient_context(context)
            
        except Exception as e:
            print(f"Error loading patient context: {e}")

    def set_patient_id(self, patient_id: str):
        """Update the patient ID for conversation persistence."""
        self.patient_id = patient_id
        self.conversation_manager.update_context("patient_id", patient_id)

    async def start(self):
        pass  # No background task needed

    async def stop(self):
        if self.stream:
            # self.stream.stop() # Removed hardware call
            # self.stream.close() # Removed hardware call
            pass

    async def enable(self):
        self.is_enabled = True
        # await self.start_listening() # Removed automatic listening

    async def disable(self):
        self.is_enabled = False
        # await self.stop_listening() # Removed automatic listening

    async def start_ptt(self):
        self.ptt_active = True
        self.state.assistant_state = "listening"
        await self.state.broadcast_update()

    async def stop_ptt(self):
        self.ptt_active = False
        self.state.assistant_state = "idle"
        await self.state.broadcast_update()

    async def start_listening(self):
        """
        Legacy method - audio processing now handled by frontend.
        
        The frontend uses Web Speech API for speech recognition.
        This method is kept for API compatibility.
        """
        self.state.assistant_state = "listening"
        await self.state.broadcast_update()

    async def stop_listening(self):
        """
        Legacy method - audio processing now handled by frontend.
        
        The frontend uses Web Speech API for speech recognition.
        This method is kept for API compatibility.
        """
        self.state.assistant_state = "idle"
        await self.state.broadcast_update()

    async def process_audio(self):
        """
        Legacy method - audio processing now handled by frontend.
        
        The frontend captures audio and converts to text via Web Speech API,
        then sends transcripts to process_text_command().
        This method is kept for future hardware audio input support.
        """
        pass

    async def transcribe_and_respond(self):
        """
        Legacy method - transcription now handled by frontend.
        
        Use process_text_command() for processing text from frontend.
        This method is kept for future hardware audio input support.
        """
        pass

    async def process_text_command(self, transcript: str, patient_id: str = None):
        """Processes a text command or conversation from the frontend."""
        self.state.assistant_state = "processing"
        await self.state.broadcast_update()

        try:
            # Load patient context if provided
            if patient_id:
                await self.load_patient_context(patient_id)
            
            self.state.last_transcript = transcript
            await self.state.broadcast_update()

            # Use conversation manager to process and determine intent
            result = await self.conversation_manager.process_message(transcript)
            
            intent = result.get("intent", "conversation")
            slots = result.get("slots", {})
            response = result.get("response", "")
            should_execute = result.get("should_execute_command", False)
            
            self.state.last_intent = intent

            # If it's a recognized command with high confidence, prepare for execution
            # Expanded list of commands that can be voice-triggered
            executable_commands = {
                "check_vitals", "call_nurse", "navigate", "stop", 
                "join_call", "mute_call", "unmute_call", "end_call",
                "answer_call", "reject_call", "toggle_camera",
                "pain_assessment", "mood_check", "medication_reminder",
                "room_service", "health_tips", "medication_taken",
                "call_family", "call_contact", "emergency", "set_reminder", "list_reminders",
                "switch_mode", "show_contacts", "add_contact", "remove_contact", "cancel_reminder",
                "generate_invite_code"
            }
            
            if should_execute and intent in executable_commands:
                # Store command info for main.py to handle
                self.state.pending_command = {
                    "intent": intent,
                    "slots": slots
                }

            # TTS - generate speech from response
            self.state.assistant_state = "speaking"
            await self.state.broadcast_update()

            # Generate audio for the response
            audio_base64 = await self.text_to_speech(response)
            self.state.last_audio = audio_base64

            # Store the response for WebSocket broadcast
            self.state.last_response = response
            self.state.last_intent = intent

        except Exception as e:
            self.state.last_error = str(e)
            print(f"Error processing command: {e}")

        finally:
            self.state.assistant_state = "idle"
            await self.state.broadcast_update()

    async def text_to_speech(self, text: str) -> str:
        """
        Convert text to speech using OpenAI TTS API.
        Returns base64 encoded MP3 audio.
        Robust error handling and retry logic.
        """
        if not text or len(text.strip()) == 0:
            print("TTS: Empty text provided")
            return ""
        
        # Truncate to OpenAI's actual limit of 4096 characters
        # This allows much longer responses compared to the old 500 char limit
        text_to_speak = text[:4000] if len(text) > 4000 else text
        
        max_retries = 2
        for attempt in range(max_retries):
            try:
                print(f"TTS: Generating audio for text (attempt {attempt + 1}/{max_retries})")
                
                response = await self.client.audio.speech.create(
                    model="tts-1",
                    voice="alloy",
                    input=text_to_speak,
                    response_format="mp3"
                )
                
                # Verify we got content
                if not response or not response.content:
                    print(f"TTS: Empty response from API (attempt {attempt + 1})")
                    if attempt < max_retries - 1:
                        await asyncio.sleep(1)
                        continue
                    return ""
                
                # Convert to base64
                audio_bytes = response.content
                audio_base64 = base64.b64encode(audio_bytes).decode('utf-8')
                
                # Verify base64 is not empty
                if not audio_base64:
                    print(f"TTS: Failed to encode audio to base64 (attempt {attempt + 1})")
                    if attempt < max_retries - 1:
                        await asyncio.sleep(1)
                        continue
                    return ""
                
                print(f"TTS: Successfully generated audio ({len(audio_bytes)} bytes)")
                return audio_base64
                
            except Exception as e:
                print(f"TTS Error (attempt {attempt + 1}/{max_retries}): {str(e)}")
                if attempt < max_retries - 1:
                    await asyncio.sleep(1)
                    continue
                return ""
        
        return ""
