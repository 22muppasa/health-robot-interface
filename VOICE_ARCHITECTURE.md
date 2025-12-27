# Voice Assistant Technical Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    USER'S BROWSER                           │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │          Voice Assistant Component                    │   │
│  ├──────────────────────────────────────────────────────┤   │
│  │ • Push-to-Talk Button                                │   │
│  │ • Wake Word Detection UI                             │   │
│  │ • Response Display                                   │   │
│  │ • Status Indicators                                  │   │
│  └──────────────────────────────────────────────────────┘   │
│           ▲           ▲                    ▲                 │
│           │           │                    │                 │
│     Microphone  Web Speech API         Speaker              │
│     Input       Recognition           Output                │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              Audio Utilities                          │   │
│  ├──────────────────────────────────────────────────────┤   │
│  │ • createSpeechRecognition()                          │   │
│  │ • createContinuousSpeechRecognition()                │   │
│  │ • playAudio()                                        │   │
│  │ • detectWakeWord()                                   │   │
│  │ • extractCommandAfterWakeWord()                      │   │
│  └──────────────────────────────────────────────────────┘   │
│                           ▲                                  │
│                           │ HTTP/REST API                    │
└───────────────────────────┼──────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    BACKEND SERVER                           │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │            FastAPI Routes                            │   │
│  ├──────────────────────────────────────────────────────┤   │
│  │ POST /api/text-command                              │   │
│  │   └─> processes voice command                        │   │
│  │ POST /api/tts                                        │   │
│  │   └─> generates text-to-speech audio                │   │
│  │ GET  /api/status                                    │   │
│  │   └─> returns assistant state                       │   │
│  │ POST /api/command                                   │   │
│  │   └─> executes robot commands                       │   │
│  └──────────────────────────────────────────────────────┘   │
│                           ▲                                  │
│                           │                                  │
│  ┌──────────────────────────────────────────────────────┐   │
│  │          Voice Service Module                         │   │
│  ├──────────────────────────────────────────────────────┤   │
│  │ • process_text_command()                            │   │
│  │   └─> GPT-4 mini intent parsing                      │   │
│  │ • generate_tts()                                     │   │
│  │   └─> OpenAI TTS API                                │   │
│  │ • start_ptt() / stop_ptt()                          │   │
│  │   └─> PTT state management                           │   │
│  └──────────────────────────────────────────────────────┘   │
│                           ▲                                  │
│                           │ HTTPS/REST                       │
└───────────────────────────┼──────────────────────────────────┘
                            │
                            ▼
                  ┌──────────────────┐
                  │ OpenAI APIs      │
                  ├──────────────────┤
                  │ • GPT-4 mini     │
                  │ • TTS (tts-1)    │
                  └──────────────────┘
```

## Data Flow Diagrams

### Push-to-Talk Flow

```
User holds button
    ↓
Browser starts Web Speech Recognition
    ↓
User speaks command
    ↓
Browser recognizes speech (local)
    ↓
Browser sends transcript to /api/text-command
    ↓
Backend: GPT-4 mini parses intent
    ↓
Backend sets assistant_state = "speaking"
    ↓
Frontend polls /api/status and detects "speaking" state
    ↓
Frontend requests TTS audio from /api/tts
    ↓
Backend: OpenAI generates MP3 audio
    ↓
Frontend receives audio blob
    ↓
Browser plays audio through speaker
    ↓
User hears response
```

### Wake Word Detection Flow

```
Assistant enabled + user speaks
    ↓
Continuous Web Speech Recognition running
    ↓
Browser transcribes audio continuously
    ↓
detectWakeWord() checks for "Claire"
    ↓
(Not found) → continue listening
(Found) → extractCommandAfterWakeWord()
    ↓
Frontend calls handleWakeWordDetected()
    ↓
Send command to /api/text-command
    ↓
[Same as PTT Flow from here]
    ↓
User hears response
```

### TTS Generation Flow

```
Frontend requests: POST /api/tts { text: "message" }
    ↓
Backend receives request
    ↓
Call OpenAI TTS API:
  model: "tts-1"
  voice: "alloy"
  input: text
    ↓
Receive MP3 audio bytes from OpenAI
    ↓
Return audio/mpeg response to frontend
    ↓
Frontend creates Blob from audio bytes
    ↓
playAudio() creates Audio element
    ↓
Set audio.src to blob URL
    ↓
audio.play() starts playback
    ↓
Browser speaker plays audio
```

## File Structure

```
health-robot-interface/
├── src/
│   ├── components/
│   │   └── VoiceAssistant.tsx          ← Main voice component
│   ├── hooks/
│   │   ├── useWakeWordDetection.ts     ← Wake word listening
│   │   └── useTTS.ts                   ← Text-to-speech playback
│   └── lib/
│       ├── api.ts                      ← API calls (updated getTTS)
│       └── audioUtils.ts               ← Audio utilities
│
└── backend/
    ├── main.py                         ← FastAPI app (updated with /api/tts)
    ├── voice_service.py                ← Voice logic (updated with generate_tts)
    └── requirements.txt                ← Python dependencies
```

## Key Components

### 1. Web Speech API Integration
- **Location**: `src/lib/audioUtils.ts`
- **Functions**:
  - `getSpeechRecognition()` - Get browser's SpeechRecognition
  - `createSpeechRecognition()` - One-shot speech (PTT)
  - `createContinuousSpeechRecognition()` - Continuous (wake word)

### 2. Wake Word Detection Hook
- **Location**: `src/hooks/useWakeWordDetection.ts`
- **Features**:
  - Continuous listening in background
  - Auto-restart on network errors
  - Wake word detection via `detectWakeWord()`
  - Command extraction via `extractCommandAfterWakeWord()`
  - Returns: `isListening`, `lastTranscript`, control methods

### 3. TTS Hook
- **Location**: `src/hooks/useTTS.ts`
- **Features**:
  - Fetches audio from `/api/tts`
  - Prevents concurrent playback
  - Error handling and callbacks
  - Returns: `speak()`, `stopSpeaking()`, `isSpeaking`

### 4. Voice Assistant Component
- **Location**: `src/components/VoiceAssistant.tsx`
- **Combines**:
  - Push-to-talk UI and logic
  - Wake word detection integration
  - TTS response playback
  - Status indicators
  - Transcript display

### 5. Backend Voice Service
- **Location**: `backend/voice_service.py`
- **Methods**:
  - `process_text_command()` - Intent parsing with GPT-4
  - `generate_tts()` - TTS generation with OpenAI
  - `start_ptt()` / `stop_ptt()` - PTT state management

### 6. Backend API Routes
- **Location**: `backend/main.py`
- **Endpoints**:
  - `POST /api/text-command` - Process voice commands
  - `POST /api/tts` - Generate audio
  - `POST /api/command` - Execute robot commands
  - `GET /api/status` - Get assistant state
  - `WS /ws` - WebSocket for state updates

## State Management

### Frontend State (React)
```typescript
// VoiceAssistant component
- isPushToTalkActive: boolean        // PTT button pressed
- isSpeaking: boolean                // Assistant speaking
- lastResponse: string               // Last assistant response
- lastIntentRef: useRef              // Track intent changes

// From useWakeWordDetection
- isListening: boolean               // Wake word detection active
- lastTranscript: string             // Last detected transcript

// From useWebSocket (Index page)
- systemStatus: SystemStatus         // Backend state
- lastTranscript: string             // Last command
```

### Backend State (SystemState)
```python
- assistant_enabled: boolean         # Assistant active
- assistant_state: string            # idle|listening|processing|speaking
- last_transcript: string            # Last recognized text
- last_intent: string                # Last parsed intent
- call_state: string                 # Call status
- last_error: string                 # Error message
```

## API Contracts

### Text Command
```
POST /api/text-command
{
  "text": "check my vitals"
}

Response:
{
  "success": true,
  "message": "Text command processed."
}
```

### TTS Generation
```
POST /api/tts
{
  "text": "I am checking your vital signs."
}

Response:
- Content-Type: audio/mpeg
- Body: Binary MP3 audio data
```

### Status
```
GET /api/status

Response:
{
  "assistant_enabled": true,
  "assistant_state": "idle",
  "last_transcript": "check my vitals",
  "last_intent": "check_vitals",
  "call_state": "not_in_call",
  "last_error": ""
}
```

## Error Handling

### Browser Errors
- No microphone permission → Toast + disable
- Web Speech API not supported → Toast + disable
- Network error → Auto-restart (wake word only)
- TTS playback error → Toast + callback

### Backend Errors
- Invalid API key → HTTP 500
- Text empty → HTTP 400
- OpenAI API error → HTTP 500 + state update
- Intent parsing error → HTTP 500 + state update

## Performance Considerations

1. **Wake Word Detection**: Continuous listening might use more CPU
   - Mitigation: Pause when PTT active, stop when disabled

2. **TTS Generation**: Takes 1-3 seconds per request
   - Uses async/await to prevent UI blocking

3. **Status Polling**: Frontend polls `/api/status` every 500ms
   - Only when enabled, could use WebSocket for real-time (future improvement)

4. **Memory**: Speech recognition buffers audio
   - Auto-cleaned on `onend` event

## Security Considerations

1. **API Keys**: OpenAI key stored in environment variable
2. **CORS**: Allows all origins (configure in production)
3. **Rate Limiting**: Not implemented (add in production)
4. **Audio**: Not logged or stored on server
5. **Microphone**: Browser asks for explicit permission

## Browser Compatibility

| Feature | Chrome | Firefox | Safari | Edge |
|---------|--------|---------|--------|------|
| Web Speech API | ✅ | ✅ | ⚠️ | ✅ |
| SpeechRecognition | ✅ | ✅ | ✅ | ✅ |
| SpeechSynthesis | ✅ | ✅ | ✅ | ✅ |
| Audio Blob | ✅ | ✅ | ✅ | ✅ |

⚠️ = Limited support or requires prefix

## Future Enhancements

1. **WebSocket for TTS**: Real-time streaming instead of polling
2. **Local Wake Word**: ml5.js for client-side detection
3. **Advanced Intent Parsing**: Custom NLP models
4. **Voice Profiles**: Different assistant voices
5. **Noise Cancellation**: Audio preprocessing
6. **Command History**: Track and replay previous commands
7. **Offline Mode**: Cache common responses
