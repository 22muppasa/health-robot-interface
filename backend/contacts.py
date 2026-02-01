"""
Contact and Guardian/Patient Relationship Management
Handles storing, retrieving, and managing contacts for patients and guardians.
"""

from typing import Dict, List, Optional, Any
from dataclasses import dataclass, field, asdict
from datetime import datetime
from enum import Enum
import json

class ContactType(Enum):
    """Types of contacts."""
    EMERGENCY = "emergency"
    FAMILY = "family"
    GUARDIAN = "guardian"
    FRIEND = "friend"
    HEALTHCARE_PROVIDER = "healthcare_provider"
    OTHER = "other"

class RelationshipType(Enum):
    """Types of relationships between people."""
    GUARDIAN = "guardian"
    CAREGIVER = "caregiver"
    FAMILY_MEMBER = "family_member"
    FRIEND = "friend"
    DOCTOR = "doctor"
    NURSE = "nurse"

@dataclass
class Contact:
    """Represents a person that can be contacted."""
    id: str
    name: str
    phone: Optional[str] = None
    email: Optional[str] = None
    relationship: str = "other"  # son, daughter, doctor, etc.
    type: str = "family"  # family, emergency, healthcare_provider, etc.
    photo_url: Optional[str] = None
    is_video_capable: bool = True
    created_at: str = field(default_factory=lambda: datetime.now().isoformat())
    notes: Optional[str] = None
    
    def to_dict(self) -> dict:
        return asdict(self)

@dataclass
class Guardian:
    """Represents a guardian/caregiver for a patient."""
    id: str
    name: str
    email: str
    role: str = "guardian"  # guardian, caregiver, doctor
    patients: List[str] = field(default_factory=list)  # List of patient IDs
    phone: Optional[str] = None
    can_view_video: bool = True
    can_edit_health: bool = True
    can_make_calls: bool = True
    created_at: str = field(default_factory=lambda: datetime.now().isoformat())
    
    def to_dict(self) -> dict:
        return asdict(self)

@dataclass
class Patient:
    """Represents a patient in the system."""
    id: str
    name: str
    email: str
    age: Optional[int] = None
    medical_history: Optional[str] = None
    allergies: Optional[List[str]] = field(default_factory=list)
    medications: Optional[List[str]] = field(default_factory=list)
    guardians: List[str] = field(default_factory=list)  # List of guardian IDs
    contacts: List[str] = field(default_factory=list)  # List of contact IDs
    emergency_contacts: List[str] = field(default_factory=list)  # List of contact IDs
    family_contacts: List[str] = field(default_factory=list)  # List of contact IDs
    created_at: str = field(default_factory=lambda: datetime.now().isoformat())
    
    def to_dict(self) -> dict:
        return asdict(self)

class ContactManager:
    """Manages contacts, guardians, and patient relationships."""
    
    def __init__(self):
        # In-memory storage - in production use a database
        self.contacts: Dict[str, Contact] = {}
        self.guardians: Dict[str, Guardian] = {}
        self.patients: Dict[str, Patient] = {}
        self.guardian_patient_relationships: Dict[str, set] = {}  # guardian_id -> set of patient_ids
        self.patient_guardian_relationships: Dict[str, set] = {}  # patient_id -> set of guardian_ids
        
    # ============ Contact Management ============
    
    def add_contact(self, contact_id: str, name: str, phone: Optional[str] = None,
                   email: Optional[str] = None, relationship: str = "other",
                   contact_type: str = "family", is_video_capable: bool = True) -> Contact:
        """Add a new contact."""
        contact = Contact(
            id=contact_id,
            name=name,
            phone=phone,
            email=email,
            relationship=relationship,
            type=contact_type,
            is_video_capable=is_video_capable
        )
        self.contacts[contact_id] = contact
        return contact
    
    def get_contact(self, contact_id: str) -> Optional[Contact]:
        """Get a contact by ID."""
        return self.contacts.get(contact_id)
    
    def get_contact_by_name(self, name: str) -> Optional[Contact]:
        """Find a contact by name (case-insensitive) with fuzzy matching."""
        name_lower = name.lower().strip()
        
        # Relationship aliases for common terms
        relationship_aliases = {
            'mom': ['mother', 'mama', 'mum', 'mommy'],
            'mother': ['mom', 'mama', 'mum', 'mommy'],
            'dad': ['father', 'papa', 'daddy', 'pop'],
            'father': ['dad', 'papa', 'daddy', 'pop'],
            'grandma': ['grandmother', 'granny', 'nana', 'gran'],
            'grandmother': ['grandma', 'granny', 'nana', 'gran'],
            'grandpa': ['grandfather', 'gramps', 'grandad', 'papa'],
            'grandfather': ['grandpa', 'gramps', 'grandad'],
            'sis': ['sister'],
            'sister': ['sis'],
            'bro': ['brother'],
            'brother': ['bro'],
            'doc': ['doctor', 'dr'],
            'doctor': ['doc', 'dr'],
        }
        
        # Build list of names to search for
        search_terms = [name_lower]
        
        # Remove common prefixes like "my"
        if name_lower.startswith('my '):
            search_terms.append(name_lower[3:])
        
        # Add aliases
        for term in list(search_terms):
            if term in relationship_aliases:
                search_terms.extend(relationship_aliases[term])
        
        # Search for exact name match first
        for contact in self.contacts.values():
            contact_name_lower = contact.name.lower()
            if contact_name_lower in search_terms:
                return contact
        
        # Search by relationship
        for contact in self.contacts.values():
            contact_rel_lower = contact.relationship.lower()
            if contact_rel_lower in search_terms:
                return contact
        
        # Partial name match (starts with)
        for contact in self.contacts.values():
            contact_name_lower = contact.name.lower()
            for term in search_terms:
                if contact_name_lower.startswith(term) or term.startswith(contact_name_lower):
                    return contact
        
        # Partial relationship match
        for contact in self.contacts.values():
            contact_rel_lower = contact.relationship.lower()
            for term in search_terms:
                if contact_rel_lower.startswith(term) or term in contact_rel_lower:
                    return contact
        
        return None
    
    def find_contacts_by_fuzzy_name(self, name: str, limit: int = 5) -> List[Contact]:
        """Find multiple contacts that might match the given name."""
        name_lower = name.lower().strip()
        matches = []
        
        # Remove common prefixes
        if name_lower.startswith('my '):
            name_lower = name_lower[3:]
        
        for contact in self.contacts.values():
            score = 0
            contact_name_lower = contact.name.lower()
            contact_rel_lower = contact.relationship.lower()
            
            # Exact match gets highest score
            if contact_name_lower == name_lower:
                score = 100
            elif contact_rel_lower == name_lower:
                score = 90
            # Starts with
            elif contact_name_lower.startswith(name_lower):
                score = 80
            elif name_lower.startswith(contact_name_lower):
                score = 75
            # Contains
            elif name_lower in contact_name_lower:
                score = 60
            elif name_lower in contact_rel_lower:
                score = 55
            
            if score > 0:
                matches.append((score, contact))
        
        # Sort by score descending
        matches.sort(key=lambda x: x[0], reverse=True)
        return [m[1] for m in matches[:limit]]
    
    def update_contact(self, contact_id: str, **kwargs) -> Optional[Contact]:
        """Update a contact by ID."""
        if contact_id not in self.contacts:
            return None
        
        contact = self.contacts[contact_id]
        for key, value in kwargs.items():
            if hasattr(contact, key):
                setattr(contact, key, value)
        
        return contact
    
    def delete_contact(self, contact_id: str) -> bool:
        """Delete a contact."""
        if contact_id in self.contacts:
            del self.contacts[contact_id]
            return True
        return False
    
    def list_contacts(self) -> List[Contact]:
        """Get all contacts."""
        return list(self.contacts.values())
    
    # ============ Patient Management ============
    
    def add_patient(self, patient_id: str, name: str, email: str,
                   age: Optional[int] = None, medical_history: Optional[str] = None) -> Patient:
        """Add a new patient."""
        patient = Patient(
            id=patient_id,
            name=name,
            email=email,
            age=age,
            medical_history=medical_history
        )
        self.patients[patient_id] = patient
        self.patient_guardian_relationships[patient_id] = set()
        return patient
    
    def get_patient(self, patient_id: str) -> Optional[Patient]:
        """Get a patient by ID."""
        return self.patients.get(patient_id)
    
    def get_patient_by_email(self, email: str) -> Optional[Patient]:
        """Find a patient by email."""
        for patient in self.patients.values():
            if patient.email.lower() == email.lower():
                return patient
        return None
    
    def delete_patient(self, patient_id: str) -> bool:
        """Delete a patient and all their relationships."""
        if patient_id in self.patients:
            # Remove from all guardian relationships
            guardian_ids = self.patient_guardian_relationships.get(patient_id, set()).copy()
            for guardian_id in guardian_ids:
                self.remove_guardian_from_patient(guardian_id, patient_id)
            
            del self.patients[patient_id]
            if patient_id in self.patient_guardian_relationships:
                del self.patient_guardian_relationships[patient_id]
            return True
        return False
    
    def add_contact_to_patient(self, patient_id: str, contact_id: str,
                              contact_type: str = "family") -> bool:
        """Add a contact to a patient's contact list."""
        if patient_id not in self.patients or contact_id not in self.contacts:
            return False
        
        patient = self.patients[patient_id]
        
        if contact_type == "emergency":
            if contact_id not in patient.emergency_contacts:
                patient.emergency_contacts.append(contact_id)
        elif contact_type == "family":
            if contact_id not in patient.family_contacts:
                patient.family_contacts.append(contact_id)
        else:
            if contact_id not in patient.contacts:
                patient.contacts.append(contact_id)
        
        return True
    
    def remove_contact_from_patient(self, patient_id: str, contact_id: str) -> bool:
        """Remove a contact from a patient."""
        if patient_id not in self.patients:
            return False
        
        patient = self.patients[patient_id]
        removed = False
        
        if contact_id in patient.contacts:
            patient.contacts.remove(contact_id)
            removed = True
        if contact_id in patient.emergency_contacts:
            patient.emergency_contacts.remove(contact_id)
            removed = True
        if contact_id in patient.family_contacts:
            patient.family_contacts.remove(contact_id)
            removed = True
        
        return removed
    
    def get_patient_contacts(self, patient_id: str, contact_type: str = "all") -> List[Contact]:
        """Get all contacts for a patient."""
        if patient_id not in self.patients:
            return []
        
        patient = self.patients[patient_id]
        contact_ids = []
        
        if contact_type in ["all", "family"]:
            contact_ids.extend(patient.family_contacts)
        if contact_type in ["all", "emergency"]:
            contact_ids.extend(patient.emergency_contacts)
        if contact_type in ["all", "other"]:
            contact_ids.extend(patient.contacts)
        
        # Remove duplicates and get contact objects
        contacts = []
        seen = set()
        for contact_id in contact_ids:
            if contact_id not in seen and contact_id in self.contacts:
                contacts.append(self.contacts[contact_id])
                seen.add(contact_id)
        
        return contacts
    
    # ============ Guardian Management ============
    
    def add_guardian(self, guardian_id: str, name: str, email: str, role: str = "guardian",
                    phone: Optional[str] = None) -> Guardian:
        """Add a new guardian."""
        guardian = Guardian(
            id=guardian_id,
            name=name,
            email=email,
            role=role,
            phone=phone
        )
        self.guardians[guardian_id] = guardian
        self.guardian_patient_relationships[guardian_id] = set()
        return guardian
    
    def get_guardian(self, guardian_id: str) -> Optional[Guardian]:
        """Get a guardian by ID."""
        return self.guardians.get(guardian_id)
    
    def get_guardian_by_email(self, email: str) -> Optional[Guardian]:
        """Find a guardian by email."""
        for guardian in self.guardians.values():
            if guardian.email.lower() == email.lower():
                return guardian
        return None
    
    def delete_guardian(self, guardian_id: str) -> bool:
        """Delete a guardian and all their relationships."""
        if guardian_id in self.guardians:
            # Remove from all patient relationships
            patient_ids = self.guardian_patient_relationships.get(guardian_id, set()).copy()
            for patient_id in patient_ids:
                self.remove_guardian_from_patient(guardian_id, patient_id)
            
            del self.guardians[guardian_id]
            if guardian_id in self.guardian_patient_relationships:
                del self.guardian_patient_relationships[guardian_id]
            return True
        return False
    
    # ============ Guardian-Patient Relationships ============
    
    def add_guardian_to_patient(self, guardian_id: str, patient_id: str) -> bool:
        """Link a guardian to a patient."""
        if guardian_id not in self.guardians or patient_id not in self.patients:
            return False
        
        guardian = self.guardians[guardian_id]
        patient = self.patients[patient_id]
        
        if patient_id not in guardian.patients:
            guardian.patients.append(patient_id)
        if guardian_id not in patient.guardians:
            patient.guardians.append(guardian_id)
        
        self.guardian_patient_relationships[guardian_id].add(patient_id)
        self.patient_guardian_relationships[patient_id].add(guardian_id)
        
        return True
    
    def remove_guardian_from_patient(self, guardian_id: str, patient_id: str) -> bool:
        """Remove a guardian from a patient."""
        if guardian_id in self.guardians and patient_id in self.patients:
            guardian = self.guardians[guardian_id]
            patient = self.patients[patient_id]
            
            if patient_id in guardian.patients:
                guardian.patients.remove(patient_id)
            if guardian_id in patient.guardians:
                patient.guardians.remove(guardian_id)
            
            self.guardian_patient_relationships[guardian_id].discard(patient_id)
            self.patient_guardian_relationships[patient_id].discard(guardian_id)
            
            return True
        return False
    
    def get_patient_guardians(self, patient_id: str) -> List[Guardian]:
        """Get all guardians for a patient."""
        if patient_id not in self.patients:
            return []
        
        patient = self.patients[patient_id]
        guardians = []
        for guardian_id in patient.guardians:
            if guardian_id in self.guardians:
                guardians.append(self.guardians[guardian_id])
        
        return guardians
    
    def get_guardian_patients(self, guardian_id: str) -> List[Patient]:
        """Get all patients for a guardian."""
        if guardian_id not in self.guardians:
            return []
        
        guardian = self.guardians[guardian_id]
        patients = []
        for patient_id in guardian.patients:
            if patient_id in self.patients:
                patients.append(self.patients[patient_id])
        
        return patients
    
    # ============ Utility Methods ============
    
    def is_guardian_of_patient(self, guardian_id: str, patient_id: str) -> bool:
        """Check if a guardian is managing a patient."""
        if guardian_id not in self.guardians or patient_id not in self.patients:
            return False
        
        guardian = self.guardians[guardian_id]
        return patient_id in guardian.patients
    
    def find_contact_for_patient(self, patient_id: str, contact_name: str) -> Optional[Contact]:
        """Find a specific contact for a patient by name."""
        contacts = self.get_patient_contacts(patient_id)
        name_lower = contact_name.lower()
        
        # Exact match first
        for contact in contacts:
            if contact.name.lower() == name_lower:
                return contact
        
        # Partial match
        for contact in contacts:
            if name_lower in contact.name.lower() or contact.name.lower().startswith(name_lower):
                return contact
        
        return None
    
    def get_callable_contacts_for_patient(self, patient_id: str) -> List[Contact]:
        """Get all contacts that the patient can call (all contacts)."""
        return self.get_patient_contacts(patient_id)
    
    def get_callable_contacts_for_guardian(self, guardian_id: str) -> List[Patient]:
        """Get all patients that a guardian can call."""
        return self.get_guardian_patients(guardian_id)
    
    def get_incoming_call_contacts(self, contact_id: str) -> List[Contact]:
        """Get who can call this contact (for patients, get guardians/family)."""
        # Return guardians who can call this contact
        incoming = []
        
        # Check if this contact is a patient with guardians
        if contact_id in self.patients:
            patient = self.patients[contact_id]
            for guardian_id in patient.guardians:
                if guardian_id in self.guardians:
                    guardian = self.guardians[guardian_id]
                    # Convert guardian to contact-like format
                    contact = Contact(
                        id=guardian.id,
                        name=guardian.name,
                        phone=guardian.phone,
                        email=guardian.email,
                        relationship="guardian",
                        type="guardian",
                        is_video_capable=guardian.can_make_calls
                    )
                    incoming.append(contact)
        
        return incoming
    
    def get_extended_contacts_for_patient(self, patient_id: str) -> Dict[str, Any]:
        """Get all contacts organized by type for a patient."""
        if patient_id not in self.patients:
            return {
                "all_contacts": [],
                "emergency_contacts": [],
                "family_contacts": [],
                "guardians_as_contacts": [],
                "total": 0
            }
        
        patient = self.patients[patient_id]
        all_contacts = self.get_patient_contacts(patient_id)
        emergency_contacts = [self.contacts[c] for c in patient.emergency_contacts if c in self.contacts]
        family_contacts = [self.contacts[c] for c in patient.family_contacts if c in self.contacts]
        
        # Get guardians as contacts
        guardians_as_contacts = []
        for guardian_id in patient.guardians:
            if guardian_id in self.guardians:
                guardian = self.guardians[guardian_id]
                contact = Contact(
                    id=guardian.id,
                    name=guardian.name,
                    phone=guardian.phone,
                    email=guardian.email,
                    relationship="guardian",
                    type="guardian",
                    is_video_capable=guardian.can_make_calls
                )
                guardians_as_contacts.append(contact)
        
        return {
            "all_contacts": all_contacts,
            "emergency_contacts": emergency_contacts,
            "family_contacts": family_contacts,
            "guardians_as_contacts": guardians_as_contacts,
            "total": len(all_contacts)
        }

# Global contact manager instance
contact_manager = ContactManager()
