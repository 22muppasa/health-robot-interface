import { useEffect, useState, useCallback } from 'react';
import { wsManager, SystemStatus, CallStatus, TranscriptUpdate } from '@/lib/api';

interface WebSocketState {
  connected: boolean;
  systemStatus: SystemStatus;
  callStatus: CallStatus;
  lastTranscript: string;
}

const defaultSystemStatus: SystemStatus = {
  assistant_enabled: false,
  assistant_state: 'idle',
  last_transcript: '',
  last_intent: '',
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
      const status = data as SystemStatus;
      setState((prev) => ({
        ...prev,
        systemStatus: status,
        lastTranscript: status.last_transcript,
        callStatus: { state: status.call_state as CallStatus['state'] },
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

  return { ...state, updateStatus };
}
