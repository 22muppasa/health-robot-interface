"""
Chat History Storage Module

Provides persistent storage of patient-Claire conversations using JSON files.
Each patient has their own history file stored in conversation_logs/ directory.
Supports real-time broadcasting of new messages via WebSocket.
"""

import json
import os
import asyncio
from datetime import datetime
from typing import List, Dict, Optional, Callable, Awaitable
from pathlib import Path

# Directory for storing conversation logs
CHAT_HISTORY_DIR = Path(__file__).parent / "conversation_logs"

# Callback for broadcasting new messages (set by main.py)
_broadcast_callback: Optional[Callable[[str, Dict], Awaitable[None]]] = None


def set_broadcast_callback(callback: Callable[[str, Dict], Awaitable[None]]):
    """
    Set the callback function for broadcasting new messages.
    Called by main.py to register WebSocket broadcasting.
    """
    global _broadcast_callback
    _broadcast_callback = callback


def ensure_directory():
    """Ensure the conversation_logs directory exists."""
    CHAT_HISTORY_DIR.mkdir(exist_ok=True)


def get_history_file_path(patient_id: str) -> Path:
    """Get the path to a patient's chat history file."""
    ensure_directory()
    # Sanitize patient_id to prevent path traversal
    safe_id = "".join(c for c in patient_id if c.isalnum() or c in "-_")
    return CHAT_HISTORY_DIR / f"{safe_id}.json"


def save_message(
    patient_id: str,
    role: str,
    content: str,
    intent: Optional[str] = None,
    broadcast: bool = True
) -> Dict:
    """
    Save a single message to the patient's chat history.
    
    Args:
        patient_id: Unique identifier for the patient
        role: "user" or "assistant"
        content: The message content
        intent: Optional intent classification (for assistant messages)
        broadcast: Whether to broadcast via WebSocket (default True)
    
    Returns:
        The saved message object with timestamp and id
    """
    ensure_directory()
    history_file = get_history_file_path(patient_id)
    
    # Load existing history or create new
    if history_file.exists():
        with open(history_file, "r") as f:
            history = json.load(f)
    else:
        history = {"patient_id": patient_id, "messages": []}
    
    # Create new message
    message = {
        "id": f"{role}-{int(datetime.now().timestamp() * 1000)}",
        "role": role,
        "content": content,
        "timestamp": datetime.now().isoformat(),
    }
    
    if intent:
        message["intent"] = intent
    
    history["messages"].append(message)
    
    # Keep only last 500 messages to prevent file bloat
    if len(history["messages"]) > 500:
        history["messages"] = history["messages"][-500:]
    
    # Save updated history
    with open(history_file, "w") as f:
        json.dump(history, f, indent=2)
    
    # Broadcast new message via WebSocket if callback is set
    if broadcast and _broadcast_callback:
        try:
            # Schedule the async broadcast in the running event loop
            loop = asyncio.get_event_loop()
            if loop.is_running():
                asyncio.create_task(_broadcast_callback(patient_id, message))
            else:
                loop.run_until_complete(_broadcast_callback(patient_id, message))
        except Exception as e:
            print(f"Warning: Failed to broadcast message: {e}")
    
    return message


def get_history(
    patient_id: str,
    limit: int = 50,
    offset: int = 0
) -> Dict:
    """
    Get conversation history for a patient.
    
    Args:
        patient_id: Unique identifier for the patient
        limit: Maximum number of messages to return (default 50)
        offset: Number of messages to skip from the end (for pagination)
    
    Returns:
        Dictionary with patient_id, messages array, and total count
    """
    history_file = get_history_file_path(patient_id)
    
    if not history_file.exists():
        return {
            "patient_id": patient_id,
            "messages": [],
            "total": 0
        }
    
    with open(history_file, "r") as f:
        history = json.load(f)
    
    messages = history.get("messages", [])
    total = len(messages)
    
    # Get messages from the end (most recent), respecting offset and limit
    if offset > 0:
        messages = messages[:-offset] if offset < len(messages) else []
    
    # Take the last 'limit' messages
    messages = messages[-limit:] if len(messages) > limit else messages
    
    return {
        "patient_id": patient_id,
        "messages": messages,
        "total": total
    }


def clear_history(patient_id: str) -> bool:
    """
    Clear all conversation history for a patient.
    
    Args:
        patient_id: Unique identifier for the patient
    
    Returns:
        True if history was cleared, False if no history existed
    """
    history_file = get_history_file_path(patient_id)
    
    if history_file.exists():
        history_file.unlink()
        return True
    
    return False


def get_all_patients_with_history() -> List[str]:
    """
    Get a list of all patient IDs that have conversation history.
    
    Returns:
        List of patient IDs
    """
    ensure_directory()
    
    patient_ids = []
    for file_path in CHAT_HISTORY_DIR.glob("*.json"):
        patient_id = file_path.stem
        patient_ids.append(patient_id)
    
    return patient_ids
