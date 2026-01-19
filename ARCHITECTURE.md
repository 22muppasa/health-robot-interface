# System Architecture: Real-Time Conversational Claire

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         FRONTEND (React)                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌────────────────────────┐      ┌──────────────────────────┐   │
│  │   VoiceAssistant       │      │  ConversationDisplay     │   │
│  │   (Component)          │      │  (Component)             │   │
│  ├────────────────────────┤      ├──────────────────────────┤   │
│  │ • Wake Word Detector   │      │ • Message List           │   │
│  │ • Push-to-Talk Button  │      │ • Input Field            │   │
│  │ • Voice Mode Tab       │      │ • Send Button            │   │
│  │ • Chat Mode Tab        │      │ • Real-time Streaming    │   │
│  └────┬────────────────────┘      └──────────┬───────────────┘   │
│       │                                       │                   │
│  ┌────▼───────────────────────────────────────▼─────────────┐    │
│  │         useConversation Hook (State Management)         │    │
│  │                                                          │    │
│  │ • messages: ConversationMessage[]                       │    │
│  │ • isWaiting: boolean                                    │    │
│  │ • sendMessage(text: string)                             │    │
│  │ • cancelMessage()                                       │    │
│  │ • clearMessages()                                       │    │
│  └────┬──────────────────────────────────────────────────┬─┘    │
│       │                                                  │       │
│       │ WebSocket                      HTTP POST        │       │
│       │ (/ws)                          (/api/...)       │       │
│       │                                                  │       │
└───────┼──────────────────────────────────────────────────┼───────┘
        │                                                  │
        │ HTTP/WebSocket                                  │
        │ Connection                                      │
        │                                                  │
┌───────▼──────────────────────────────────────────────────▼───────┐
│                    BACKEND (FastAPI)                              │
├────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌────────────────────────────────────────────────────────────┐   │
│  │              Endpoints & Request Handlers                  │   │
│  ├────────────────────────────────────────────────────────────┤   │
│  │                                                             │   │
│  │  GET /api/status                                           │   │
│  │  ├─> Returns current system state                          │   │
│  │  └─> Used by StatusPanel component                        │   │
│  │                                                             │   │
│  │  POST /api/command                                         │   │
│  │  ├─> Direct command execution                              │   │
│  │  ├─> Intent + Slots validation                             │   │
│  │  └─> Used by UI buttons and robot actions                 │   │
│  │                                                             │   │
│  │  POST /api/text-command                                    │   │
│  │  ├─> Text-based input processing                           │   │
│  │  ├─> Calls VoiceService.process_text_command()            │   │
│  │  ├─> Executes pending commands                             │   │
│  │  └─> Used by Voice and Chat modes                         │   │
│  │                                                             │   │
│  │  POST /api/stream-response  [NEW]                          │   │
│  │  ├─> Streams response token-by-token                       │   │
│  │  ├─> Real-time conversation streaming                      │   │
│  │  └─> Used by Chat mode                                    │   │
│  │                                                             │   │
│  │  WebSocket /ws                                             │   │
│  │  ├─> Bidirectional communication                           │   │
│  │  ├─> Broadcasts system updates                             │   │
│  │  └─> Used by useWebSocket hook                            │   │
│  │                                                             │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                  ▲                                 │
│                                  │                                 │
│  ┌───────────────────────────────┼──────────────────────────┐      │
│  │                               │                          │      │
│  │    ┌──────────────────────────▼────────────┐             │      │
│  │    │      VoiceService (NEW)               │             │      │
│  │    ├──────────────────────────────────────┤             │      │
│  │    │ • Manages audio processing           │             │      │
│  │    │ • ConversationManager instance       │             │      │
│  │    │ • process_text_command()             │             │      │
│  │    │ • start_ptt() / stop_ptt()           │             │      │
│  │    └──────────────┬───────────────────────┘             │      │
│  │                   │                                      │      │
│  │                   ▼                                      │      │
│  │    ┌──────────────────────────────────────┐             │      │
│  │    │  ConversationManager (NEW)           │             │      │
│  │    ├──────────────────────────────────────┤             │      │
│  │    │ Core AI Engine:                      │             │      │
│  │    │                                      │             │      │
│  │    │ • conversation_history: List         │             │      │
│  │    │   - Maintains last 10 exchanges      │             │      │
│  │    │   - Role-based (user/assistant)      │             │      │
│  │    │                                      │             │      │
│  │    │ • context: Dict                      │             │      │
│  │    │   - patient_name                     │             │      │
│  │    │   - last_vitals_check                │             │      │
│  │    │   - current_location                 │             │      │
│  │    │   - active_call                      │             │      │
│  │    │                                      │             │      │
│  │    │ • system_prompt: str                 │             │      │
│  │    │   - Healthcare-focused prompt        │             │      │
│  │    │   - Defines Claire's personality     │             │      │
│  │    │                                      │             │      │
│  │    │ Methods:                             │             │      │
│  │    │ • process_message(text) → Result    │             │      │
│  │    │   - Calls GPT-4o-mini               │             │      │
│  │    │   - Returns intent + response       │             │      │
│  │    │                                      │             │      │
│  │    │ • stream_response(text) → Iterator  │             │      │
│  │    │   - Yields tokens for real-time     │             │      │
│  │    │   - For chat mode display           │             │      │
│  │    │                                      │             │      │
│  │    │ • update_context(key, value)        │             │      │
│  │    │   - Store patient information       │             │      │
│  │    │                                      │             │      │
│  │    │ • clear_history()                   │             │      │
│  │    │   - Reset conversation              │             │      │
│  │    │                                      │             │      │
│  │    └──────────────┬───────────────────────┘             │      │
│  │                   │                                      │      │
│  │                   ▼                                      │      │
│  │    ┌──────────────────────────────────────┐             │      │
│  │    │   OpenAI API                         │             │      │
│  │    ├──────────────────────────────────────┤             │      │
│  │    │ Model: gpt-4o-mini                   │             │      │
│  │    │ • Intent Detection                   │             │      │
│  │    │ • Response Generation                │             │      │
│  │    │ • Streaming Support                  │             │      │
│  │    │ • Confidence Scoring                 │             │      │
│  │    └──────────────────────────────────────┘             │      │
│  │                                                          │      │
│  │    ┌──────────────────────────────────────┐             │      │
│  │    │  RobotActions                        │             │      │
│  │    ├──────────────────────────────────────┤             │      │
│  │    │ • check_vitals()                     │             │      │
│  │    │ • call_nurse()                       │             │      │
│  │    │ • navigate()                         │             │      │
│  │    │ • stop()                             │             │      │
│  │    └──────────────────────────────────────┘             │      │
│  │                                                          │      │
│  │    ┌──────────────────────────────────────┐             │      │
│  │    │  ConferencingService                 │             │      │
│  │    ├──────────────────────────────────────┤             │      │
│  │    │ • join_call()                        │             │      │
│  │    │ • mute_call()                        │             │      │
│  │    │ • unmute_call()                      │             │      │
│  │    │ • end_call()                         │             │      │
│  │    └──────────────────────────────────────┘             │      │
│  │                                                          │      │
│  └──────────────────────────────────────────────────────────┘      │
│                                                                     │
└────────────────────────────────────────────────────────────────────┘
```

## Data Flow: Voice Command

```
User says: "Check my vitals"
         │
         ▼
  Frontend Recognizes Speech
  (Web Speech API)
         │
         ▼
  Transcript: "check my vitals"
         │
         ▼
  POST /api/text-command
  { "text": "check my vitals" }
         │
         ▼
  VoiceService.process_text_command()
         │
         ▼
  ConversationManager.process_message()
         │
         ▼
  GPT-4o-mini Analysis:
  ┌─────────────────────────────┐
  │ Intent: check_vitals        │
  │ Confidence: 0.95 (95%)      │
  │ Should Execute: true        │
  │ Response: "I'll check..."   │
  └─────────────────────────────┘
         │
         ▼
  Store in pending_command
  Store response in state
         │
         ▼
  Broadcast Update via WebSocket
         │
         ▼
  Execute Command:
  await robot_actions.check_vitals()
         │
         ▼
  Return Success Response
         │
         ▼
  Frontend Updates UI:
  • Show response
  • Animate action
  • Update status
```

## Data Flow: Conversation

```
User types: "I'm feeling stressed"
         │
         ▼
  POST /api/stream-response
  { "text": "I'm feeling stressed" }
         │
         ▼
  ConversationManager.stream_response()
         │
         ▼
  Build Message List:
  [system_prompt, past_messages, user_message]
         │
         ▼
  Call GPT-4o-mini with stream=True
         │
         ▼
  Async Iterator:
  Yield tokens as they arrive
         │
         ▼
  Return Server-Sent Events (SSE)
  data: {"token": "I", "type": "response"}
  data: {"token": " understand", "type": "response"}
  data: {"token": "...", "type": "response"}
         │
         ▼
  Frontend Stream Parser:
  useConversation hook
         │
         ▼
  Update UI in Real-time:
  • Accumulate tokens
  • Display as they arrive
  • Show response growing
         │
         ▼
  Add to History when complete
```

## Decision Tree: Intent Classification

```
User Input Received
       │
       ▼
Send to GPT-4o-mini with system prompt
       │
       ▼
Analyze Confidence Level
       │
       ├─ Confidence > 70%
       │  │
       │  └─► Is it a valid command?
       │      │
       │      ├─ YES: should_execute = true
       │      │   Execute command
       │      │   (check_vitals, call_nurse, etc.)
       │      │
       │      └─ NO: should_execute = false
       │          Treat as conversation
       │
       └─ Confidence ≤ 70%
           │
           └─► should_execute = false
               Treat as casual conversation
               Ask for clarification if needed
```

## Component Interaction Sequence

```
User Input
   │
   ├─→ VoiceAssistant (React Component)
   │   ├─→ Speech Recognition (Wake Word)
   │   │   └─→ useSimpleWakeWord Hook
   │   │
   │   └─→ Chat Input (New)
   │       └─→ useConversation Hook
   │           │
   │           ├─→ sendMessage()
   │           │   │
   │           │   └─→ /api/stream-response
   │           │       │
   │           │       └─→ Backend:
   │           │           VoiceService.process_text_command()
   │           │           │
   │           │           └─→ ConversationManager.process_message()
   │           │               │
   │           │               ├─→ GPT-4o-mini (Intent Detection)
   │           │               │
   │           │               └─→ Return Result:
   │           │                   {
   │           │                     intent: string,
   │           │                     confidence: number,
   │           │                     should_execute: boolean,
   │           │                     response: string
   │           │                   }
   │           │
   │           └─→ Stream Tokens
   │               ├─→ Token 1: "I"
   │               ├─→ Token 2: " understand"
   │               ├─→ Token 3: " you're"
   │               └─→ ...
   │
   └─→ Display Response in Real-time
```

## System State Management

```
┌────────────────────────────────────────┐
│  SystemState (Backend)                  │
├────────────────────────────────────────┤
│                                         │
│ Properties:                             │
│ • assistant_enabled: boolean            │
│ • assistant_state: string               │
│   (idle|listening|processing|speaking)  │
│ • last_transcript: string               │
│ • last_intent: string                   │
│ • last_response: string [NEW]           │
│ • pending_command: Dict [NEW]           │
│ • call_state: string                    │
│ • last_error: string                    │
│ • connections: Set[WebSocket]           │
│                                         │
│ Methods:                                │
│ • broadcast_update()                    │
│   └─> Sends to all connected clients    │
│       via WebSocket                     │
│                                         │
│ Usage:                                  │
│ • Frontend WebSocket listener           │
│ • useWebSocket Hook                     │
│ • Real-time UI updates                  │
│                                         │
└────────────────────────────────────────┘
```

## Technology Stack

```
┌──────────────────────────────────────────────┐
│  Frontend                                    │
├──────────────────────────────────────────────┤
│ • React 18+ (UI Framework)                   │
│ • TypeScript (Type Safety)                   │
│ • Web Speech API (Speech Recognition)        │
│ • Fetch API (HTTP & Streaming)               │
│ • Tailwind CSS (Styling)                     │
│ • shadcn/ui (UI Components)                  │
│   ├─ Tabs                                    │
│   ├─ Button                                  │
│   ├─ Input                                   │
│   └─ Toast notifications                     │
│                                              │
└──────────────────────────────────────────────┘

┌──────────────────────────────────────────────┐
│  Backend                                     │
├──────────────────────────────────────────────┤
│ • Python 3.8+ (Runtime)                      │
│ • FastAPI (Web Framework)                    │
│ • Uvicorn (ASGI Server)                      │
│ • OpenAI SDK (AI/GPT-4o-mini)                │
│ • Pydantic (Data Validation)                 │
│ • asyncio (Async Processing)                 │
│ • WebSocket (Real-time Communication)        │
│                                              │
└──────────────────────────────────────────────┘

┌──────────────────────────────────────────────┐
│  External Services                           │
├──────────────────────────────────────────────┤
│ • OpenAI API (GPT-4o-mini)                   │
│   ├─ Intent Recognition                      │
│   ├─ Response Generation                     │
│   ├─ Token Streaming                         │
│   └─ ~$0.05 per 1M tokens                    │
│                                              │
│ • Jitsi (Video Conferencing)                 │
│   ├─ Video calls                             │
│   └─ Screen sharing                          │
│                                              │
└──────────────────────────────────────────────┘
```

---

**This architecture enables:**
✅ Real-time conversational AI
✅ Intelligent command recognition
✅ Seamless mode switching
✅ Scalable message handling
✅ Cost-effective token usage
✅ Low-latency response streaming
