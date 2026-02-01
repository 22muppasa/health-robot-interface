import asyncio
import uuid
from typing import Dict, List, Optional, Set
from dataclasses import dataclass, field
from datetime import datetime
import json

@dataclass
class Participant:
    """Represents a participant in a video call."""
    participant_id: str
    room_id: str
    session_id: str
    connected_at: datetime = field(default_factory=datetime.now)
    ice_candidates: List[dict] = field(default_factory=list)
    sdp_offer: Optional[str] = None
    sdp_answer: Optional[str] = None
    is_muted: bool = False
    is_video_off: bool = False
    connection_state: str = "new"  # new, connecting, connected, disconnected
    
    def to_dict(self):
        return {
            "participant_id": self.participant_id,
            "room_id": self.room_id,
            "connected_at": self.connected_at.isoformat(),
            "is_muted": self.is_muted,
            "is_video_off": self.is_video_off,
            "connection_state": self.connection_state,
        }

@dataclass
class VideoRoom:
    """Represents a video conference room."""
    room_id: str
    created_at: datetime = field(default_factory=datetime.now)
    participants: Dict[str, Participant] = field(default_factory=dict)
    is_active: bool = True
    
    def add_participant(self, participant: Participant):
        self.participants[participant.participant_id] = participant
    
    def remove_participant(self, participant_id: str):
        if participant_id in self.participants:
            del self.participants[participant_id]
    
    def get_other_participant(self, participant_id: str) -> Optional[Participant]:
        """Get the other participant in a 1-on-1 call."""
        for pid, p in self.participants.items():
            if pid != participant_id:
                return p
        return None
    
    def to_dict(self):
        return {
            "room_id": self.room_id,
            "created_at": self.created_at.isoformat(),
            "participant_count": len(self.participants),
            "is_active": self.is_active,
            "participants": [p.to_dict() for p in self.participants.values()],
        }


class ConferencingService:
    """
    Handles WebRTC video conferencing with full signaling support.
    Manages rooms, participants, SDP offers/answers, and ICE candidates.
    """
    
    def __init__(self, state, jitsi_base_url: str):
        self.state = state
        self.jitsi_base_url = jitsi_base_url
        
        # Video room management
        self.rooms: Dict[str, VideoRoom] = {}
        self.participant_to_room: Dict[str, str] = {}  # participant_id -> room_id
        self.session_to_participant: Dict[str, str] = {}  # session_id -> participant_id
        
        # WebSocket connections for signaling
        self.signaling_connections: Dict[str, 'WebSocket'] = {}  # participant_id -> WebSocket

    async def join_call(self, room_id: str, session_id: str = None) -> Dict:
        """
        Join a video call room. Creates room if it doesn't exist.
        Returns participant info and info about other participants.
        """
        if not room_id:
            room_id = "default-room"
        
        # Generate participant ID and session ID
        participant_id = str(uuid.uuid4())
        if not session_id:
            session_id = str(uuid.uuid4())
        
        # Create room if it doesn't exist
        if room_id not in self.rooms:
            self.rooms[room_id] = VideoRoom(room_id=room_id)
            print(f"[SIGNALING] Created new room: {room_id}")
        
        room = self.rooms[room_id]
        
        # Create new participant
        participant = Participant(
            participant_id=participant_id,
            room_id=room_id,
            session_id=session_id,
            connection_state="connecting"
        )
        
        # Add to room
        room.add_participant(participant)
        self.participant_to_room[participant_id] = room_id
        self.session_to_participant[session_id] = participant_id
        
        print(f"[SIGNALING] Participant {participant_id} joined room {room_id}, total participants: {len(room.participants)}")
        
        # Update state
        self.state.call_state = "connecting"
        await self.state.broadcast_update()
        
        # Get other participant if exists
        other_participant = room.get_other_participant(participant_id)
        if other_participant:
            print(f"[SIGNALING] Room {room_id} already has participant: {other_participant.participant_id}")
        
        return {
            "success": True,
            "participant_id": participant_id,
            "session_id": session_id,
            "room_id": room_id,
            "participant_count": len(room.participants),
            "other_participant": other_participant.to_dict() if other_participant else None,
        }

    async def add_ice_candidate(self, participant_id: str, candidate: dict) -> Dict:
        """
        Add an ICE candidate from a participant.
        Broadcast to other participants if in same room.
        """
        if participant_id not in self.participant_to_room:
            return {"success": False, "error": "Participant not found"}
        
        room_id = self.participant_to_room[participant_id]
        room = self.rooms.get(room_id)
        
        if not room:
            return {"success": False, "error": "Room not found"}
        
        participant = room.participants.get(participant_id)
        if not participant:
            return {"success": False, "error": "Participant not in room"}
        
        # Store ICE candidate
        participant.ice_candidates.append(candidate)
        
        # Broadcast to other participants in room
        await self._broadcast_to_room(
            room_id,
            {
                "type": "ice_candidate",
                "from_participant_id": participant_id,
                "candidate": candidate,
            },
            exclude_participant=participant_id
        )
        
        return {"success": True, "stored": True}

    async def send_sdp_offer(self, participant_id: str, sdp_offer: str) -> Dict:
        """
        Receive SDP offer from participant.
        Send to other participants in the room.
        """
        if participant_id not in self.participant_to_room:
            return {"success": False, "error": "Participant not found"}
        
        room_id = self.participant_to_room[participant_id]
        room = self.rooms.get(room_id)
        
        if not room:
            return {"success": False, "error": "Room not found"}
        
        participant = room.participants.get(participant_id)
        if not participant:
            return {"success": False, "error": "Participant not in room"}
        
        # Store SDP offer
        participant.sdp_offer = sdp_offer
        participant.connection_state = "connecting"
        
        print(f"Storing SDP offer from {participant_id} in room {room_id}")
        
        # Broadcast to other participants
        await self._broadcast_to_room(
            room_id,
            {
                "type": "sdp_offer",
                "from_participant_id": participant_id,
                "sdp": sdp_offer,
            },
            exclude_participant=participant_id
        )
        
        return {"success": True, "broadcast": True}

    async def handle_participant_ready(self, participant_id: str) -> Dict:
        """
        Handle when a participant signals they're ready.
        Re-sends any existing SDP offers from other participants.
        Also notifies other participants that this one is ready.
        """
        if participant_id not in self.participant_to_room:
            return {"success": False, "error": "Participant not found"}
        
        room_id = self.participant_to_room[participant_id]
        room = self.rooms.get(room_id)
        
        if not room:
            return {"success": False, "error": "Room not found"}
        
        print(f"[SIGNALING] Participant {participant_id} is ready in room {room_id}")
        
        # Mark this participant as ready
        participant = room.participants.get(participant_id)
        if participant:
            participant.connection_state = "ready"
        
        # Notify all other participants that this one is ready
        await self._broadcast_to_room(
            room_id,
            {
                "type": "participant_ready",
                "from_participant_id": participant_id,
            },
            exclude_participant=participant_id
        )
        
        # Find other participants with SDP offers and re-send them
        offers_sent = 0
        for other_participant_id, other_participant in room.participants.items():
            if other_participant_id != participant_id and other_participant.sdp_offer:
                print(f"[SIGNALING] Re-sending stored SDP offer from {other_participant_id} to {participant_id}")
                await self._send_to_participant(
                    participant_id,
                    {
                        "type": "sdp_offer",
                        "from_participant_id": other_participant_id,
                        "sdp": other_participant.sdp_offer,
                    }
                )
                offers_sent += 1
                
                # Also send any stored ICE candidates
                for candidate in other_participant.ice_candidates:
                    await self._send_to_participant(
                        participant_id,
                        {
                            "type": "ice_candidate",
                            "from_participant_id": other_participant_id,
                            "candidate": candidate,
                        }
                    )
        
        return {"success": True, "offers_resent": offers_sent}

    async def send_sdp_answer(self, participant_id: str, sdp_answer: str, to_participant_id: str) -> Dict:
        """
        Send SDP answer to a specific participant.
        """
        if participant_id not in self.participant_to_room:
            return {"success": False, "error": "Participant not found"}
        
        room_id = self.participant_to_room[participant_id]
        room = self.rooms.get(room_id)
        
        if not room:
            return {"success": False, "error": "Room not found"}
        
        participant = room.participants.get(participant_id)
        if not participant:
            return {"success": False, "error": "Participant not in room"}
        
        # Store SDP answer
        participant.sdp_answer = sdp_answer
        participant.connection_state = "connected"
        
        # Send to other participant
        await self._send_to_participant(
            to_participant_id,
            {
                "type": "sdp_answer",
                "from_participant_id": participant_id,
                "sdp": sdp_answer,
            }
        )
        
        # Also update sender state
        self.state.call_state = "in_call"
        await self.state.broadcast_update()
        
        return {"success": True, "sent": True}

    async def mute_call(self, participant_id: str) -> Dict:
        """Mute participant's audio."""
        if participant_id not in self.participant_to_room:
            return {"success": False, "error": "Participant not found"}
        
        room_id = self.participant_to_room[participant_id]
        room = self.rooms.get(room_id)
        
        if not room:
            return {"success": False, "error": "Room not found"}
        
        participant = room.participants.get(participant_id)
        if not participant:
            return {"success": False, "error": "Participant not in room"}
        
        participant.is_muted = True
        
        # Broadcast mute status
        await self._broadcast_to_room(
            room_id,
            {
                "type": "participant_muted",
                "participant_id": participant_id,
                "is_muted": True,
            }
        )
        
        return {"success": True, "muted": True}

    async def unmute_call(self, participant_id: str) -> Dict:
        """Unmute participant's audio."""
        if participant_id not in self.participant_to_room:
            return {"success": False, "error": "Participant not found"}
        
        room_id = self.participant_to_room[participant_id]
        room = self.rooms.get(room_id)
        
        if not room:
            return {"success": False, "error": "Room not found"}
        
        participant = room.participants.get(participant_id)
        if not participant:
            return {"success": False, "error": "Participant not in room"}
        
        participant.is_muted = False
        
        # Broadcast unmute status
        await self._broadcast_to_room(
            room_id,
            {
                "type": "participant_unmuted",
                "participant_id": participant_id,
                "is_muted": False,
            }
        )
        
        return {"success": True, "muted": False}

    async def toggle_video(self, participant_id: str, video_on: bool) -> Dict:
        """Toggle video on/off for participant."""
        if participant_id not in self.participant_to_room:
            return {"success": False, "error": "Participant not found"}
        
        room_id = self.participant_to_room[participant_id]
        room = self.rooms.get(room_id)
        
        if not room:
            return {"success": False, "error": "Room not found"}
        
        participant = room.participants.get(participant_id)
        if not participant:
            return {"success": False, "error": "Participant not in room"}
        
        participant.is_video_off = not video_on
        
        # Broadcast video status
        await self._broadcast_to_room(
            room_id,
            {
                "type": "participant_video",
                "participant_id": participant_id,
                "video_on": video_on,
            }
        )
        
        return {"success": True, "video_on": video_on}

    async def end_call(self, participant_id: str) -> Dict:
        """End call for participant and clean up."""
        if participant_id not in self.participant_to_room:
            return {"success": False, "error": "Participant not found"}
        
        room_id = self.participant_to_room[participant_id]
        room = self.rooms.get(room_id)
        
        if not room:
            return {"success": False, "error": "Room not found"}
        
        participant = room.participants.get(participant_id)
        if participant:
            # Broadcast participant left
            await self._broadcast_to_room(
                room_id,
                {
                    "type": "participant_left",
                    "participant_id": participant_id,
                },
                exclude_participant=participant_id
            )
            
            # Remove participant
            room.remove_participant(participant_id)
        
        # Clean up
        del self.participant_to_room[participant_id]
        if participant.session_id in self.session_to_participant:
            del self.session_to_participant[participant.session_id]
        
        # If room is empty, mark as inactive
        if not room.participants:
            room.is_active = False
        
        # Update state
        self.state.call_state = "not_in_call"
        await self.state.broadcast_update()
        
        return {"success": True, "ended": True}

    async def get_room_status(self, room_id: str) -> Dict:
        """Get current status of a room."""
        if room_id not in self.rooms:
            return {"success": False, "error": "Room not found"}
        
        room = self.rooms[room_id]
        return {"success": True, "room": room.to_dict()}

    async def get_participant_status(self, participant_id: str) -> Dict:
        """Get status of a specific participant."""
        if participant_id not in self.participant_to_room:
            return {"success": False, "error": "Participant not found"}
        
        room_id = self.participant_to_room[participant_id]
        room = self.rooms.get(room_id)
        
        if not room:
            return {"success": False, "error": "Room not found"}
        
        participant = room.participants.get(participant_id)
        if not participant:
            return {"success": False, "error": "Participant not in room"}
        
        return {
            "success": True,
            "participant": participant.to_dict(),
            "room_id": room_id,
            "other_participants": [
                p.to_dict() for p in room.participants.values() 
                if p.participant_id != participant_id
            ],
        }

    async def _broadcast_to_room(self, room_id: str, message: dict, exclude_participant: str = None):
        """Broadcast a message to all participants in a room."""
        room = self.rooms.get(room_id)
        if not room:
            print(f"[SIGNALING] WARNING: Cannot broadcast to non-existent room {room_id}")
            return
        
        recipients = [pid for pid in room.participants.keys() if pid != exclude_participant]
        print(f"[SIGNALING] Broadcasting {message.get('type')} to {len(recipients)} participants in room {room_id}")
        
        for participant_id in recipients:
            await self._send_to_participant(participant_id, message)

    async def _send_to_participant(self, participant_id: str, message: dict):
        """Send a message to a specific participant via WebSocket."""
        if participant_id in self.signaling_connections:
            try:
                websocket = self.signaling_connections[participant_id]
                await websocket.send_json(message)
                print(f"Sent {message.get('type')} to {participant_id}")
            except Exception as e:
                print(f"Failed to send message to participant {participant_id}: {e}")
        else:
            print(f"WARNING: No WebSocket connection for participant {participant_id}, message type: {message.get('type')}")

    def register_signaling_connection(self, participant_id: str, websocket):
        """Register a WebSocket connection for signaling."""
        self.signaling_connections[participant_id] = websocket
        room_id = self.participant_to_room.get(participant_id, "unknown")
        print(f"[SIGNALING] WebSocket registered for participant {participant_id} in room {room_id}")

    def unregister_signaling_connection(self, participant_id: str):
        """Unregister a WebSocket connection."""
        if participant_id in self.signaling_connections:
            del self.signaling_connections[participant_id]
            print(f"[SIGNALING] WebSocket unregistered for participant {participant_id}")

    def cleanup(self):
        """Clean up all connections and rooms."""
        self.rooms.clear()
        self.participant_to_room.clear()
        self.session_to_participant.clear()
        self.signaling_connections.clear()