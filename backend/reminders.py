"""
Reminders system for Claire healthcare bot.
Manages medication reminders, appointments, and custom reminders.
"""

from typing import List, Dict, Optional, Any
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
import asyncio
import json

class ReminderType(Enum):
    """Types of reminders."""
    MEDICATION = "medication"
    APPOINTMENT = "appointment"
    CUSTOM = "custom"
    VITAL_CHECK = "vital_check"

class ReminderFrequency(Enum):
    """Reminder frequency options."""
    ONCE = "once"
    DAILY = "daily"
    WEEKLY = "weekly"
    MONTHLY = "monthly"

@dataclass
class Reminder:
    """Represents a single reminder."""
    id: str
    title: str
    description: str
    reminder_type: ReminderType
    scheduled_time: datetime
    frequency: ReminderFrequency
    active: bool = True
    created_at: datetime = field(default_factory=datetime.now)
    metadata: Dict[str, Any] = field(default_factory=dict)  # For medication name, dosage, etc.

    def to_dict(self) -> Dict[str, Any]:
        """Convert reminder to dictionary."""
        return {
            "id": self.id,
            "title": self.title,
            "description": self.description,
            "type": self.reminder_type.value,
            "scheduled_time": self.scheduled_time.isoformat(),
            "frequency": self.frequency.value,
            "active": self.active,
            "metadata": self.metadata,
        }

class ReminderManager:
    """Manages reminders for the healthcare system."""
    
    def __init__(self):
        """Initialize reminder manager."""
        self.reminders: Dict[str, Reminder] = {}
        self.reminder_callbacks: List[callable] = []
        self._monitor_task = None
    
    def add_reminder(
        self,
        title: str,
        description: str,
        scheduled_time: datetime,
        reminder_type: ReminderType = ReminderType.CUSTOM,
        frequency: ReminderFrequency = ReminderFrequency.ONCE,
        metadata: Optional[Dict[str, Any]] = None
    ) -> str:
        """
        Add a new reminder.
        
        Args:
            title: Reminder title
            description: Reminder description
            scheduled_time: When reminder should trigger
            reminder_type: Type of reminder
            frequency: How often reminder repeats
            metadata: Additional data (medication name, dosage, etc.)
        
        Returns:
            Reminder ID
        """
        import uuid
        reminder_id = str(uuid.uuid4())[:8]
        
        reminder = Reminder(
            id=reminder_id,
            title=title,
            description=description,
            reminder_type=reminder_type,
            scheduled_time=scheduled_time,
            frequency=frequency,
            metadata=metadata or {}
        )
        
        self.reminders[reminder_id] = reminder
        return reminder_id
    
    def add_medication_reminder(
        self,
        medication_name: str,
        dosage: str,
        scheduled_time: datetime,
        frequency: ReminderFrequency = ReminderFrequency.DAILY
    ) -> str:
        """Add a medication reminder."""
        return self.add_reminder(
            title=f"Take {medication_name}",
            description=f"Take {dosage} of {medication_name}",
            scheduled_time=scheduled_time,
            reminder_type=ReminderType.MEDICATION,
            frequency=frequency,
            metadata={
                "medication_name": medication_name,
                "dosage": dosage
            }
        )
    
    def add_appointment_reminder(
        self,
        appointment_title: str,
        appointment_time: datetime,
        doctor_name: Optional[str] = None
    ) -> str:
        """Add an appointment reminder."""
        return self.add_reminder(
            title=f"Appointment: {appointment_title}",
            description=f"Your {appointment_title} appointment with {doctor_name or 'the doctor'}",
            scheduled_time=appointment_time,
            reminder_type=ReminderType.APPOINTMENT,
            frequency=ReminderFrequency.ONCE,
            metadata={"doctor_name": doctor_name or "Doctor"}
        )
    
    def get_reminder(self, reminder_id: str) -> Optional[Reminder]:
        """Get a reminder by ID."""
        return self.reminders.get(reminder_id)
    
    def get_all_reminders(self, active_only: bool = True) -> List[Reminder]:
        """Get all reminders, optionally filtered to active only."""
        if active_only:
            return [r for r in self.reminders.values() if r.active]
        return list(self.reminders.values())
    
    def get_upcoming_reminders(self, hours_ahead: int = 24) -> List[Reminder]:
        """Get reminders scheduled within the next N hours."""
        now = datetime.now()
        future = now + timedelta(hours=hours_ahead)
        
        return [
            r for r in self.reminders.values()
            if r.active and now <= r.scheduled_time <= future
        ]
    
    def delete_reminder(self, reminder_id: str) -> bool:
        """Delete a reminder."""
        if reminder_id in self.reminders:
            del self.reminders[reminder_id]
            return True
        return False
    
    def deactivate_reminder(self, reminder_id: str) -> bool:
        """Deactivate a reminder (soft delete)."""
        if reminder_id in self.reminders:
            self.reminders[reminder_id].active = False
            return True
        return False
    
    def register_callback(self, callback: callable):
        """Register a callback to be called when reminder triggers."""
        self.reminder_callbacks.append(callback)
    
    async def start_monitoring(self):
        """Start monitoring reminders and trigger callbacks."""
        self._monitor_task = asyncio.create_task(self._monitor_loop())
    
    async def stop_monitoring(self):
        """Stop monitoring reminders."""
        if self._monitor_task:
            self._monitor_task.cancel()
            try:
                await self._monitor_task
            except asyncio.CancelledError:
                pass
    
    async def _monitor_loop(self):
        """Monitor and trigger reminders."""
        triggered_reminders = set()  # Track already triggered reminders in this session
        
        while True:
            try:
                now = datetime.now()
                
                for reminder in self.get_all_reminders(active_only=True):
                    # Check if reminder should trigger (within 1 minute window)
                    # Also check if we haven't already triggered it
                    if (reminder.scheduled_time <= now and 
                        reminder.scheduled_time > now - timedelta(minutes=1) and
                        reminder.id not in triggered_reminders):
                        
                        # Mark as triggered to prevent re-firing
                        triggered_reminders.add(reminder.id)
                        
                        # Trigger callbacks
                        for callback in self.reminder_callbacks:
                            try:
                                if asyncio.iscoroutinefunction(callback):
                                    await callback(reminder)
                                else:
                                    callback(reminder)
                            except Exception as e:
                                print(f"Error in reminder callback: {e}")
                        
                        # Handle recurring reminders vs one-time
                        if reminder.frequency != ReminderFrequency.ONCE:
                            reminder.scheduled_time = self._calculate_next_time(
                                reminder.scheduled_time,
                                reminder.frequency
                            )
                            # Remove from triggered set so it can fire again at new time
                            triggered_reminders.discard(reminder.id)
                        else:
                            # Deactivate one-time reminders after they fire
                            reminder.active = False
                
                # Clean up old triggered reminder IDs periodically
                if len(triggered_reminders) > 100:
                    triggered_reminders.clear()
                
                # Check every 30 seconds
                await asyncio.sleep(30)
            
            except asyncio.CancelledError:
                break
            except Exception as e:
                print(f"Error in reminder monitoring: {e}")
                await asyncio.sleep(30)
    
    @staticmethod
    def _calculate_next_time(
        current_time: datetime,
        frequency: ReminderFrequency
    ) -> datetime:
        """Calculate next reminder time based on frequency."""
        if frequency == ReminderFrequency.DAILY:
            return current_time + timedelta(days=1)
        elif frequency == ReminderFrequency.WEEKLY:
            return current_time + timedelta(weeks=1)
        elif frequency == ReminderFrequency.MONTHLY:
            # Add one month (approximately)
            if current_time.month == 12:
                return current_time.replace(year=current_time.year + 1, month=1)
            else:
                return current_time.replace(month=current_time.month + 1)
        else:
            return current_time
    
    def export_reminders(self) -> List[Dict[str, Any]]:
        """Export all reminders as dictionaries."""
        return [r.to_dict() for r in self.reminders.values()]
    
    def import_reminders(self, reminders_data: List[Dict[str, Any]]):
        """Import reminders from dictionaries."""
        for data in reminders_data:
            reminder = Reminder(
                id=data.get("id", str(__import__('uuid').uuid4())[:8]),
                title=data["title"],
                description=data["description"],
                reminder_type=ReminderType(data["type"]),
                scheduled_time=datetime.fromisoformat(data["scheduled_time"]),
                frequency=ReminderFrequency(data["frequency"]),
                active=data.get("active", True),
                metadata=data.get("metadata", {})
            )
            self.reminders[reminder.id] = reminder
