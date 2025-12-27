# Voice Assistant Implementation Summary

## Features Implemented

### 1. **Push-to-Talk Button with Web Speech API**
   - Hold the button to record voice commands
   - Browser-based speech recognition (no server-side transcription needed)
   - Automatic command processing through the backend

### 2. **Always-Listening Wake Word Detection**
   - Continuously listens for the wake word "Claire" 
   - Automatically detects when the user says the wake word
   - Extracts and processes commands after the wake word
   - Works in the background without manual activation
   - Auto-restarts on network errors

### 3. **Browser-Based Text-to-Speech (TTS)**
   - Backend generates speech audio using OpenAI's TTS API
   - Browser automatically plays responses through the speaker
   - Responsive and immediate audio feedback
   - Displays visual indicators while speaking

## Architecture

### Frontend Components

#### New Files:
- `src/lib/audioUtils.ts` - Audio utilities
  - `getSpeechRecognition()` - Get browser's speech recognition
  - `createSpeechRecognition()` - Create PTT recognizer
  - `createContinuousSpeechRecognition()` - Create always-listening recognizer
  - `playAudio()` - Play audio from blob/URL
  - `speak()` - Use browser Speech Synthesis
  - `detectWakeWord()` - Detect "Claire" in transcripts
  - `extractCommandAfterWakeWord()` - Extract command text

- `src/hooks/useWakeWordDetection.ts` - Wake word detection hook
  - Always listens when enabled
  - Emits callbacks on wake word detection
  - Auto-restarts on errors
  - Returns current listening state and transcript

- `src/hooks/useTTS.ts` - Text-to-speech hook
  - Fetches audio from backend `/api/tts` endpoint
  - Plays audio through browser
  - Handles concurrent speech prevention

#### Updated Files:
- `src/components/VoiceAssistant.tsx`
  - Integrated wake word detection hook
  - Integrated TTS hook
  - Added push-to-talk button functionality
  - Added visual indicators for listening/speaking states
  - Shows assistant responses with auto-play audio
  - Displays wake word detection status

- `src/lib/api.ts`
  - Added `getTTS(text)` method to fetch audio from backend

### Backend Components

#### Updated Files:
- `backend/voice_service.py`
  - Fixed API key initialization (was hardcoded)
  - Added `generate_tts(text)` method using OpenAI TTS API
  - Updated `process_text_command()` to be more responsive

- `backend/main.py`
  - Added `TTSRequest` model
  - Added `/api/tts` POST endpoint
  - Returns audio/mpeg response to frontend
  - Proper error handling for TTS generation

## How It Works

### Push-to-Talk Flow:
1. User holds "Hold to Talk" button
2. Backend receives PTT start signal
3. Browser's Web Speech API captures audio
4. User speaks command
5. Browser recognizes speech and sends transcript to backend
6. Backend processes with GPT-4 mini
7. Backend generates assistant response
8. Frontend fetches TTS audio from `/api/tts`
9. Browser plays audio through speaker
10. User sees visual feedback of response

### Wake Word Flow:
1. Assistant is enabled
2. Browser continuously listens using Web Speech API
3. User says "Claire, check my vitals"
4. Browser detects "Claire" as wake word
5. Extracts "check my vitals" as command
6. Sends command to backend
7. Backend processes and generates response
8. Frontend fetches and plays TTS audio
9. Visual indicator shows speaking status

## Browser Support

- **Chrome/Chromium**: Full support
- **Firefox**: Full support (uses mozSpeechRecognition)
- **Safari**: Partial support (may need webkit prefixes)
- **Edge**: Full support

## OpenAI API Usage

The implementation uses:
- `gpt-4-mini` for intent parsing
- `tts-1` model for text-to-speech generation
- Voice: "alloy"

## Configuration

### Wake Word
- Default: "Claire"
- Change in `useWakeWordDetection` hook option: `wakeWord: 'your-word'`

### TTS Voice
- Default: "alloy"
- Change in `voice_service.py`: `voice="alloy"` in `generate_tts()`

### Listening Sensitivity
- Aggressiveness level: 3 (adjustable in voice_service.py)

## Testing

To test the implementation:

1. **Push-to-Talk**:
   - Click "Enable" switch on Voice Assistant panel
   - Press and hold "Hold to Talk" button
   - Speak a command (e.g., "check my vitals")
   - Release button
   - Hear assistant response

2. **Wake Word**:
   - Enable voice assistant
   - Speak "Claire" followed by a command
   - (e.g., "Claire, call the nurse")
   - Hear assistant response automatically

## Future Enhancements

- Allow customizable wake words
- Support for multiple voice options
- Streaming TTS for faster response times
- Wake word confidence threshold adjustment
- Local wake word detection (e.g., using ml5.js)
- Improved intent parsing with custom NLP
