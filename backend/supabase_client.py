"""
Supabase client module for Claire Healthcare Robot Interface.
Provides database access for patients, guardians, contacts, reminders, conversations, etc.
"""

import os
import logging
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any
from pathlib import Path
from supabase import create_client, Client

logger = logging.getLogger(__name__)

# Global client instance (uses service key for backend operations - bypasses RLS)
_supabase_client: Optional[Client] = None

def _load_supabase_config():
    """Load Supabase configuration from environment."""
    from dotenv import load_dotenv
    
    # Load environment variables from explicit .env path
    env_path = Path(__file__).parent / ".env"
    load_dotenv(dotenv_path=env_path, override=True)
    
    url = os.getenv("SUPABASE_URL", "")
    service_key = os.getenv("SUPABASE_SERVICE_KEY", "")
    
    return url, service_key


def get_supabase() -> Client:
    """Get the Supabase client instance (singleton pattern)."""
    global _supabase_client
    
    if _supabase_client is None:
        url, service_key = _load_supabase_config()
        
        if not url or not service_key:
            logger.warning("Supabase not configured - using fallback in-memory storage")
            logger.warning(f"URL: {bool(url)}, SERVICE_KEY: {bool(service_key)}")
            raise SupabaseNotConfiguredError("Supabase URL or Service Key not configured")
        
        # Debug: decode the JWT to verify it's the service role key
        try:
            import base64
            import json
            parts = service_key.split('.')
            if len(parts) >= 2:
                payload = parts[1] + '=' * (4 - len(parts[1]) % 4)
                decoded = base64.urlsafe_b64decode(payload)
                data = json.loads(decoded)
                role = data.get('role', 'unknown')
                print(f"[SUPABASE] Creating client with role: {role}")
                logger.info(f"Creating Supabase client with role: {role}")
                if role != 'service_role':
                    print(f"[SUPABASE] ERROR: Expected service_role but got {role}!")
                    logger.error(f"ERROR: Expected service_role but got {role}! RLS will block operations.")
        except Exception as e:
            logger.warning(f"Could not decode JWT: {e}")
        
        _supabase_client = create_client(url, service_key)
        print(f"[SUPABASE] Client created successfully")
        logger.info("Supabase client initialized successfully")
    
    return _supabase_client


def get_auth_client() -> Client:
    """Get a fresh Supabase client for user auth operations.
    
    IMPORTANT: This creates a new client each time to avoid corrupting
    the main singleton's auth state. When you call auth.sign_in_with_password()
    or auth.sign_up(), the client switches to using the user's session token,
    which breaks subsequent table operations that need service_role.
    
    Use this for login operations, use get_supabase() for everything else.
    """
    url, service_key = _load_supabase_config()
    return create_client(url, service_key)


def reset_supabase_client():
    """Reset the singleton client (useful for testing)."""
    global _supabase_client
    _supabase_client = None


# Load config at module level for is_supabase_configured check
SUPABASE_URL, SUPABASE_SERVICE_KEY = _load_supabase_config()
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY", "")


def is_supabase_configured() -> bool:
    """Check if Supabase is properly configured."""
    return bool(SUPABASE_URL and SUPABASE_SERVICE_KEY and 
                SUPABASE_URL != "https://your-project.supabase.co")


class SupabaseNotConfiguredError(Exception):
    """Raised when Supabase is not configured."""
    pass


# ============================================================================
# PATIENT OPERATIONS
# ============================================================================

class PatientDB:
    """Database operations for patients."""
    
    @staticmethod
    async def get_by_id(patient_id: str) -> Optional[Dict[str, Any]]:
        """Get a patient by ID."""
        try:
            result = get_supabase().table("patients").select("*").eq("id", patient_id).single().execute()
            return result.data
        except Exception as e:
            logger.error(f"Error fetching patient {patient_id}: {e}")
            return None
    
    @staticmethod
    async def get_by_device_id(device_id: str) -> Optional[Dict[str, Any]]:
        """Get a patient by their device ID."""
        try:
            result = get_supabase().table("patients").select("*").eq("device_id", device_id).single().execute()
            return result.data
        except Exception as e:
            logger.error(f"Error fetching patient by device {device_id}: {e}")
            return None
    
    @staticmethod
    async def create(name: str, room_number: str = None, device_id: str = None) -> Optional[Dict[str, Any]]:
        """Create a new patient."""
        try:
            data = {"name": name}
            if room_number:
                data["room_number"] = room_number
            if device_id:
                data["device_id"] = device_id
            
            result = get_supabase().table("patients").insert(data).execute()
            return result.data[0] if result.data else None
        except Exception as e:
            logger.error(f"Error creating patient: {e}")
            return None
    
    @staticmethod
    async def generate_pairing_code(patient_id: str) -> Optional[str]:
        """Generate a 6-digit pairing code for family onboarding."""
        import random
        code = ''.join([str(random.randint(0, 9)) for _ in range(6)])
        expires_at = datetime.utcnow() + timedelta(hours=24)
        
        try:
            get_supabase().table("patients").update({
                "pairing_code": code,
                "pairing_code_expires_at": expires_at.isoformat()
            }).eq("id", patient_id).execute()
            return code
        except Exception as e:
            logger.error(f"Error generating pairing code: {e}")
            return None
    
    @staticmethod
    async def verify_pairing_code(code: str) -> Optional[Dict[str, Any]]:
        """Verify a pairing code and return the patient if valid."""
        try:
            result = get_supabase().table("patients").select("*").eq("pairing_code", code).single().execute()
            if result.data:
                expires_at = datetime.fromisoformat(result.data["pairing_code_expires_at"].replace("Z", "+00:00"))
                if expires_at > datetime.utcnow().replace(tzinfo=expires_at.tzinfo):
                    return result.data
            return None
        except Exception as e:
            logger.error(f"Error verifying pairing code: {e}")
            return None


# ============================================================================
# GUARDIAN OPERATIONS
# ============================================================================

class GuardianDB:
    """Database operations for guardians (family members)."""
    
    @staticmethod
    async def get_by_id(guardian_id: str) -> Optional[Dict[str, Any]]:
        """Get a guardian by ID."""
        try:
            result = get_supabase().table("guardians").select("*").eq("id", guardian_id).single().execute()
            return result.data
        except Exception as e:
            logger.error(f"Error fetching guardian {guardian_id}: {e}")
            return None
    
    @staticmethod
    async def get_by_email(email: str) -> Optional[Dict[str, Any]]:
        """Get a guardian by email."""
        try:
            result = get_supabase().table("guardians").select("*").eq("email", email).single().execute()
            return result.data
        except Exception as e:
            logger.error(f"Error fetching guardian by email {email}: {e}")
            return None
    
    @staticmethod
    async def create(user_id: str, name: str, email: str, phone: str = None, relationship: str = None) -> Optional[Dict[str, Any]]:
        """Create a guardian profile (after Supabase Auth signup)."""
        import asyncio
        
        data = {
            "id": user_id,  # Links to auth.users
            "name": name,
            "email": email
        }
        if phone:
            data["phone"] = phone
        if relationship:
            data["relationship"] = relationship
        
        # Retry with delay to handle FK constraint timing issues
        # (auth.users may not be immediately visible to FK check)
        max_retries = 3
        for attempt in range(max_retries):
            try:
                result = get_supabase().table("guardians").insert(data).execute()
                return result.data[0] if result.data else None
            except Exception as e:
                error_msg = str(e)
                if "foreign key constraint" in error_msg.lower() and attempt < max_retries - 1:
                    logger.warning(f"Guardian create FK check failed, retrying in 1s... (attempt {attempt + 1})")
                    await asyncio.sleep(1)
                    continue
                logger.error(f"Error creating guardian: {e}")
                return None
        return None
    
    @staticmethod
    async def get_patients(guardian_id: str) -> List[Dict[str, Any]]:
        """Get all patients linked to a guardian."""
        try:
            result = get_supabase().table("guardian_patients").select(
                "*, patients(*)"
            ).eq("guardian_id", guardian_id).execute()
            
            return [
                {**gp["patients"], "is_primary": gp["is_primary"]}
                for gp in result.data
            ] if result.data else []
        except Exception as e:
            logger.error(f"Error fetching guardian's patients: {e}")
            return []
    
    @staticmethod
    async def link_to_patient(guardian_id: str, patient_id: str, is_primary: bool = False) -> bool:
        """Link a guardian to a patient."""
        import asyncio
        
        data = {
            "guardian_id": guardian_id,
            "patient_id": patient_id,
            "is_primary": is_primary
        }
        
        # Retry with delay to handle FK constraint timing issues
        max_retries = 3
        for attempt in range(max_retries):
            try:
                get_supabase().table("guardian_patients").insert(data).execute()
                return True
            except Exception as e:
                error_msg = str(e)
                if "foreign key constraint" in error_msg.lower() and attempt < max_retries - 1:
                    logger.warning(f"Guardian-patient link FK check failed, retrying in 1s... (attempt {attempt + 1})")
                    await asyncio.sleep(1)
                    continue
                logger.error(f"Error linking guardian to patient: {e}")
                return False
        return False


# ============================================================================
# PATIENT SETTINGS OPERATIONS
# ============================================================================

class PatientSettingsDB:
    """Database operations for patient settings."""
    
    @staticmethod
    async def get(patient_id: str) -> Optional[Dict[str, Any]]:
        """Get settings for a patient."""
        try:
            result = get_supabase().table("patient_settings").select("*").eq("patient_id", patient_id).single().execute()
            return result.data
        except Exception as e:
            logger.error(f"Error fetching settings for patient {patient_id}: {e}")
            return None
    
    @staticmethod
    async def upsert(patient_id: str, settings: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Create or update patient settings."""
        try:
            data = {"patient_id": patient_id, **settings}
            result = get_supabase().table("patient_settings").upsert(data, on_conflict="patient_id").execute()
            return result.data[0] if result.data else None
        except Exception as e:
            logger.error(f"Error upserting settings: {e}")
            return None
    
    @staticmethod
    async def update_mode(patient_id: str, mode: str) -> bool:
        """Update the current mode for a patient."""
        try:
            get_supabase().table("patient_settings").update({
                "current_mode": mode
            }).eq("patient_id", patient_id).execute()
            return True
        except Exception as e:
            logger.error(f"Error updating mode: {e}")
            return False


# ============================================================================
# CONTACTS OPERATIONS
# ============================================================================

class ContactsDB:
    """Database operations for patient contacts."""
    
    @staticmethod
    async def get_all(patient_id: str) -> List[Dict[str, Any]]:
        """Get all contacts for a patient."""
        try:
            result = get_supabase().table("contacts").select("*").eq(
                "patient_id", patient_id
            ).order("sort_order").execute()
            return result.data or []
        except Exception as e:
            logger.error(f"Error fetching contacts: {e}")
            return []
    
    @staticmethod
    async def get_by_id(contact_id: str) -> Optional[Dict[str, Any]]:
        """Get a contact by ID."""
        try:
            result = get_supabase().table("contacts").select("*").eq("id", contact_id).single().execute()
            return result.data
        except Exception as e:
            logger.error(f"Error fetching contact {contact_id}: {e}")
            return None
    
    @staticmethod
    async def get_by_name(patient_id: str, name: str) -> Optional[Dict[str, Any]]:
        """Find a contact by name (case-insensitive partial match)."""
        try:
            result = get_supabase().table("contacts").select("*").eq(
                "patient_id", patient_id
            ).ilike("name", f"%{name}%").limit(1).execute()
            return result.data[0] if result.data else None
        except Exception as e:
            logger.error(f"Error finding contact by name: {e}")
            return None
    
    @staticmethod
    async def create(patient_id: str, name: str, phone: str = None, email: str = None,
                     relationship: str = None, is_emergency: bool = False) -> Optional[Dict[str, Any]]:
        """Create a new contact."""
        try:
            data = {
                "patient_id": patient_id,
                "name": name,
                "is_emergency_contact": is_emergency
            }
            if phone:
                data["phone"] = phone
            if email:
                data["email"] = email
            if relationship:
                data["relationship"] = relationship
            
            result = get_supabase().table("contacts").insert(data).execute()
            return result.data[0] if result.data else None
        except Exception as e:
            logger.error(f"Error creating contact: {e}")
            return None
    
    @staticmethod
    async def update(contact_id: str, updates: Dict[str, Any]) -> bool:
        """Update a contact."""
        try:
            get_supabase().table("contacts").update(updates).eq("id", contact_id).execute()
            return True
        except Exception as e:
            logger.error(f"Error updating contact: {e}")
            return False
    
    @staticmethod
    async def delete(contact_id: str) -> bool:
        """Delete a contact."""
        try:
            get_supabase().table("contacts").delete().eq("id", contact_id).execute()
            return True
        except Exception as e:
            logger.error(f"Error deleting contact: {e}")
            return False


# ============================================================================
# REMINDERS OPERATIONS
# ============================================================================

class RemindersDB:
    """Database operations for reminders."""
    
    @staticmethod
    async def get_all(patient_id: str, active_only: bool = True) -> List[Dict[str, Any]]:
        """Get all reminders for a patient."""
        try:
            query = get_supabase().table("reminders").select("*").eq("patient_id", patient_id)
            if active_only:
                query = query.eq("is_active", True)
            result = query.order("scheduled_time").execute()
            return result.data or []
        except Exception as e:
            logger.error(f"Error fetching reminders: {e}")
            return []
    
    @staticmethod
    async def get_by_id(reminder_id: str) -> Optional[Dict[str, Any]]:
        """Get a reminder by ID."""
        try:
            result = get_supabase().table("reminders").select("*").eq("id", reminder_id).single().execute()
            return result.data
        except Exception as e:
            logger.error(f"Error fetching reminder {reminder_id}: {e}")
            return None
    
    @staticmethod
    async def create(patient_id: str, title: str, scheduled_time: str, 
                     reminder_type: str = "general", description: str = None,
                     scheduled_date: str = None, is_recurring: bool = False,
                     days_of_week: List[int] = None, created_by: str = None) -> Optional[Dict[str, Any]]:
        """Create a new reminder."""
        try:
            data = {
                "patient_id": patient_id,
                "title": title,
                "scheduled_time": scheduled_time,
                "reminder_type": reminder_type,
                "is_recurring": is_recurring
            }
            if description:
                data["description"] = description
            if scheduled_date:
                data["scheduled_date"] = scheduled_date
            if days_of_week:
                data["days_of_week"] = days_of_week
            if created_by:
                data["created_by"] = created_by
            
            result = get_supabase().table("reminders").insert(data).execute()
            return result.data[0] if result.data else None
        except Exception as e:
            logger.error(f"Error creating reminder: {e}")
            return None
    
    @staticmethod
    async def acknowledge(reminder_id: str) -> bool:
        """Mark a reminder as acknowledged."""
        try:
            get_supabase().table("reminders").update({
                "is_acknowledged": True,
                "last_acknowledged_at": datetime.utcnow().isoformat()
            }).eq("id", reminder_id).execute()
            return True
        except Exception as e:
            logger.error(f"Error acknowledging reminder: {e}")
            return False
    
    @staticmethod
    async def deactivate(reminder_id: str) -> bool:
        """Deactivate a reminder."""
        try:
            get_supabase().table("reminders").update({"is_active": False}).eq("id", reminder_id).execute()
            return True
        except Exception as e:
            logger.error(f"Error deactivating reminder: {e}")
            return False
    
    @staticmethod
    async def delete(reminder_id: str) -> bool:
        """Delete a reminder."""
        try:
            get_supabase().table("reminders").delete().eq("id", reminder_id).execute()
            return True
        except Exception as e:
            logger.error(f"Error deleting reminder: {e}")
            return False


# ============================================================================
# CONVERSATION MESSAGES OPERATIONS
# ============================================================================

class ConversationDB:
    """Database operations for conversation history."""
    
    @staticmethod
    async def add_message(patient_id: str, role: str, content: str,
                          session_id: str = None, detected_intent: str = None,
                          intent_confidence: float = None, command_executed: str = None,
                          command_params: Dict = None) -> Optional[Dict[str, Any]]:
        """Add a message to conversation history."""
        try:
            data = {
                "patient_id": patient_id,
                "role": role,
                "content": content
            }
            if session_id:
                data["session_id"] = session_id
            if detected_intent:
                data["detected_intent"] = detected_intent
            if intent_confidence is not None:
                data["intent_confidence"] = intent_confidence
            if command_executed:
                data["command_executed"] = command_executed
            if command_params:
                data["command_params"] = command_params
            
            result = get_supabase().table("conversation_messages").insert(data).execute()
            return result.data[0] if result.data else None
        except Exception as e:
            logger.error(f"Error adding conversation message: {e}")
            return None
    
    @staticmethod
    async def get_recent(patient_id: str, limit: int = 50) -> List[Dict[str, Any]]:
        """Get recent conversation messages for a patient."""
        try:
            result = get_supabase().table("conversation_messages").select("*").eq(
                "patient_id", patient_id
            ).order("created_at", desc=True).limit(limit).execute()
            
            # Return in chronological order
            return list(reversed(result.data)) if result.data else []
        except Exception as e:
            logger.error(f"Error fetching conversation history: {e}")
            return []
    
    @staticmethod
    async def get_session(session_id: str) -> List[Dict[str, Any]]:
        """Get all messages in a conversation session."""
        try:
            result = get_supabase().table("conversation_messages").select("*").eq(
                "session_id", session_id
            ).order("created_at").execute()
            return result.data or []
        except Exception as e:
            logger.error(f"Error fetching session: {e}")
            return []
    
    @staticmethod
    async def save_message(patient_id: str, role: str, content: str, 
                           intent: str = None) -> Optional[Dict[str, Any]]:
        """Save a message to conversation history (alias for add_message)."""
        return await ConversationDB.add_message(
            patient_id=patient_id,
            role=role,
            content=content,
            detected_intent=intent
        )
    
    @staticmethod
    async def get_history(patient_id: str, limit: int = 50) -> List[Dict[str, Any]]:
        """Get conversation history for a patient (alias for get_recent)."""
        return await ConversationDB.get_recent(patient_id, limit)


# ============================================================================
# CALL SESSIONS OPERATIONS
# ============================================================================

class CallSessionsDB:
    """Database operations for call session logging."""
    
    @staticmethod
    async def create(patient_id: str, caller_type: str, caller_name: str = None,
                     caller_id: str = None, call_type: str = "video",
                     room_id: str = None) -> Optional[Dict[str, Any]]:
        """Create a new call session."""
        try:
            data = {
                "patient_id": patient_id,
                "caller_type": caller_type,
                "call_type": call_type,
                "status": "ringing"
            }
            if caller_name:
                data["caller_name"] = caller_name
            if caller_id:
                data["caller_id"] = caller_id
            if room_id:
                data["room_id"] = room_id
            
            result = get_supabase().table("call_sessions").insert(data).execute()
            return result.data[0] if result.data else None
        except Exception as e:
            logger.error(f"Error creating call session: {e}")
            return None
    
    @staticmethod
    async def answer(call_id: str) -> bool:
        """Mark a call as answered."""
        try:
            get_supabase().table("call_sessions").update({
                "status": "active",
                "answered_at": datetime.utcnow().isoformat()
            }).eq("id", call_id).execute()
            return True
        except Exception as e:
            logger.error(f"Error answering call: {e}")
            return False
    
    @staticmethod
    async def end(call_id: str, end_reason: str = "completed") -> bool:
        """End a call session."""
        try:
            get_supabase().table("call_sessions").update({
                "status": "completed",
                "ended_at": datetime.utcnow().isoformat(),
                "end_reason": end_reason
            }).eq("id", call_id).execute()
            return True
        except Exception as e:
            logger.error(f"Error ending call: {e}")
            return False
    
    @staticmethod
    async def get_history(patient_id: str, limit: int = 20) -> List[Dict[str, Any]]:
        """Get call history for a patient."""
        try:
            result = get_supabase().table("call_sessions").select("*").eq(
                "patient_id", patient_id
            ).order("created_at", desc=True).limit(limit).execute()
            return result.data or []
        except Exception as e:
            logger.error(f"Error fetching call history: {e}")
            return []


# ============================================================================
# ACTIVITY LOG OPERATIONS
# ============================================================================

class ActivityLogDB:
    """Database operations for activity logging."""
    
    @staticmethod
    async def log(patient_id: str, activity_type: str, description: str = None,
                  metadata: Dict = None) -> Optional[Dict[str, Any]]:
        """Log an activity."""
        try:
            data = {
                "patient_id": patient_id,
                "activity_type": activity_type
            }
            if description:
                data["description"] = description
            if metadata:
                data["metadata"] = metadata
            
            result = get_supabase().table("activity_log").insert(data).execute()
            return result.data[0] if result.data else None
        except Exception as e:
            logger.error(f"Error logging activity: {e}")
            return None
    
    @staticmethod
    async def get_recent(patient_id: str, limit: int = 50) -> List[Dict[str, Any]]:
        """Get recent activity for a patient."""
        try:
            result = get_supabase().table("activity_log").select("*").eq(
                "patient_id", patient_id
            ).order("created_at", desc=True).limit(limit).execute()
            return result.data or []
        except Exception as e:
            logger.error(f"Error fetching activity log: {e}")
            return []


# ============================================================================
# INVITE CODES OPERATIONS
# ============================================================================

class InviteCodesDB:
    """Database operations for invite codes."""
    
    @staticmethod
    async def create(patient_id: str, created_by: str = None, 
                     max_uses: int = 1, expires_hours: int = 48) -> Optional[str]:
        """Create an invite code for a patient."""
        import secrets
        code = secrets.token_urlsafe(6).upper()[:8]  # 8 character code
        expires_at = datetime.utcnow() + timedelta(hours=expires_hours)
        
        try:
            data = {
                "code": code,
                "patient_id": patient_id,
                "max_uses": max_uses,
                "expires_at": expires_at.isoformat()
            }
            if created_by:
                data["created_by"] = created_by
            
            get_supabase().table("invite_codes").insert(data).execute()
            return code
        except Exception as e:
            logger.error(f"Error creating invite code: {e}")
            return None
    
    @staticmethod
    async def redeem(code: str, guardian_id: str) -> Optional[str]:
        """Redeem an invite code and link guardian to patient. Returns patient_id if successful."""
        try:
            # Find the invite code
            result = get_supabase().table("invite_codes").select("*").eq(
                "code", code
            ).eq("is_active", True).single().execute()
            
            if not result.data:
                return None
            
            invite = result.data
            
            # Check expiration
            expires_at = datetime.fromisoformat(invite["expires_at"].replace("Z", "+00:00"))
            if expires_at < datetime.utcnow().replace(tzinfo=expires_at.tzinfo):
                return None
            
            # Check uses
            if invite["current_uses"] >= invite["max_uses"]:
                return None
            
            # Update uses
            get_supabase().table("invite_codes").update({
                "current_uses": invite["current_uses"] + 1
            }).eq("id", invite["id"]).execute()
            
            # Link guardian to patient
            await GuardianDB.link_to_patient(guardian_id, invite["patient_id"])
            
            return invite["patient_id"]
        except Exception as e:
            logger.error(f"Error redeeming invite code: {e}")
            return None


# ============================================================================
# SUPABASE AUTH HELPERS
# ============================================================================

class AuthHelpers:
    """Helper functions for Supabase Auth operations."""
    
    @staticmethod
    async def signup_guardian(email: str, password: str, name: str, 
                              phone: str = None, relationship: str = None) -> Dict[str, Any]:
        """Sign up a new guardian (creates auth user and guardian profile).
        Returns dict with 'success', 'user', 'guardian', 'session', or 'error' keys.
        
        IMPORTANT: Uses auth.admin.create_user() to avoid corrupting the singleton
        client's auth state. auth.sign_up() would switch the client to use the new
        user's session, causing subsequent table operations to hit RLS policies.
        """
        try:
            # Use admin API to create user - this does NOT affect client auth state
            # Unlike auth.sign_up() which switches the client to the new user's session
            auth_result = get_supabase().auth.admin.create_user({
                "email": email,
                "password": password,
                "email_confirm": True,  # Confirm email automatically for family portal
                "user_metadata": {
                    "name": name,
                    "role": "guardian",
                    "relationship": relationship
                }
            })
            
            if auth_result.user:
                # Create guardian profile - client still has service_role context
                try:
                    guardian = await GuardianDB.create(
                        user_id=auth_result.user.id,
                        name=name,
                        email=email,
                        phone=phone,
                        relationship=relationship
                    )
                    if not guardian:
                        logger.warning(f"GuardianDB.create returned None for {email} - profile may not have been created")
                except Exception as profile_error:
                    logger.error(f"Failed to create guardian profile for {email}: {profile_error}")
                    guardian = None
                    
                return {
                    "success": True,
                    "user": auth_result.user,
                    "guardian": guardian,
                    "session": None  # Admin create doesn't return a session - user must login
                }
            return {"success": False, "error": "User creation failed - no user returned"}
        except Exception as e:
            error_msg = str(e)
            logger.error(f"Error signing up guardian: {error_msg}")
            return {"success": False, "error": error_msg}
    
    @staticmethod
    async def login_guardian(email: str, password: str) -> Optional[Dict[str, Any]]:
        """Log in a guardian.
        
        IMPORTANT: Uses a fresh auth client to avoid corrupting the main singleton.
        sign_in_with_password() switches the client to use user's session token,
        which would break subsequent table operations needing service_role.
        """
        try:
            # Use fresh client for auth to avoid corrupting main singleton
            auth_client = get_auth_client()
            result = auth_client.auth.sign_in_with_password({
                "email": email,
                "password": password
            })
            
            if result.user:
                # Use main singleton (with service_role) for table operations
                guardian = await GuardianDB.get_by_id(result.user.id)
                
                # Auto-create guardian profile if it doesn't exist
                # (handles cases where signup didn't complete properly)
                if not guardian:
                    user_metadata = result.user.user_metadata or {}
                    guardian = await GuardianDB.create(
                        user_id=result.user.id,
                        name=user_metadata.get("name", email.split("@")[0]),
                        email=email,
                        relationship=user_metadata.get("relationship", "Family Member")
                    )
                    logger.info(f"Auto-created missing guardian profile for {email}")
                
                patients = await GuardianDB.get_patients(result.user.id)
                return {
                    "user": result.user,
                    "guardian": guardian,
                    "patients": patients,
                    "session": result.session
                }
            return None
        except Exception as e:
            logger.error(f"Error logging in guardian: {e}")
            return None
    
    @staticmethod
    async def verify_session(access_token: str) -> Optional[Dict[str, Any]]:
        """Verify a session token and return user info.
        
        Uses fresh auth client to avoid potential state issues.
        """
        try:
            auth_client = get_auth_client()
            result = auth_client.auth.get_user(access_token)
            if result.user:
                # Use main singleton for table operations
                guardian = await GuardianDB.get_by_id(result.user.id)
                return {
                    "user": result.user,
                    "guardian": guardian
                }
            return None
        except Exception as e:
            logger.error(f"Error verifying session: {e}")
            return None
