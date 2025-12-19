# Health Robot Interface

A full-stack application for controlling a healthcare robot with voice assistant, video conferencing, and robot actions.

## Features

- **Voice Assistant**: Always-on VAD with push-to-talk mode using OpenAI STT/TTS
- **Video Conferencing**: Join Jitsi calls via Chromium kiosk
- **Robot Actions**: Check vitals, call nurse, navigate, stop
- **Real-time Updates**: WebSocket for live status updates
- **TypeScript Frontend**: React dashboard with shadcn/ui
- **Python Backend**: FastAPI with safety validations

## Architecture

- **Frontend**: TypeScript/React with Vite
- **Backend**: Python/FastAPI
- **Communication**: REST API + WebSocket
- **Voice**: WebRTC VAD + OpenAI Whisper/TTS
- **Conferencing**: Chromium kiosk to Jitsi
- **Safety**: Hardcoded intent allowlist, no arbitrary code execution

## Setup

### Prerequisites

- Node.js 18+
- Python 3.8+
- OpenAI API key
- Raspberry Pi (for deployment)

### Backend Setup

```bash
cd backend
pip install -r requirements.txt
cp ../.env.example ../.env
# Edit .env with your OPENAI_API_KEY
```

### Frontend Setup

```bash
npm install
```

## Running

### Development

```bash
# Backend
cd backend
uvicorn main:app --host 0.0.0.0 --port 8000 --reload

# Frontend (new terminal)
npm run dev
```

### Production on Raspberry Pi

1. Install dependencies:
```bash
sudo apt update
sudo apt install python3-pip chromium-browser alsa-utils
pip install -r backend/requirements.txt
```

2. Copy systemd services:
```bash
sudo cp backend.service /etc/systemd/system/
sudo cp voice.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable backend
sudo systemctl start backend
```

3. Build frontend:
```bash
npm run build
# Serve with nginx or similar
```

## API

### REST Endpoints

- `POST /api/command` - Send commands
  ```json
  {
    "intent": "join_call",
    "slots": {"room": "nurse-station"},
    "source": "ui"
  }
  ```
- `GET /api/status` - Get current state

### WebSocket

- `ws://localhost:8000/ws` - Real-time updates
  ```json
  {
    "type": "system_update",
    "payload": {
      "assistant_state": "listening",
      "call_state": "in_call",
      ...
    }
  }
  ```

### Allowed Intents

- `check_vitals`, `call_nurse`, `navigate`, `stop`
- `join_call`, `mute_call`, `unmute_call`, `end_call`
- `assistant_enable`, `assistant_disable`, `assistant_ptt_start`, `assistant_ptt_stop`

## Configuration

See `.env.example` for environment variables.

## Safety

- Commands validated against allowlist
- No shell execution from LLM
- Confirmation flow for risky actions (placeholder)
