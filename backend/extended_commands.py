"""
Extended command definitions and handlers for Claire healthcare bot.
Includes medication reminders, vital signs, communication, and more.
"""

from typing import Dict, List, Callable, Optional, Any
from dataclasses import dataclass
from enum import Enum

class CommandCategory(Enum):
    """Command categories for organization."""
    HEALTH = "health"
    COMMUNICATION = "communication"
    NAVIGATION = "navigation"
    REMINDERS = "reminders"
    SETTINGS = "settings"
    INFORMATION = "information"
    EMERGENCY = "emergency"

@dataclass
class CommandDefinition:
    """Defines a command that Claire can execute."""
    name: str
    description: str
    category: CommandCategory
    aliases: List[str]
    required_slots: List[str]
    optional_slots: List[str]
    confidence_threshold: float = 0.7

    def to_dict(self) -> dict:
        """Convert to dictionary."""
        return {
            "name": self.name,
            "description": self.description,
            "category": self.category.value,
            "aliases": self.aliases,
            "required_slots": self.required_slots,
            "optional_slots": self.optional_slots,
            "confidence_threshold": self.confidence_threshold,
        }

# Define all available commands
COMMANDS: Dict[str, CommandDefinition] = {
    # Health Commands
    "check_vitals": CommandDefinition(
        name="check_vitals",
        description="Check patient vital signs (heart rate, blood pressure, temperature, etc.)",
        category=CommandCategory.HEALTH,
        aliases=["vitals", "check heart rate", "blood pressure"],
        required_slots=[],
        optional_slots=["vital_type"],
        confidence_threshold=0.75
    ),
    
    "medication_reminder": CommandDefinition(
        name="medication_reminder",
        description="Remind patient to take medication",
        category=CommandCategory.REMINDERS,
        aliases=["take medicine", "medication time", "take pills"],
        required_slots=["medication_name"],
        optional_slots=["dosage", "frequency"],
        confidence_threshold=0.8
    ),
    
    "schedule_checkup": CommandDefinition(
        name="schedule_checkup",
        description="Schedule a medical checkup or appointment",
        category=CommandCategory.HEALTH,
        aliases=["book doctor", "medical appointment", "doctor visit"],
        required_slots=[],
        optional_slots=["date", "time", "doctor_name"],
        confidence_threshold=0.8
    ),
    
    # Communication Commands
    "call_nurse": CommandDefinition(
        name="call_nurse",
        description="Call the nurse for assistance",
        category=CommandCategory.COMMUNICATION,
        aliases=["nurse", "help", "need assistance"],
        required_slots=[],
        optional_slots=["reason"],
        confidence_threshold=0.7
    ),
    
    "call_family": CommandDefinition(
        name="call_family",
        description="Call a family member or guardian",
        category=CommandCategory.COMMUNICATION,
        aliases=["call mom", "call dad", "call family", "contact family"],
        required_slots=["contact_name"],
        optional_slots=["video_call"],
        confidence_threshold=0.75
    ),
    
    "call_contact": CommandDefinition(
        name="call_contact",
        description="Call a specific contact from the patient's contact list",
        category=CommandCategory.COMMUNICATION,
        aliases=["call", "phone", "dial", "ring"],
        required_slots=["contact_name"],
        optional_slots=["video_call", "call_type"],
        confidence_threshold=0.75
    ),
    
    "send_message": CommandDefinition(
        name="send_message",
        description="Send a message to family or caregiver",
        category=CommandCategory.COMMUNICATION,
        aliases=["message", "text", "send text"],
        required_slots=[],
        optional_slots=["recipient", "message_text"],
        confidence_threshold=0.7
    ),
    
    # Navigation Commands
    "navigate": CommandDefinition(
        name="navigate",
        description="Navigate to a location in facility",
        category=CommandCategory.NAVIGATION,
        aliases=["go to", "move to", "navigate to"],
        required_slots=["destination"],
        optional_slots=[],
        confidence_threshold=0.75
    ),
    
    "stop": CommandDefinition(
        name="stop",
        description="Stop current action",
        category=CommandCategory.NAVIGATION,
        aliases=["halt", "stop moving", "pause"],
        required_slots=[],
        optional_slots=[],
        confidence_threshold=0.8
    ),
    
    # Video Conferencing Commands
    "join_call": CommandDefinition(
        name="join_call",
        description="Join a video conference call",
        category=CommandCategory.COMMUNICATION,
        aliases=["join meeting", "start call", "video call"],
        required_slots=[],
        optional_slots=["room"],
        confidence_threshold=0.75
    ),
    
    "mute_call": CommandDefinition(
        name="mute_call",
        description="Mute microphone during call",
        category=CommandCategory.COMMUNICATION,
        aliases=["mute", "silence me"],
        required_slots=[],
        optional_slots=[],
        confidence_threshold=0.85
    ),
    
    "unmute_call": CommandDefinition(
        name="unmute_call",
        description="Unmute microphone during call",
        category=CommandCategory.COMMUNICATION,
        aliases=["unmute", "speak"],
        required_slots=[],
        optional_slots=[],
        confidence_threshold=0.85
    ),
    
    "end_call": CommandDefinition(
        name="end_call",
        description="End current call",
        category=CommandCategory.COMMUNICATION,
        aliases=["hang up", "end meeting", "close call"],
        required_slots=[],
        optional_slots=[],
        confidence_threshold=0.8
    ),
    
    # Reminder Commands
    "set_reminder": CommandDefinition(
        name="set_reminder",
        description="Set a reminder for a specific time or event",
        category=CommandCategory.REMINDERS,
        aliases=["remind me", "set alarm", "reminder"],
        required_slots=["reminder_text"],
        optional_slots=["time", "date", "frequency"],
        confidence_threshold=0.75
    ),
    
    "list_reminders": CommandDefinition(
        name="list_reminders",
        description="List all active reminders",
        category=CommandCategory.REMINDERS,
        aliases=["what's my schedule", "upcoming reminders", "my reminders"],
        required_slots=[],
        optional_slots=[],
        confidence_threshold=0.7
    ),
    
    # Settings Commands
    "adjust_volume": CommandDefinition(
        name="adjust_volume",
        description="Adjust speaker volume",
        category=CommandCategory.SETTINGS,
        aliases=["increase volume", "decrease volume", "louder", "quieter"],
        required_slots=[],
        optional_slots=["level"],
        confidence_threshold=0.8
    ),
    
    "enhance_microphone": CommandDefinition(
        name="enhance_microphone",
        description="Enhance microphone sensitivity",
        category=CommandCategory.SETTINGS,
        aliases=["increase mic sensitivity", "boost microphone"],
        required_slots=[],
        optional_slots=["sensitivity_level"],
        confidence_threshold=0.8
    ),
    
    # Information Commands
    "weather": CommandDefinition(
        name="weather",
        description="Get current weather information",
        category=CommandCategory.INFORMATION,
        aliases=["weather report", "what's the weather", "forecast"],
        required_slots=[],
        optional_slots=["location"],
        confidence_threshold=0.75
    ),
    
    "time": CommandDefinition(
        name="time",
        description="Get current time",
        category=CommandCategory.INFORMATION,
        aliases=["what time is it", "current time", "time now"],
        required_slots=[],
        optional_slots=[],
        confidence_threshold=0.9
    ),
    
    "date": CommandDefinition(
        name="date",
        description="Get current date",
        category=CommandCategory.INFORMATION,
        aliases=["what's the date", "current date", "today's date"],
        required_slots=[],
        optional_slots=[],
        confidence_threshold=0.9
    ),
    
    "news": CommandDefinition(
        name="news",
        description="Get latest news headlines",
        category=CommandCategory.INFORMATION,
        aliases=["news", "headlines", "latest news"],
        required_slots=[],
        optional_slots=["category"],
        confidence_threshold=0.75
    ),
    
    # Enhanced Nurse Commands
    "room_service": CommandDefinition(
        name="room_service",
        description="Request room service (water, towels, blankets, meals, etc.)",
        category=CommandCategory.INFORMATION,
        aliases=["i need", "can i get", "bring me", "water", "towels", "blankets", "food"],
        required_slots=["service_type"],
        optional_slots=[],
        confidence_threshold=0.75
    ),
    
    "pain_assessment": CommandDefinition(
        name="pain_assessment",
        description="Assess and help manage patient pain",
        category=CommandCategory.HEALTH,
        aliases=["pain", "hurts", "ache", "sore", "uncomfortable"],
        required_slots=[],
        optional_slots=["pain_level", "pain_location"],
        confidence_threshold=0.8
    ),
    
    "mood_check": CommandDefinition(
        name="mood_check",
        description="Check patient mood and provide emotional support",
        category=CommandCategory.HEALTH,
        aliases=["feeling", "mood", "sad", "happy", "anxious", "worried"],
        required_slots=[],
        optional_slots=["mood_state"],
        confidence_threshold=0.7
    ),
    
    "health_tips": CommandDefinition(
        name="health_tips",
        description="Provide health and wellness tips",
        category=CommandCategory.INFORMATION,
        aliases=["tips", "advice", "wellness", "healthy", "exercise"],
        required_slots=[],
        optional_slots=["tip_category"],
        confidence_threshold=0.75
    ),
    
    "medication_taken": CommandDefinition(
        name="medication_taken",
        description="Confirm medication has been taken",
        category=CommandCategory.REMINDERS,
        aliases=["took medicine", "took pills", "finished medication", "done with meds"],
        required_slots=[],
        optional_slots=["medication_name"],
        confidence_threshold=0.8
    ),
    
    # Emergency Commands
    "emergency": CommandDefinition(
        name="emergency",
        description="Call emergency services",
        category=CommandCategory.EMERGENCY,
        aliases=["help", "emergency", "call 911"],
        required_slots=[],
        optional_slots=[],
        confidence_threshold=0.9
    ),
    
    # Device & Family Commands
    "generate_invite_code": CommandDefinition(
        name="generate_invite_code",
        description="Generate a 6-digit pairing code for family members to connect",
        category=CommandCategory.SETTINGS,
        aliases=["give me a code", "pairing code", "invite code", "family code", "connect family", "add family member"],
        required_slots=[],
        optional_slots=[],
        confidence_threshold=0.8
    ),
}

def get_command_by_name(name: str) -> Optional[CommandDefinition]:
    """Get a command definition by name."""
    return COMMANDS.get(name)

def get_commands_by_category(category: CommandCategory) -> Dict[str, CommandDefinition]:
    """Get all commands in a specific category."""
    return {name: cmd for name, cmd in COMMANDS.items() if cmd.category == category}

def get_all_command_names() -> List[str]:
    """Get list of all available command names."""
    return list(COMMANDS.keys())

def get_command_aliases(name: str) -> List[str]:
    """Get aliases for a command."""
    cmd = get_command_by_name(name)
    return cmd.aliases if cmd else []
