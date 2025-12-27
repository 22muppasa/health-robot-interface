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
# import sounddevice as sd # Commented out for Codespaces compatibility

class VoiceService:
    def __init__(self, state, api_key: str):
        self.state = state
        self.api_key = api_key
        self.client = openai.AsyncOpenAI(api_key="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")
        self.vad = webrtcvad.Vad(3)  # Aggressiveness 0-3
        self.sample_rate = 16000
        self.frame_duration = 30  # ms
        self.frame_size = int(self.sample_rate * self.frame_duration / 1000)
        self.stream: Optional[Any] = None # Changed type hint for Codespaces compatibility
        self.is_enabled = False
        self.ptt_active = False
        self.recording = False
        self.audio_buffer = []

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
        # This function is now only used to update the UI state
        pass

    async def stop_listening(self):
        # This function is now only used to update the UI state
        pass

    async def process_audio(self):
        # This function is now obsolete as the frontend handles audio processing
        pass

    async def transcribe_and_respond(self):
        # This function is now obsolete as the frontend handles audio processing
        pass

    async def process_text_command(self, transcript: str):
        """Processes a text command received from the frontend."""
        self.state.assistant_state = "processing"
        await self.state.broadcast_update()

        try:
            self.state.last_transcript = transcript
            await self.state.broadcast_update()

            # LLM for intent (async)
            response = await self.client.chat.completions.create(
                model="gpt-4.1-mini",
                messages=[
                    {"role": "system", "content": """
You are a voice assistant for a healthcare robot. Parse the user's speech and respond with STRICT JSON:
{
  "intent": one of [check_vitals, call_nurse, navigate, stop, join_call, mute_call, unmute_call, end_call, explain, unknown],
  "slots": object with relevant data (e.g. {"destination": "room 101"} for navigate),
  "confirmation_needed": boolean if action needs confirmation,
  "assistant_reply": string response to user
}
Only output valid JSON, no extra text.
"""},
                    {"role": "user", "content": transcript}
                ]
            )

            result = json.loads(response.choices[0].message.content)
            intent = result["intent"]
            slots = result.get("slots", {})
            reply = result["assistant_reply"]

            self.state.last_intent = intent

            # Execute intent
            # This logic should ideally be moved to main.py or a dedicated service
            # For now, we'll simulate the execution
            if intent in ["check_vitals", "call_nurse", "navigate", "stop", "join_call", "mute_call", "unmute_call", "end_call"]:
                # Simulate execution (in real, call the functions)
                pass

            # TTS (async)
            self.state.assistant_state = "speaking"
            await self.state.broadcast_update()

            # Simulate TTS
            await asyncio.sleep(2)

        except Exception as e:
            self.state.last_error = str(e)

        finally:
            self.state.assistant_state = "idle"
            await self.state.broadcast_update()
