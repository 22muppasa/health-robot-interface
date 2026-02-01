import { useEffect, useState, useCallback } from 'react';
import { wsManager, SystemStatus, CallStatus, TranscriptUpdate } from '@/lib/api';

interface PendingCommand {
  intent: string;
  slots?: Record<string, string>;
}

interface ActiveCallInfo {
  call_id?: string;
  room_id?: string;
  contact_name?: string;
}

interface WebSocketState {
  connected: boolean;
  systemStatus: SystemStatus;
  callStatus: CallStatus;
  lastTranscript: string;
  pendingCommand: PendingCommand | null;
  activeCallInfo: ActiveCallInfo | null;
}

const defaultSystemStatus: SystemStatus = {
  assistant_enabled: false,
  assistant_state: 'idle',
  last_transcript: '',
  last_intent: '',
  last_response: '',
  last_audio: '',
  call_state: 'not_in_call',
  last_error: '',
};

const defaultCallStatus: CallStatus = {
  state: 'not_in_call',
};

export function useWebSocket() {
  const [state, setState] = useState<WebSocketState>({
    connected: false,
    systemStatus: defaultSystemStatus,
    callStatus: defaultCallStatus,
    lastTranscript: '',
    pendingCommand: null,
    activeCallInfo: null,
  });

  useEffect(() => {
    // Connect to WebSocket
    wsManager.connect();

    // Set up listeners
    const unsubConnection = wsManager.on('connection', (data) => {
      const { connected } = data as { connected: boolean };
      setState((prev) => ({
        ...prev,
        connected,
      }));
    });

    const unsubStatus = wsManager.on('system_status', (data) => {
      const status = data as SystemStatus & { 
        pending_command?: PendingCommand;
        active_call_info?: ActiveCallInfo;
      };
      setState((prev) => ({
        ...prev,
        systemStatus: status,
        lastTranscript: status.last_transcript,
        callStatus: { state: status.call_state as CallStatus['state'] },
        pendingCommand: status.pending_command || null,
        activeCallInfo: status.active_call_info || null,
      }));
    });

    const unsubCall = wsManager.on('call_status', (data) => {
      setState((prev) => ({
        ...prev,
        callStatus: data as CallStatus,
      }));
    });

    const unsubTranscript = wsManager.on('transcript', (data) => {
      const transcript = data as TranscriptUpdate;
      if (transcript.isFinal) {
        setState((prev) => ({
          ...prev,
          lastTranscript: transcript.text,
        }));
      }
    });

    return () => {
      unsubConnection();
      unsubStatus();
      unsubCall();
      unsubTranscript();
      wsManager.disconnect();
    };
  }, []);

  const updateStatus = useCallback((updates: Partial<SystemStatus>) => {
    setState((prev) => ({
      ...prev,
      systemStatus: { ...prev.systemStatus, ...updates },
    }));
  }, []);

  const clearPendingCommand = useCallback(() => {
    setState((prev) => ({
      ...prev,
      pendingCommand: null,
    }));
  }, []);

  return { ...state, updateStatus, clearPendingCommand };
}
