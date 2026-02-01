import asyncio
import json
from typing import Optional, Dict, List, Any
from datetime import datetime
from realtime_data import data_fetcher
from chat_history import save_message as persist_message

class ConversationManager:
    """
    Manages real-time conversational capabilities with intent recognition.
    Distinguishes between commands and casual conversation.
    """

    def __init__(self, client):
        self.client = client
        self.conversation_history: List[Dict[str, str]] = []
        self.context = {
            "patient_name": "Patient",
            "patient_id": "patient-main",  # Default patient ID for persistence
            "last_vitals_check": None,
            "current_location": "Unknown",
            "active_call": False,
            "last_medication_taken": None,
            "mood": "neutral",
            "pain_level": None,
            "last_meal": None,
        }
        self.system_prompt = """You are Claire, a compassionate healthcare assistant robot. You combine the expertise of a seasoned nurse with empathetic, personalized care.

## Your Personality:
- Warm, professional, and reassuring like a trusted nurse
- Listen carefully and respond with genuine empathy
- Proactive about health and wellness
- Always maintain patient dignity and privacy
- Explain things in clear, easy-to-understand language
- Remember personal details about the patient's care

## Your Capabilities:
You can recognize and execute these commands:

### Health & Wellness Commands:
- check_vitals: Check patient vital signs (heart rate, blood pressure, temperature, oxygen, respiratory rate)
- pain_assessment: Assess patient's pain level and type (triggers when patient mentions pain)
- mood_check: Check patient's emotional/mood status (triggers when patient discusses feelings)
- medication_reminder: Remind about taking medication or medication compliance check
- medication_taken: Log that patient has taken their medication
- health_tips: Provide personalized health and wellness advice
- schedule_checkup: Schedule a medical appointment

### Reminder Commands:
- set_reminder: Set a custom reminder for patient (e.g., "remind me to take medication at 2 PM")
  * Extract: reminder_text (what to remind), time (when), frequency (once/daily/weekly)
- list_reminders: Show all upcoming reminders
- cancel_reminder: Cancel/delete a specific reminder
  * Extract: reminder_text (which reminder to cancel)

### Contact & Call Commands:
- call_contact: Call a specific contact by name (e.g., "call mom", "call John")
  * Slot: contact_name (required) - the name of the person to call
- call_family: Call a family member or guardian
- call_nurse: Call the nurse for assistance
- show_contacts: Display the contacts list ("show my contacts", "who can I call?")
- add_contact: Add a new contact ("add contact John with phone 555-1234")
  * Slot: contact_name (required), phone (optional)
- remove_contact: Remove a contact ("remove John from contacts", "delete contact Sarah")
  * Slot: contact_name (required)

### Video Call Control Commands (during active calls):
- answer_call: Answer incoming call ("answer", "accept", "pick up", "yes")
- reject_call: Reject incoming call ("reject", "decline", "no", "ignore")
- end_call: End current video call ("end call", "hang up", "disconnect")
- mute_call: Mute your microphone during call ("mute", "mute microphone")
- unmute_call: Unmute your microphone ("unmute", "turn on microphone")
- toggle_camera: Turn camera on/off during call ("turn off camera", "camera off", "hide video")
  * Slot: camera_on (boolean)

### Utility Commands:
- room_service: Handle requests for water, towels, meals, blankets, etc.
- weather: Provide current weather information
- time: Tell current time
- date: Tell current date
- news: Share latest health news
- navigate: Move to a specific location in the facility
- stop: Stop current actions
- emergency: Call emergency services (use only in true emergencies)

### Mode Commands:
- switch_mode: Switch Claire's display mode
  * Slot: mode_name (required) - one of: "chat", "face", "ambient", "sleep", "emergency", "companion", "photo"
  * Examples: "switch to face mode", "go to sleep mode", "show ambient display", "photo frame mode", "chat mode", "companion mode", "emergency mode"
  * Trigger phrases: "switch to [mode]", "go to [mode] mode", "show [mode]", "[mode] mode please", "display [mode]"

## Enhanced Nurse Features:
When to use specific commands:
1. **pain_assessment** - User says: "I'm in pain", "It hurts", "I have an ache"
2. **mood_check** - User says: "I'm sad", "I'm feeling anxious", "I'm depressed"
3. **set_reminder** - User wants to set a time-based reminder for ANY task
4. **show_contacts** - User asks: "Who can I call?", "Show my contacts", "List contacts"
5. **add_contact** - User says: "Add contact [name]", "Save [name] as a contact"
6. **cancel_reminder** - User says: "Cancel my reminder", "Delete the medication reminder"

## Response Format:
Always respond with valid JSON in this format:
{
  "intent": "command_name" or "conversation",
  "confidence": 0.0-1.0 (how confident you are this is a command),
  "slots": {} (relevant data for commands),
  "should_execute_command": boolean (true if confidence > 0.7 and it's a command),
  "response": "Your natural response to the user"
}

## Examples:
- User: "I'm in pain" → intent: "pain_assessment", confidence: 0.95, should_execute_command: true, response: "I'm sorry you're experiencing pain. On a scale of 1-10, how would you rate your pain?"
- User: "Set a reminder for my medication at 2 PM" → intent: "set_reminder", confidence: 0.95, slots: {"reminder_text": "medication", "time": "2 PM"}
- User: "Show my contacts" → intent: "show_contacts", confidence: 0.95, response: "Let me show you your contacts."
- User: "Add contact Bob phone 555-1234" → intent: "add_contact", confidence: 0.95, slots: {"contact_name": "Bob", "phone": "555-1234"}
- User: "Remove John from contacts" → intent: "remove_contact", confidence: 0.95, slots: {"contact_name": "John"}
- User: "Cancel my medication reminder" → intent: "cancel_reminder", confidence: 0.95, slots: {"reminder_text": "medication"}
- User: "Call Mom" → intent: "call_contact", confidence: 0.95, slots: {"contact_name": "Mom"}, response: "Calling Mom now..."
- User: "Turn off the camera" → intent: "toggle_camera", confidence: 0.95, slots: {"camera_on": false}, response: "Turning off your camera."
- User: "Mute" → intent: "mute_call", confidence: 0.95, response: "Muting your microphone."
- User: "End the call" → intent: "end_call", confidence: 0.95, response: "Ending the call now."
- User: "Answer" → intent: "answer_call", confidence: 0.95, response: "Answering the call."
- User: "What reminders do I have?" → intent: "list_reminders", confidence: 0.95, response: "Let me check your reminders."
- User: "Switch to face mode" → intent: "switch_mode", confidence: 0.95, slots: {"mode_name": "face"}, response: "Switching to face mode."
- User: "Go to sleep mode" → intent: "switch_mode", confidence: 0.95, slots: {"mode_name": "sleep"}, response: "Switching to sleep mode. Goodnight!"
- User: "Show the ambient display" → intent: "switch_mode", confidence: 0.95, slots: {"mode_name": "ambient"}, response: "Switching to ambient mode."
- User: "Photo frame mode" → intent: "switch_mode", confidence: 0.95, slots: {"mode_name": "photo"}, response: "Switching to photo frame mode."
- User: "Just show your face" → intent: "switch_mode", confidence: 0.95, slots: {"mode_name": "face"}, response: "Here I am!"
- User: "Companion mode please" → intent: "switch_mode", confidence: 0.95, slots: {"mode_name": "companion"}, response: "Switching to companion mode. I'm here to chat!"

## Important Rules:
1. If confidence < 0.7 or unclear, treat as conversation, not a command
2. Never assume a command - always ask for clarification if uncertain
3. For patient safety, confirm critical actions like "emergency"
4. Maintain conversation context - remember what the patient has told you
5. Be professional but warm - you're a healthcare provider
6. **WEATHER DATA**: When I provide weather information, use it directly and never say you don't have access
"""

    async def process_message(self, user_message: str) -> Dict[str, Any]:
        """Process a user message and determine if it's a command or conversation."""
        
        # Add user message to history
        self.conversation_history.append({
            "role": "user",
            "content": user_message
        })

        # Keep history to last 15 exchanges (for multi-turn context)
        if len(self.conversation_history) > 30:
            self.conversation_history = self.conversation_history[-30:]

        # Enhanced keyword detection for nurse features
        user_lower = user_message.lower()
        
        # Quick check for common reminder patterns
        reminder_keywords = ["remind", "set reminder", "set alarm", "medication", "take", "pills", "appointment"]
        mood_keywords = ["feeling", "mood", "sad", "happy", "anxious", "depressed", "stressed"]
        pain_keywords = ["pain", "hurts", "ache", "sore", "uncomfortable", "ouch"]
        call_keywords = ["call", "phone", "video call", "facetime", "ring", "dial", "contact", "reach"]
        mode_keywords = ["switch to", "go to", "change to", "set mode", "mode please", "show me", "display mode"]
        mode_names = ["face", "chat", "ambient", "sleep", "emergency", "companion", "photo", "photo frame", "night", "clock"]
        
        is_reminder_query = any(keyword in user_lower for keyword in reminder_keywords)
        is_mood_query = any(keyword in user_lower for keyword in mood_keywords)
        is_pain_query = any(keyword in user_lower for keyword in pain_keywords)
        is_call_query = any(keyword in user_lower for keyword in call_keywords)
        is_mode_query = any(keyword in user_lower for keyword in mode_keywords) or (any(mode in user_lower for mode in mode_names) and "mode" in user_lower)
        
        # Direct mode switching - bypass AI if clear mode request
        if is_mode_query:
            # Extract mode name from the message
            detected_mode = None
            # Order matters! More specific aliases first to avoid "claire" matching in "Claire, go to X mode"
            mode_aliases = [
                # Chat/Dashboard mode (most common "go back" requests)
                ("dashboard mode", "chat"), ("home mode", "chat"), ("normal mode", "chat"), ("chat mode", "chat"),
                ("go home", "chat"), ("go to dashboard", "chat"), ("back to dashboard", "chat"), ("return home", "chat"),
                # Face mode (specific phrases only - not just "claire")
                ("face mode", "face"), ("show your face", "face"), ("your face", "face"), ("show yourself", "face"),
                ("see your face", "face"), ("show me your face", "face"),
                # Ambient mode
                ("ambient mode", "ambient"), ("clock mode", "ambient"), ("smart display", "ambient"), ("display mode", "ambient"),
                # Sleep mode
                ("sleep mode", "sleep"), ("night mode", "sleep"), ("dim mode", "sleep"), ("dark mode", "sleep"), ("goodnight", "sleep"),
                # Emergency mode
                ("emergency mode", "emergency"), ("emergency", "emergency"), ("help mode", "emergency"), ("sos", "emergency"),
                # Companion mode
                ("companion mode", "companion"), ("talk mode", "companion"), ("chat with me", "companion"), ("friend mode", "companion"),
                # Photo mode
                ("photo mode", "photo"), ("photo frame", "photo"), ("photos mode", "photo"), ("picture mode", "photo"), ("pictures mode", "photo"), ("frame mode", "photo"),
            ]
            
            for alias, mode in mode_aliases:
                if alias in user_lower:
                    detected_mode = mode
                    break
            
            if detected_mode:
                mode_responses = {
                    "chat": "Switching to chat mode.",
                    "face": "Here I am! Switching to face mode.",
                    "ambient": "Switching to ambient mode. I'll show you the time and weather.",
                    "sleep": "Switching to sleep mode. Goodnight! Just say 'Claire' if you need me.",
                    "emergency": "Switching to emergency mode. Quick call buttons are now available.",
                    "companion": "Switching to companion mode. I'm here to chat with you!",
                    "photo": "Switching to photo frame mode. Enjoy your memories!"
                }
                return {
                    "intent": "switch_mode",
                    "confidence": 0.99,
                    "slots": {"mode_name": detected_mode},
                    "should_execute_command": True,
                    "response": mode_responses.get(detected_mode, f"Switching to {detected_mode} mode.")
                }
        
        # Check if user is asking about weather
        weather_keywords = ["weather", "rain", "snow", "temperature", "temp", "forecast", "cloudy", "sunny", "wind", "humidity"]
        is_weather_query = any(keyword in user_lower for keyword in weather_keywords)

        try:
            # If it's a weather query, fetch real weather data
            weather_context = ""
            if is_weather_query:
                try:
                    # Extract location from the message if specified
                    location = None
                    location_phrases = [
                        "in ", "for ", "around ", "at ", "near ", "weather in ",
                        "forecast for ", "temperature in "
                    ]
                    
                    for phrase in location_phrases:
                        if phrase in user_lower:
                            # Extract text after the phrase
                            idx = user_lower.find(phrase)
                            potential_location = user_message[idx + len(phrase):].strip()
                            # Get the first meaningful word/phrase (up to next punctuation or "and")
                            for delimiter in ['?', '.', ' and ', ',']:
                                if delimiter in potential_location:
                                    potential_location = potential_location.split(delimiter)[0].strip()
                            # Clean up the location
                            potential_location = potential_location.split()[0:3]  # Take up to 3 words
                            if potential_location and len(potential_location[0]) > 2:
                                location = " ".join(potential_location)
                                break
                    
                    # Call weather API with extracted location or default
                    weather_data = await data_fetcher.get_weather(location=location)
                    
                    print(f"DEBUG: Weather API response: {weather_data}")
                    
                    if weather_data.get("status") == "success":
                        # Format weather context as a clear instruction
                        weather_context = f"""

## REAL WEATHER DATA FOR THIS RESPONSE:
You have access to real current weather data. Use it directly in your response.
Location: {weather_data.get('location')}
Temperature: {weather_data.get('temperature')}°C
Condition: {weather_data.get('description')}
Humidity: {weather_data.get('humidity')}%
Wind Speed: {weather_data.get('wind_speed')} m/s
Feels Like: {weather_data.get('feels_like')}°C
Cloudiness: {weather_data.get('cloudiness')}%

IMPORTANT: This is REAL, current weather data. Provide these exact values in your response. Do NOT say you don't have access to weather information."""
                    else:
                        error_msg = weather_data.get("message", "Weather API is currently unavailable")
                        weather_context = f"\n\nError fetching weather: {error_msg}"
                except Exception as e:
                    weather_context = f"\n\nError: Could not fetch weather data: {str(e)}"
            
            # Build the system prompt with context
            system_prompt = self.system_prompt
            if weather_context:
                system_prompt += weather_context
            
            # Add current context for reminder/pain/mood/call
            context_reminder = ""
            if is_reminder_query:
                context_reminder = "\nNOTE: User is asking about reminders or medications. This may trigger 'set_reminder' or 'medication_reminder' command."
            if is_pain_query:
                context_reminder += "\nNOTE: User mentions pain. This may trigger 'pain_assessment' command."
            if is_mood_query:
                context_reminder += "\nNOTE: User is sharing emotional state. This may trigger 'mood_check' command."
            if is_call_query:
                context_reminder += "\nNOTE: User wants to make a call. Extract the contact name and use 'call_contact' intent with slots {contact_name: '[name]', video_call: true}. Always respond with a message like 'Calling [name] now...' to confirm the call is being initiated."
            
            if context_reminder:
                system_prompt += context_reminder

            # Get response from Claude/GPT with conversation history
            response = await self.client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": system_prompt},
                    *self.conversation_history
                ],
                temperature=0.7,
                max_tokens=300
            )

            # Parse the response
            response_text = response.choices[0].message.content
            
            try:
                result = json.loads(response_text)
            except json.JSONDecodeError:
                # If response isn't valid JSON, treat as conversation
                result = {
                    "intent": "conversation",
                    "confidence": 0.0,
                    "slots": {},
                    "should_execute_command": False,
                    "response": response_text
                }

            # Add assistant response to history
            self.conversation_history.append({
                "role": "assistant",
                "content": result.get("response", "")
            })

            return result

        except Exception as e:
            return {
                "intent": "error",
                "confidence": 0.0,
                "slots": {},
                "should_execute_command": False,
                "response": f"I encountered an error processing your message: {str(e)}"
            }

    async def stream_response(self, user_message: str):
        """Stream response token by token for real-time conversation."""
        
        # Add user message to history
        self.conversation_history.append({
            "role": "user",
            "content": user_message
        })
        
        # Persist user message
        patient_id = self.context.get("patient_id", "patient-main")
        try:
            persist_message(patient_id, "user", user_message)
        except Exception as e:
            print(f"Warning: Failed to persist user message: {e}")

        if len(self.conversation_history) > 30:
            self.conversation_history = self.conversation_history[-30:]

        try:
            # Create streaming response
            stream = await self.client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": self.system_prompt},
                    *self.conversation_history
                ],
                temperature=0.7,
                max_tokens=300,
                stream=True
            )

            full_response = ""
            async for chunk in stream:
                if chunk.choices[0].delta.content:
                    token = chunk.choices[0].delta.content
                    full_response += token
                    yield token

            # Add full response to history
            self.conversation_history.append({
                "role": "assistant",
                "content": full_response
            })
            
            # Persist assistant response
            try:
                persist_message(patient_id, "assistant", full_response)
            except Exception as e:
                print(f"Warning: Failed to persist assistant message: {e}")

        except Exception as e:
            error_msg = f"Error: {str(e)}"
            yield error_msg

    def clear_history(self):
        """Clear conversation history."""
        self.conversation_history = []

    def update_context(self, key: str, value: Any):
        """Update context information."""
        self.context[key] = value

    def get_context(self) -> Dict[str, Any]:
        """Get current context."""
        return self.context
