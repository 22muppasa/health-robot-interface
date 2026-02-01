import asyncio
import random
from datetime import datetime

class RobotActions:
    def __init__(self, state):
        self.state = state
        self.vitals_data = {
            "heart_rate": 72,
            "blood_pressure": "120/80",
            "temperature": 98.6,
            "oxygen_saturation": 98,
            "respiratory_rate": 16
        }
        self.current_location = "Patient Room A"
        self.movement_status = "stationary"

    async def check_vitals(self):
        """Simulate checking patient vital signs with realistic variations."""
        print("Claire: Checking your vital signs...")

        # Simulate realistic vital sign variations
        self.vitals_data["heart_rate"] = random.randint(65, 85)
        self.vitals_data["blood_pressure"] = f"{random.randint(110, 130)}/{random.randint(75, 85)}"
        self.vitals_data["temperature"] = round(random.uniform(97.5, 99.5), 1)
        self.vitals_data["oxygen_saturation"] = random.randint(95, 100)
        self.vitals_data["respiratory_rate"] = random.randint(12, 20)

        # Update state with vitals information
        vitals_summary = (
            f"Heart rate: {self.vitals_data['heart_rate']} bpm, "
            f"Blood pressure: {self.vitals_data['blood_pressure']}, "
            f"Temperature: {self.vitals_data['temperature']}°F, "
            f"Oxygen saturation: {self.vitals_data['oxygen_saturation']}%, "
            f"Respiratory rate: {self.vitals_data['respiratory_rate']} breaths/min"
        )

        self.state.last_response = f"Your vital signs look good: {vitals_summary}"
        print(f"Vitals checked: {vitals_summary}")

    async def call_nurse(self):
        """Simulate calling a human nurse."""
        print("Claire: Calling the nurse station...")
        await asyncio.sleep(1)

        # Simulate nurse response
        nurse_responses = [
            "Nurse Johnson is on her way to your room.",
            "I've notified the nursing staff. Someone will be with you shortly.",
            "Calling Nurse Martinez now - she'll be there in 2-3 minutes.",
            "The nurse station has been alerted. Help is on the way."
        ]

        self.state.last_response = random.choice(nurse_responses)
        print("Nurse call initiated")

    async def call_family(self, contact_name: str = None):
        """Simulate calling a family member."""
        if not contact_name:
            contact_name = "family member"

        print(f"Claire: Calling {contact_name}...")
        await asyncio.sleep(1)

        self.state.last_response = f"Initiating video call to {contact_name}. Please wait while I connect you."
        print(f"Family call initiated to {contact_name}")

    async def navigate(self, destination: str = None):
        """Simulate robot navigation to a location."""
        if not destination:
            destination = "nurse station"

        print(f"Claire: Navigating to {destination}...")
        self.movement_status = "moving"
        await asyncio.sleep(2)  # Simulate movement time

        self.current_location = destination
        self.movement_status = "stationary"

        arrival_messages = [
            f"I've arrived at the {destination}. How can I help you?",
            f"Now at {destination}. Is there anything you need?",
            f"Reached {destination} safely. What would you like me to do?"
        ]

        self.state.last_response = random.choice(arrival_messages)
        print(f"Navigation complete: arrived at {destination}")

    async def stop(self):
        """Stop current robot action."""
        print("Claire: Stopping all movement...")
        await asyncio.sleep(0.5)

        self.movement_status = "stationary"
        self.state.last_response = "I've stopped moving. How can I assist you?"
        print("Robot movement stopped")

    async def take_medication_reminder(self, medication_name: str, dosage: str = None):
        """Handle medication reminder acknowledgment."""
        if dosage:
            self.state.last_response = f"Noted that you've taken {dosage} of {medication_name}. Great job staying on schedule!"
        else:
            self.state.last_response = f"Good job taking your {medication_name}! I'll mark this as completed."
        print(f"Medication reminder acknowledged: {medication_name}")

    async def schedule_checkup(self, appointment_type: str = "general checkup", date: str = None):
        """Schedule a medical checkup."""
        if date:
            self.state.last_response = f"I've scheduled your {appointment_type} for {date}. You'll receive a reminder 24 hours before."
        else:
            self.state.last_response = f"I'll help schedule your {appointment_type}. Let me check the doctor's availability and get back to you."
        print(f"Checkup scheduled: {appointment_type}")

    async def provide_health_tips(self):
        """Provide general health tips."""
        tips = [
            "Remember to drink plenty of water throughout the day - aim for 8 glasses.",
            "Take short walks every hour to keep your circulation moving.",
            "Practice deep breathing: inhale for 4 counts, hold for 4, exhale for 4.",
            "Maintain good posture to prevent back strain and improve breathing.",
            "Eat colorful fruits and vegetables for essential vitamins and nutrients.",
            "Get adequate sleep - 7-9 hours per night helps your body recover.",
            "Stay connected with loved ones - social interaction is good for mental health.",
            "Take your medications exactly as prescribed by your doctor."
        ]

        self.state.last_response = random.choice(tips)
        print("Health tip provided")

    async def emergency_assistance(self):
        """Handle emergency situations."""
        print("Claire: EMERGENCY PROTOCOL ACTIVATED")
        await asyncio.sleep(0.5)

        self.state.last_response = "EMERGENCY: I've alerted the medical staff and emergency services. Help is on the way. Stay calm and remain where you are."
        print("Emergency protocol activated")

    async def room_service_request(self, service_type: str):
        """Handle room service requests."""
        services = {
            "water": "I'll have fresh water brought to your room right away.",
            "towels": "Fresh towels are on the way to your room.",
            "blankets": "Extra blankets will be delivered shortly.",
            "food": "I'll notify the dietary staff about your meal request.",
            "cleaning": "Housekeeping has been notified and will be there soon.",
            "pain_medication": "I'll page your nurse immediately for pain management."
        }

        response = services.get(service_type.lower(),
                               f"I've noted your request for {service_type}. Someone will assist you shortly.")

        self.state.last_response = response
        print(f"Room service requested: {service_type}")

    def get_status(self):
        """Get current robot status."""
        return {
            "location": self.current_location,
            "movement_status": self.movement_status,
            "last_vitals_check": datetime.now().isoformat(),
            "battery_level": 85,  # Simulated
            "connection_status": "online"
        }