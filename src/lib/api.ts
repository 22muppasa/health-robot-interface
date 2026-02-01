// API configuration and utilities for FastAPI backend communication

const API_BASE_URL = import.meta.env.VITE_API_URL || '';
const WS_BASE_URL = import.meta.env.VITE_WS_URL || '';

// Get the device ID header for authenticated requests
function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  
  const deviceId = localStorage.getItem('claire_device_id');
  if (deviceId) {
    headers['X-Device-Id'] = deviceId;
  }
  
  // Add guardian auth token if available (for family portal)
  const guardianToken = localStorage.getItem('claire_guardian_token');
  if (guardianToken) {
    headers['Authorization'] = `Bearer ${guardianToken}`;
  }
  
  return headers;
}

// Command structure for robot actions
export interface RobotCommand {
  intent: string;
  slots?: Record<string, string | number | boolean>;
  source?: "ui" | "voice";
}

// Status types from WebSocket
export interface SystemStatus {
  assistant_enabled: boolean;
  assistant_state: 'idle' | 'listening' | 'processing' | 'speaking';
  last_transcript: string;
  last_intent: string;
  last_response?: string;
  last_audio?: string;
  call_state: 'not_in_call' | 'connecting' | 'in_call';
  last_error: string;
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

export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  intent?: string;
}

export interface ConversationUpdate {
  patient_id: string;
  message: ConversationMessage;
}

// REST API calls
export const api = {
  // Send a robot command
  async sendCommand(command: RobotCommand ): Promise<{ success: boolean; message: string }> {
    const url = API_BASE_URL ? `${API_BASE_URL}/api/command` : '/api/command';
    console.log('Sending command to:', url, command);
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          intent: command.intent,
          slots: command.slots || {},
          source: command.source || 'ui',
        }),
      });
      console.log('Command response status:', response.status);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
      }
      const result = await response.json();
      console.log('Command result:', result);
      return result;
    } catch (error) {
      console.error('Command error:', error);
      throw error;
    }
  },

  // Generic POST method for sending data
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async post(path: string, data: Record<string, unknown>): Promise<any> {
    const url = API_BASE_URL ? `${API_BASE_URL}${path}` : path;
    console.log('Posting to:', url, data);
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(data),
      });
      console.log('Post response status:', response.status);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
      }
      const result = await response.json();
      console.log('Post result:', result);
      return result;
    } catch (error) {
      console.error('Post error:', error);
      throw error;
    }
  },

  // Generic GET method for fetching data
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async get(path: string): Promise<any> {
    const url = API_BASE_URL ? `${API_BASE_URL}${path}` : path;
    console.log('Getting from:', url);
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: getAuthHeaders(),
      });
      console.log('Get response status:', response.status);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
      }
      const result = await response.json();
      console.log('Get result:', result);
      return result;
    } catch (error) {
      console.error('Get error:', error);
      throw error;
    }
  },

  // Get initial status
  async getStatus(): Promise<SystemStatus> {
    const url = API_BASE_URL ? `${API_BASE_URL}/api/status` : '/api/status';
    console.log('Getting status from:', url);
    try {
      const response = await fetch(url, {
        headers: getAuthHeaders(),
      });
      console.log('Status response status:', response.status);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const result = await response.json();
      console.log('Status result:', result);
      return result;
    } catch (error) {
      console.error('Status error:', error);
      throw error;
    }
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

    // Construct WebSocket URL
    let wsUrl: string;
    if (WS_BASE_URL) {
      wsUrl = `${WS_BASE_URL}/ws`;
    } else {
      // Use relative path for proxy
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      wsUrl = `${protocol}//${window.location.host}/ws`;
    }

    console.log('Connecting to WebSocket:', wsUrl);
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      console.log('WebSocket connected');
      this.reconnectAttempts = 0;
      this.emit('connection', { connected: true });
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        // Handle ping from server - respond with pong
        if (data.type === 'ping') {
          this.send('pong', { timestamp: Date.now() });
          return;
        }
        
        // Handle pong from server (keep-alive confirmation)
        if (data.type === 'pong') {
          return; // Connection is alive, no action needed
        }
        
        console.log('WebSocket message received:', data);
        if (data.type === 'system_update') {
          this.emit('system_status', data.payload);
          this.emit('call_status', { state: data.payload.call_state });
          this.emit('transcript', { text: data.payload.last_transcript, isFinal: true, timestamp: new Date().toISOString() });
        } else if (data.type === 'conversation_update') {
          // Real-time conversation message from patient-Claire interaction
          this.emit('conversation_update', {
            patient_id: data.patient_id,
            message: data.message,
          } as ConversationUpdate);
        }
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
