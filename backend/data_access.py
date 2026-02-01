"""
Data Access Layer for Claire Healthcare Robot Interface.
Provides a unified interface that uses Supabase when configured,
with fallback to in-memory storage for development/demo mode.
"""

import os
import logging
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any, Callable
from dataclasses import dataclass
import uuid as uuid_lib
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger(__name__)

# Check if Supabase is configured
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")

def _is_supabase_configured() -> bool:
    """Check if Supabase is properly configured."""
    return bool(
        SUPABASE_URL and 
        SUPABASE_SERVICE_KEY and 
        SUPABASE_URL != "https://your-project.supabase.co"
    )

# ============================================================================
# IN-MEMORY FALLBACK STORAGE
# ============================================================================

class InMemoryStore:
    """In-memory storage for development/demo mode."""
    
    def __init__(self):
        self.patients: Dict[str, Dict] = {}
        self.guardians: Dict[str, Dict] = {}
        self.guardian_patients: Dict[str, List[str]] = {}  # guardian_id -> [patient_ids]
        self.patient_settings: Dict[str, Dict] = {}
        self.contacts: Dict[str, Dict] = {}
        self.reminders: Dict[str, Dict] = {}
        self.conversations: Dict[str, List[Dict]] = {}  # patient_id -> [messages]
        self.call_sessions: Dict[str, Dict] = {}
        self.activity_log: Dict[str, List[Dict]] = {}  # patient_id -> [activities]
        self.invite_codes: Dict[str, Dict] = {}  # code -> invite_data
        self.family_accounts: Dict[str, Dict] = {}  # email -> account
        self.family_sessions: Dict[str, Dict] = {}  # token -> session

# Global in-memory store instance
_memory_store = InMemoryStore()


# ============================================================================
# UNIFIED DATA ACCESS INTERFACE
# ============================================================================

class DataAccess:
    """
    Unified data access layer.
    Uses Supabase when configured, falls back to in-memory storage otherwise.
    """
    
    def __init__(self):
        self._use_supabase = _is_supabase_configured()
        self._supabase = None
        
        if self._use_supabase:
            try:
                from supabase_client import get_supabase
                self._supabase = get_supabase()
                logger.info("DataAccess: Using Supabase backend")
            except Exception as e:
                logger.warning(f"DataAccess: Failed to initialize Supabase ({e}), using in-memory")
                self._use_supabase = False
        else:
            logger.info("DataAccess: Using in-memory backend (Supabase not configured)")
    
    @property
    def is_using_supabase(self) -> bool:
        return self._use_supabase
    
    # ========================================================================
    # PATIENT OPERATIONS
    # ========================================================================
    
    async def get_patient(self, patient_id: str) -> Optional[Dict]:
        """Get a patient by ID."""
        if self._use_supabase:
            try:
                result = self._supabase.table("patients").select("*").eq("id", patient_id).single().execute()
                return result.data
            except:
                return None
        else:
            return _memory_store.patients.get(patient_id)
    
    async def create_patient(self, name: str, room_number: str = None, 
                            device_id: str = None, patient_id: str = None) -> Optional[Dict]:
        """Create a new patient."""
        if patient_id is None:
            patient_id = f"patient-{uuid_lib.uuid4().hex[:8]}"
        
        patient_data = {
            "id": patient_id,
            "name": name,
            "room_number": room_number,
            "device_id": device_id,
            "created_at": datetime.utcnow().isoformat(),
            "updated_at": datetime.utcnow().isoformat()
        }
        
        if self._use_supabase:
            try:
                result = self._supabase.table("patients").insert(patient_data).execute()
                return result.data[0] if result.data else None
            except Exception as e:
                logger.error(f"Error creating patient: {e}")
                return None
        else:
            _memory_store.patients[patient_id] = patient_data
            return patient_data
    
    async def get_or_create_default_patient(self) -> Dict:
        """Get or create the default patient for demo mode."""
        default_id = "patient-main"
        patient = await self.get_patient(default_id)
        
        if not patient:
            patient = await self.create_patient(
                name="Patient",
                room_number="101",
                patient_id=default_id
            )
        
        return patient
    
    # ========================================================================
    # GUARDIAN/FAMILY AUTH OPERATIONS
    # ========================================================================
    
    async def register_guardian(self, name: str, email: str, password: str,
                                relationship: str = "Family Member",
                                patient_id: str = None) -> Optional[Dict]:
        """Register a new guardian/family member."""
        if self._use_supabase:
            try:
                # Use Supabase Auth
                auth_result = self._supabase.auth.sign_up({
                    "email": email,
                    "password": password,
                    "options": {
                        "data": {
                            "name": name,
                            "relationship": relationship,
                            "role": "guardian"
                        }
                    }
                })
                
                if auth_result.user:
                    # Create guardian profile
                    guardian_data = {
                        "id": auth_result.user.id,
                        "name": name,
                        "email": email,
                        "relationship": relationship,
                        "created_at": datetime.utcnow().isoformat()
                    }
                    self._supabase.table("guardians").insert(guardian_data).execute()
                    
                    # Link to patient if provided
                    if patient_id:
                        await self.link_guardian_to_patient(auth_result.user.id, patient_id)
                    
                    return {
                        "id": auth_result.user.id,
                        "name": name,
                        "email": email,
                        "relationship": relationship,
                        "patient_id": patient_id
                    }
                return None
            except Exception as e:
                logger.error(f"Supabase registration error: {e}")
                raise
        else:
            # In-memory registration
            email_lower = email.lower()
            if email_lower in _memory_store.family_accounts:
                raise ValueError("Email already registered")
            
            guardian_id = f"guardian-{uuid_lib.uuid4().hex[:8]}"
            account = {
                "id": guardian_id,
                "name": name,
                "email": email_lower,
                "password": password,  # In production, hash this!
                "relationship": relationship,
                "patient_id": patient_id or "patient-main",
                "created_at": datetime.utcnow().isoformat()
            }
            _memory_store.family_accounts[email_lower] = account
            _memory_store.guardians[guardian_id] = account
            
            # Link to patient
            if patient_id:
                await self.link_guardian_to_patient(guardian_id, patient_id)
            
            return account
    
    async def login_guardian(self, email: str, password: str) -> Optional[Dict]:
        """Login a guardian/family member."""
        if self._use_supabase:
            try:
                result = self._supabase.auth.sign_in_with_password({
                    "email": email,
                    "password": password
                })
                
                if result.user:
                    # Get guardian profile
                    guardian = self._supabase.table("guardians").select("*").eq("id", result.user.id).single().execute()
                    
                    # Get linked patients
                    patients = await self.get_guardian_patients(result.user.id)
                    
                    return {
                        "user": result.user,
                        "session": result.session,
                        "guardian": guardian.data,
                        "patients": patients,
                        "token": result.session.access_token if result.session else None
                    }
                return None
            except Exception as e:
                logger.error(f"Supabase login error: {e}")
                return None
        else:
            # In-memory login
            email_lower = email.lower()
            account = _memory_store.family_accounts.get(email_lower)
            
            # Demo mode: create account on-the-fly if doesn't exist
            if not account:
                guardian_id = f"guardian-{uuid_lib.uuid4().hex[:8]}"
                account = {
                    "id": guardian_id,
                    "name": email.split("@")[0].title(),
                    "email": email_lower,
                    "password": password,
                    "relationship": "Family Member",
                    "patient_id": "patient-main",
                    "created_at": datetime.utcnow().isoformat()
                }
                _memory_store.family_accounts[email_lower] = account
                _memory_store.guardians[guardian_id] = account
            
            if account.get("password") != password:
                return None
            
            # Create session token
            token = f"session-{uuid_lib.uuid4().hex}"
            _memory_store.family_sessions[token] = {
                "guardian_id": account["id"],
                "created_at": datetime.utcnow().isoformat()
            }
            
            return {
                "token": token,
                "guardian_id": account["id"],
                "name": account["name"],
                "patient_id": account.get("patient_id", "patient-main")
            }
    
    async def verify_session(self, token: str) -> Optional[Dict]:
        """Verify a session token."""
        if self._use_supabase:
            try:
                result = self._supabase.auth.get_user(token)
                if result.user:
                    guardian = self._supabase.table("guardians").select("*").eq("id", result.user.id).single().execute()
                    return {"user": result.user, "guardian": guardian.data}
                return None
            except:
                return None
        else:
            session = _memory_store.family_sessions.get(token)
            if session:
                guardian = _memory_store.guardians.get(session["guardian_id"])
                return {"guardian": guardian}
            return None
    
    async def logout_guardian(self, token: str) -> bool:
        """Logout a guardian."""
        if self._use_supabase:
            try:
                self._supabase.auth.sign_out()
                return True
            except:
                return False
        else:
            if token in _memory_store.family_sessions:
                del _memory_store.family_sessions[token]
            return True
    
    # ========================================================================
    # GUARDIAN-PATIENT LINK OPERATIONS
    # ========================================================================
    
    async def link_guardian_to_patient(self, guardian_id: str, patient_id: str, 
                                       is_primary: bool = False) -> bool:
        """Link a guardian to a patient."""
        if self._use_supabase:
            try:
                self._supabase.table("guardian_patients").insert({
                    "guardian_id": guardian_id,
                    "patient_id": patient_id,
                    "is_primary": is_primary
                }).execute()
                return True
            except:
                return False
        else:
            if guardian_id not in _memory_store.guardian_patients:
                _memory_store.guardian_patients[guardian_id] = []
            if patient_id not in _memory_store.guardian_patients[guardian_id]:
                _memory_store.guardian_patients[guardian_id].append(patient_id)
            return True
    
    async def get_guardian_patients(self, guardian_id: str) -> List[Dict]:
        """Get all patients linked to a guardian."""
        if self._use_supabase:
            try:
                result = self._supabase.table("guardian_patients").select(
                    "*, patients(*)"
                ).eq("guardian_id", guardian_id).execute()
                return [gp["patients"] for gp in result.data if gp.get("patients")] if result.data else []
            except:
                return []
        else:
            patient_ids = _memory_store.guardian_patients.get(guardian_id, [])
            return [_memory_store.patients.get(pid) for pid in patient_ids if pid in _memory_store.patients]
    
    # ========================================================================
    # PATIENT SETTINGS OPERATIONS
    # ========================================================================
    
    async def get_patient_settings(self, patient_id: str) -> Optional[Dict]:
        """Get settings for a patient."""
        if self._use_supabase:
            try:
                result = self._supabase.table("patient_settings").select("*").eq("patient_id", patient_id).single().execute()
                return result.data
            except:
                return None
        else:
            return _memory_store.patient_settings.get(patient_id)
    
    async def update_patient_settings(self, patient_id: str, settings: Dict) -> Optional[Dict]:
        """Update patient settings."""
        settings["patient_id"] = patient_id
        settings["updated_at"] = datetime.utcnow().isoformat()
        
        if self._use_supabase:
            try:
                result = self._supabase.table("patient_settings").upsert(
                    settings, on_conflict="patient_id"
                ).execute()
                return result.data[0] if result.data else None
            except:
                return None
        else:
            existing = _memory_store.patient_settings.get(patient_id, {})
            existing.update(settings)
            _memory_store.patient_settings[patient_id] = existing
            return existing
    
    # ========================================================================
    # CONTACTS OPERATIONS
    # ========================================================================
    
    async def get_contacts(self, patient_id: str) -> List[Dict]:
        """Get all contacts for a patient."""
        if self._use_supabase:
            try:
                result = self._supabase.table("contacts").select("*").eq(
                    "patient_id", patient_id
                ).order("sort_order").execute()
                return result.data or []
            except:
                return []
        else:
            return [c for c in _memory_store.contacts.values() 
                   if c.get("patient_id") == patient_id]
    
    async def get_contact(self, contact_id: str) -> Optional[Dict]:
        """Get a contact by ID."""
        if self._use_supabase:
            try:
                result = self._supabase.table("contacts").select("*").eq("id", contact_id).single().execute()
                return result.data
            except:
                return None
        else:
            return _memory_store.contacts.get(contact_id)
    
    async def create_contact(self, patient_id: str, name: str, phone: str = None,
                            email: str = None, relationship: str = None,
                            is_emergency: bool = False, contact_id: str = None) -> Optional[Dict]:
        """Create a new contact."""
        if contact_id is None:
            contact_id = f"contact-{uuid_lib.uuid4().hex[:8]}"
        
        contact_data = {
            "id": contact_id,
            "patient_id": patient_id,
            "name": name,
            "phone": phone,
            "email": email,
            "relationship": relationship,
            "is_emergency_contact": is_emergency,
            "is_favorite": False,
            "sort_order": 0,
            "created_at": datetime.utcnow().isoformat()
        }
        
        if self._use_supabase:
            try:
                result = self._supabase.table("contacts").insert(contact_data).execute()
                return result.data[0] if result.data else None
            except:
                return None
        else:
            _memory_store.contacts[contact_id] = contact_data
            return contact_data
    
    async def delete_contact(self, contact_id: str) -> bool:
        """Delete a contact."""
        if self._use_supabase:
            try:
                self._supabase.table("contacts").delete().eq("id", contact_id).execute()
                return True
            except:
                return False
        else:
            if contact_id in _memory_store.contacts:
                del _memory_store.contacts[contact_id]
                return True
            return False
    
    # ========================================================================
    # REMINDERS OPERATIONS
    # ========================================================================
    
    async def get_reminders(self, patient_id: str, active_only: bool = True) -> List[Dict]:
        """Get reminders for a patient."""
        if self._use_supabase:
            try:
                query = self._supabase.table("reminders").select("*").eq("patient_id", patient_id)
                if active_only:
                    query = query.eq("is_active", True)
                result = query.order("scheduled_time").execute()
                return result.data or []
            except:
                return []
        else:
            reminders = [r for r in _memory_store.reminders.values() 
                        if r.get("patient_id") == patient_id]
            if active_only:
                reminders = [r for r in reminders if r.get("is_active", True)]
            return sorted(reminders, key=lambda r: r.get("scheduled_time", ""))
    
    async def create_reminder(self, patient_id: str, title: str, scheduled_time: str,
                             reminder_type: str = "general", description: str = None,
                             reminder_id: str = None) -> Optional[Dict]:
        """Create a new reminder."""
        if reminder_id is None:
            reminder_id = f"reminder-{uuid_lib.uuid4().hex[:8]}"
        
        reminder_data = {
            "id": reminder_id,
            "patient_id": patient_id,
            "title": title,
            "description": description,
            "reminder_type": reminder_type,
            "scheduled_time": scheduled_time,
            "is_active": True,
            "is_acknowledged": False,
            "created_at": datetime.utcnow().isoformat()
        }
        
        if self._use_supabase:
            try:
                result = self._supabase.table("reminders").insert(reminder_data).execute()
                return result.data[0] if result.data else None
            except:
                return None
        else:
            _memory_store.reminders[reminder_id] = reminder_data
            return reminder_data
    
    async def delete_reminder(self, reminder_id: str) -> bool:
        """Delete a reminder."""
        if self._use_supabase:
            try:
                self._supabase.table("reminders").delete().eq("id", reminder_id).execute()
                return True
            except:
                return False
        else:
            if reminder_id in _memory_store.reminders:
                del _memory_store.reminders[reminder_id]
                return True
            return False
    
    # ========================================================================
    # CONVERSATION HISTORY OPERATIONS
    # ========================================================================
    
    async def add_conversation_message(self, patient_id: str, role: str, content: str,
                                       session_id: str = None, detected_intent: str = None,
                                       command_executed: str = None) -> Optional[Dict]:
        """Add a message to conversation history."""
        message_id = f"msg-{uuid_lib.uuid4().hex[:8]}"
        message_data = {
            "id": message_id,
            "patient_id": patient_id,
            "role": role,
            "content": content,
            "session_id": session_id,
            "detected_intent": detected_intent,
            "command_executed": command_executed,
            "created_at": datetime.utcnow().isoformat()
        }
        
        if self._use_supabase:
            try:
                result = self._supabase.table("conversation_messages").insert(message_data).execute()
                return result.data[0] if result.data else None
            except:
                return None
        else:
            if patient_id not in _memory_store.conversations:
                _memory_store.conversations[patient_id] = []
            _memory_store.conversations[patient_id].append(message_data)
            return message_data
    
    async def get_conversation_history(self, patient_id: str, limit: int = 50) -> List[Dict]:
        """Get recent conversation messages for a patient."""
        if self._use_supabase:
            try:
                result = self._supabase.table("conversation_messages").select("*").eq(
                    "patient_id", patient_id
                ).order("created_at", desc=True).limit(limit).execute()
                return list(reversed(result.data)) if result.data else []
            except:
                return []
        else:
            messages = _memory_store.conversations.get(patient_id, [])
            return messages[-limit:]  # Return last N messages
    
    # ========================================================================
    # ACTIVITY LOG OPERATIONS
    # ========================================================================
    
    async def log_activity(self, patient_id: str, activity_type: str,
                          description: str = None, metadata: Dict = None) -> Optional[Dict]:
        """Log an activity."""
        activity_id = f"activity-{uuid_lib.uuid4().hex[:8]}"
        activity_data = {
            "id": activity_id,
            "patient_id": patient_id,
            "activity_type": activity_type,
            "description": description,
            "metadata": metadata or {},
            "created_at": datetime.utcnow().isoformat()
        }
        
        if self._use_supabase:
            try:
                result = self._supabase.table("activity_log").insert(activity_data).execute()
                return result.data[0] if result.data else None
            except:
                return None
        else:
            if patient_id not in _memory_store.activity_log:
                _memory_store.activity_log[patient_id] = []
            _memory_store.activity_log[patient_id].append(activity_data)
            return activity_data
    
    async def get_activity_log(self, patient_id: str, limit: int = 50) -> List[Dict]:
        """Get recent activity for a patient."""
        if self._use_supabase:
            try:
                result = self._supabase.table("activity_log").select("*").eq(
                    "patient_id", patient_id
                ).order("created_at", desc=True).limit(limit).execute()
                return result.data or []
            except:
                return []
        else:
            activities = _memory_store.activity_log.get(patient_id, [])
            return list(reversed(activities[-limit:]))
    
    # ========================================================================
    # INVITE CODE OPERATIONS
    # ========================================================================
    
    async def create_invite_code(self, patient_id: str, expires_hours: int = 48) -> Optional[str]:
        """Create an invite code for patient device pairing."""
        import secrets
        code = secrets.token_urlsafe(4).upper()[:6]  # 6 character code
        expires_at = datetime.utcnow() + timedelta(hours=expires_hours)
        
        invite_data = {
            "code": code,
            "patient_id": patient_id,
            "expires_at": expires_at.isoformat(),
            "is_active": True,
            "created_at": datetime.utcnow().isoformat()
        }
        
        if self._use_supabase:
            try:
                self._supabase.table("invite_codes").insert(invite_data).execute()
                return code
            except:
                return None
        else:
            _memory_store.invite_codes[code] = invite_data
            return code
    
    async def redeem_invite_code(self, code: str, guardian_id: str) -> Optional[str]:
        """Redeem an invite code and link guardian to patient. Returns patient_id."""
        if self._use_supabase:
            try:
                result = self._supabase.table("invite_codes").select("*").eq(
                    "code", code
                ).eq("is_active", True).single().execute()
                
                if not result.data:
                    return None
                
                invite = result.data
                expires_at = datetime.fromisoformat(invite["expires_at"].replace("Z", "+00:00"))
                if expires_at < datetime.utcnow().replace(tzinfo=expires_at.tzinfo):
                    return None
                
                # Link guardian to patient
                await self.link_guardian_to_patient(guardian_id, invite["patient_id"])
                
                # Deactivate code
                self._supabase.table("invite_codes").update({"is_active": False}).eq("code", code).execute()
                
                return invite["patient_id"]
            except:
                return None
        else:
            invite = _memory_store.invite_codes.get(code)
            if not invite or not invite.get("is_active"):
                return None
            
            expires_at = datetime.fromisoformat(invite["expires_at"])
            if expires_at < datetime.utcnow():
                return None
            
            # Link guardian to patient
            await self.link_guardian_to_patient(guardian_id, invite["patient_id"])
            
            # Deactivate code
            invite["is_active"] = False
            
            return invite["patient_id"]


# Global data access instance
data_access = DataAccess()
