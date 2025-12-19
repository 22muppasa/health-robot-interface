import asyncio
import webrtcvad
import numpy as np
import openai
from typing import Optional
import io
import wave
from pydub import AudioSegment
from pydub.playback import play
import json

class VoiceService:
    def __init__(self, state, api_key: str):
        self.state = state
        self.api_key = api_key
        self.client = openai.AsyncOpenAI(api_key=api_key)
        self.vad = webrtcvad.Vad(3)  # Aggressiveness 0-3
        self.sample_rate = 16000
        self.frame_duration = 30  # ms
        self.frame_size = int(self.sample_rate * self.frame_duration / 1000)
        self.stream: Optional[sd.InputStream] = None
        self.is_enabled = False
        self.ptt_active = False
        self.recording = False
        self.audio_buffer = []

    async def start(self):
        pass  # No background task needed

    async def stop(self):
        if self.stream:
            self.stream.stop()
            self.stream.close()

    async def enable(self):
        self.is_enabled = True
        if not self.ptt_active:
            await self.start_listening()

    async def disable(self):
        self.is_enabled = False
        await self.stop_listening()

    async def start_ptt(self):
        self.ptt_active = True
        await self.start_listening()

    async def stop_ptt(self):
        self.ptt_active = False
        await self.transcribe_and_respond()
        await self.stop_listening()

    async def start_listening(self):
        if self.recording:
            return
        self.recording = True
        self.audio_buffer = []
        self.state.assistant_state = "listening"
        await self.state.broadcast_update()

        # Simulate recording for demo
        await asyncio.sleep(2)  # Simulate 2 seconds of speech
        self.audio_buffer = np.random.randint(-32768, 32767, 16000 * 2, dtype=np.int16).tolist()  # Fake audio
        await self.transcribe_and_respond()

    async def stop_listening(self):
        if not self.recording:
            return
        self.recording = False
        self.state.assistant_state = "idle"
        await self.state.broadcast_update()

    async def process_audio(self):
        silence_frames = 0
        max_silence_frames = int(1000 / self.frame_duration)  # 1 second silence

        while self.recording:
            await asyncio.sleep(0.1)  # Check every 100ms

            if len(self.audio_buffer) < self.frame_size:
                continue

            # Get frame
            frame = self.audio_buffer[:self.frame_size]
            self.audio_buffer = self.audio_buffer[self.frame_size:]

            # VAD
            is_speech = self.vad.is_speech(np.array(frame, dtype=np.int16).tobytes(), self.sample_rate)

            if is_speech:
                silence_frames = 0
            else:
                silence_frames += 1

            # If silence detected and not PTT, stop recording
            if silence_frames > max_silence_frames and not self.ptt_active:
                await self.transcribe_and_respond()
                break

        # For PTT, wait for stop command
        if self.ptt_active:
            while self.recording:
                await asyncio.sleep(0.1)
            await self.transcribe_and_respond()

    async def transcribe_and_respond(self):
        if not self.audio_buffer:
            return

        self.state.assistant_state = "processing"
        await self.state.broadcast_update()

        # Convert to WAV
        audio_data = np.array(self.audio_buffer, dtype=np.int16)
        wav_buffer = io.BytesIO()
        with wave.open(wav_buffer, 'wb') as wav_file:
            wav_file.setnchannels(1)
            wav_file.setsampwidth(2)
            wav_file.setframerate(self.sample_rate)
            wav_file.writeframes(audio_data.tobytes())
        wav_buffer.seek(0)

        try:
            # Simulate STT
            transcript = "check vitals"  # Simulate user saying "check vitals"

            self.state.last_transcript = transcript
            await self.state.broadcast_update()

            # LLM for intent (async)
            response = await self.client.chat.completions.create(
                model="gpt-4",
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
            if intent in ["check_vitals", "call_nurse", "navigate", "stop", "join_call", "mute_call", "unmute_call", "end_call"]:
                # Simulate execution (in real, call the functions)
                pass  # We'll handle in main.py

        # TTS (async)
        self.state.assistant_state = "speaking"
        await self.state.broadcast_update()

        # tts_response = await self.client.audio.speech.create(
        #     model="tts-1",
        #     voice="alloy",
        #     input=reply,
        #     response_format="mp3"
        # )

        # # Play audio using pydub
        # audio_data = tts_response.content

        # audio_segment = AudioSegment.from_mp3(io.BytesIO(audio_data))
        # play(audio_segment)

        # Simulate TTS
        await asyncio.sleep(2)

        except Exception as e:
            self.state.last_error = str(e)

        finally:
            self.state.assistant_state = "idle"
            await self.state.broadcast_update()