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
import base64
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
        # Initialize conversation manager
        self.conversation_manager = ConversationManager(self.client)

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
        """Processes a text command or conversation from the frontend."""
        self.state.assistant_state = "processing"
        await self.state.broadcast_update()

        try:
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
            if should_execute and intent in ["check_vitals", "call_nurse", "navigate", "stop", "join_call", "mute_call", "unmute_call", "end_call"]:
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
