from fastapi import FastAPI, WebSocket, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, Dict, Any
import asyncio
import json
import os
from contextlib import asynccontextmanager

# Import our modules
# from voice_service import VoiceService
from voice_service import VoiceService
from conferencing import ConferencingService
from robot_actions import RobotActions

# Configuration
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
JITSI_BASE_URL = os.getenv("JITSI_BASE_URL", "https://meet.jit.si")
DEFAULT_ROOM = os.getenv("DEFAULT_ROOM", "nurse-station")

# Global state
class SystemState:
    def __init__(self):
        self.assistant_enabled = False
        self.assistant_state = "idle"  # idle, listening, processing, speaking
        self.last_transcript = ""
        self.last_intent = ""
        self.call_state = "not_in_call"  # not_in_call, connecting, in_call
        self.last_error = ""
        self.connections: set[WebSocket] = set()

    async def broadcast_update(self):
        update = {
            "assistant_enabled": self.assistant_enabled,
            "assistant_state": self.assistant_state,
            "last_transcript": self.last_transcript,
            "last_intent": self.last_intent,
            "call_state": self.call_state,
            "last_error": self.last_error,
        }
        for connection in self.connections.copy():
            try:
                await connection.send_json({"type": "system_update", "payload": update})
            except:
                self.connections.discard(connection)

state = SystemState()

# Services
# voice_service = VoiceService(state, OPENAI_API_KEY)
voice_service = VoiceService(state, OPENAI_API_KEY)
conferencing_service = ConferencingService(state, JITSI_BASE_URL)
robot_actions = RobotActions(state)

# Models
class CommandRequest(BaseModel):
    intent: str
    slots: Optional[Dict[str, Any]] = {}
    source: str = "ui"

# Lifespan
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await voice_service.start()
    yield
    # Shutdown
    await voice_service.stop()
    conferencing_service.cleanup()

app = FastAPI(lifespan=lifespan)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routes
@app.get("/api/status")
async def get_status():
    return {
        "assistant_enabled": state.assistant_enabled,
        "assistant_state": state.assistant_state,
        "last_transcript": state.last_transcript,
        "last_intent": state.last_intent,
        "call_state": state.call_state,
        "last_error": state.last_error,
    }

@app.post("/api/command")
async def handle_command(request: CommandRequest):
    allowed_intents = {
        "check_vitals", "call_nurse", "navigate", "stop",
        "join_call", "mute_call", "unmute_call", "end_call",
        "assistant_enable", "assistant_disable", "assistant_ptt_start", "assistant_ptt_stop"
    }

    if request.intent not in allowed_intents:
        raise HTTPException(status_code=400, detail=f"Invalid intent: {request.intent}")

    try:
        if request.intent == "assistant_enable":
            state.assistant_enabled = True
            await voice_service.enable()
        elif request.intent == "assistant_disable":
            state.assistant_enabled = False
            await voice_service.disable()
        elif request.intent == "assistant_ptt_start":
            await voice_service.start_ptt()
        elif request.intent == "assistant_ptt_stop":
            await voice_service.stop_ptt()
        elif request.intent == "join_call":
            room = request.slots.get("room", DEFAULT_ROOM) if request.slots else DEFAULT_ROOM
            await conferencing_service.join_call(room)
        elif request.intent == "mute_call":
            await conferencing_service.mute_call()
        elif request.intent == "unmute_call":
            await conferencing_service.unmute_call()
        elif request.intent == "end_call":
            await conferencing_service.end_call()
        elif request.intent == "check_vitals":
            await robot_actions.check_vitals()
        elif request.intent == "call_nurse":
            await robot_actions.call_nurse()
        elif request.intent == "navigate":
            destination = request.slots.get("destination") if request.slots else None
            await robot_actions.navigate(destination)
        elif request.intent == "stop":
            await robot_actions.stop()

        await state.broadcast_update()
        return {"success": True, "message": f"Executed {request.intent}"}

    except Exception as e:
        state.last_error = str(e)
        await state.broadcast_update()
        raise HTTPException(status_code=500, detail=str(e))

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    state.connections.add(websocket)
    try:
        # Send initial state
        await websocket.send_json({"type": "system_update", "payload": await get_status()})
        while True:
            # Keep connection alive, but we don't expect messages from client
            data = await websocket.receive_text()
    except:
        pass
    finally:
        state.connections.discard(websocket)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)