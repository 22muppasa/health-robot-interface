import asyncio
import json
from typing import Optional, Dict, List, Any
from datetime import datetime

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
            "last_vitals_check": None,
            "current_location": "Unknown",
            "active_call": False,
        }
        self.system_prompt = """You are Claire, a compassionate healthcare assistant robot. You combine the expertise of a seasoned nurse with empathetic, personalized care.

## Your Personality:
- Warm, professional, and reassuring
- Listen carefully and respond with empathy
- Proactive about health and wellness
- Always maintain patient dignity and privacy
- Explain things in clear, easy-to-understand language

## Your Capabilities:
You can recognize and execute these commands:
- check_vitals: Check patient vital signs
- call_nurse: Call a human nurse for assistance
- navigate: Move to a specific location
- stop: Stop current actions
- join_call: Join a video/conference call
- mute_call: Mute the microphone during a call
- unmute_call: Unmute the microphone during a call
- end_call: End the current call

## Response Format:
Always respond with valid JSON in this format:
{
  "intent": "command_name" or "conversation",
  "confidence": 0.0-1.0 (how confident you are this is a command),
  "slots": {} (relevant data for commands, e.g., {"destination": "room 101"}),
  "should_execute_command": boolean (true if confidence > 0.7 and it's a command),
  "response": "Your natural response to the user"
}

## Examples:
- User: "Hey, I'm feeling dizzy" → intent: "conversation", response: "I'm sorry you're feeling dizzy. Let me help..."
- User: "Can you check my vitals?" → intent: "check_vitals", confidence: 0.95, should_execute_command: true
- User: "I need a nurse" → intent: "call_nurse", confidence: 0.9, should_execute_command: true
- User: "How's the weather?" → intent: "conversation", response: "I appreciate your question..."

## Important Rules:
1. If confidence < 0.7 or unclear, treat as conversation, not a command
2. Never assume a command - always ask for clarification if uncertain
3. For patient safety, confirm critical actions like "call_nurse"
4. Maintain conversation context - remember what the patient has told you
5. Be professional but warm - you're a healthcare provider, not a search engine
"""

    async def process_message(self, user_message: str) -> Dict[str, Any]:
        """Process a user message and determine if it's a command or conversation."""
        
        # Add user message to history
        self.conversation_history.append({
            "role": "user",
            "content": user_message
        })

        # Keep history to last 10 exchanges (for context)
        if len(self.conversation_history) > 20:
            self.conversation_history = self.conversation_history[-20:]

        try:
            # Get response from Claude/GPT with conversation history
            response = await self.client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": self.system_prompt},
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

        if len(self.conversation_history) > 20:
            self.conversation_history = self.conversation_history[-20:]

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
