// API configuration and utilities for FastAPI backend communication

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const WS_BASE_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8000';

// Command structure for robot actions
export interface RobotCommand {
  intent: string;
  slots: Record<string, string | number | boolean>;
  timestamp?: string;
}

// Status types from WebSocket
export interface SystemStatus {
  assistantState: 'idle' | 'listening' | 'processing' | 'speaking';
  microphoneEnabled: boolean;
  cameraEnabled: boolean;
  networkConnected: boolean;
}

export interface CallStatus {
  state: 'not_in_call' | 'connecting' | 'in_call';
  roomId?: string;
  participantCount?: number;
}

export interface TranscriptUpdate {
  text: string;
  isFinal: boolean;
  timestamp: string;
}

// REST API calls
export const api = {
  // Send a robot command
  async sendCommand(command: RobotCommand): Promise<{ success: boolean; message: string }> {
    const response = await fetch(`${API_BASE_URL}/api/command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...command,
        timestamp: new Date().toISOString(),
      }),
    });
    return response.json();
  },

  // Video call controls
  async joinCall(roomId: string): Promise<{ success: boolean; joinUrl?: string }> {
    const response = await fetch(`${API_BASE_URL}/api/call/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId }),
    });
    return response.json();
  },

  async endCall(): Promise<{ success: boolean }> {
    const response = await fetch(`${API_BASE_URL}/api/call/end`, {
      method: 'POST',
    });
    return response.json();
  },

  // Voice assistant controls
  async toggleVoiceAssistant(enabled: boolean): Promise<{ success: boolean }> {
    const response = await fetch(`${API_BASE_URL}/api/voice/toggle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
    return response.json();
  },

  async pushToTalk(active: boolean): Promise<{ success: boolean }> {
    const response = await fetch(`${API_BASE_URL}/api/voice/ptt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active }),
    });
    return response.json();
  },

  // Get initial status
  async getStatus(): Promise<SystemStatus> {
    const response = await fetch(`${API_BASE_URL}/api/status`);
    return response.json();
  },
};

// WebSocket connection manager
export class WebSocketManager {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 2000;
  private listeners: Map<string, Set<(data: unknown) => void>> = new Map();

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    this.ws = new WebSocket(`${WS_BASE_URL}/ws`);

    this.ws.onopen = () => {
      console.log('WebSocket connected');
      this.reconnectAttempts = 0;
      this.emit('connection', { connected: true });
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.emit(data.type, data.payload);
      } catch (e) {
        console.error('Failed to parse WebSocket message:', e);
      }
    };

    this.ws.onclose = () => {
      console.log('WebSocket disconnected');
      this.emit('connection', { connected: false });
      this.attemptReconnect();
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    setTimeout(() => this.connect(), this.reconnectDelay);
  }

  disconnect(): void {
    this.ws?.close();
    this.ws = null;
  }

  on(event: string, callback: (data: unknown) => void): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);

    return () => {
      this.listeners.get(event)?.delete(callback);
    };
  }

  private emit(event: string, data: unknown): void {
    this.listeners.get(event)?.forEach((callback) => callback(data));
  }

  send(type: string, payload: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, payload }));
    }
  }
}

// Singleton instance
export const wsManager = new WebSocketManager();
