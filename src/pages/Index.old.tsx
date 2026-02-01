/* eslint-disable @typescript-eslint/no-explicit-any, no-empty, react-hooks/exhaustive-deps */
import { useState, useEffect, useCallback, useRef } from 'react';
import { VideoConference } from '@/components/VideoConference';
import { VoiceAssistant } from '@/components/VoiceAssistant';
import { NurseAssistant } from '@/components/NurseAssistant';
import { IncomingCallDialog } from '@/components/IncomingCallDialog';
import { ClaireCornerIcon } from '@/components/ClaireCornerIcon';
import { ResponsiveLayout } from '@/components/ResponsiveLayout';
import { ClaireFullScreen } from '@/components/ClaireFullScreen';
import { NavStatusIcons } from '@/components/NavStatusIcons';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useSimpleWakeWord } from '@/hooks/useSimpleWakeWord';
import { CallStatus, api } from '@/lib/api';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';

const Index = () => {
  const { systemStatus, callStatus, lastTranscript, updateStatus, pendingCommand, activeCallInfo, clearPendingCommand } = useWebSocket();
  const [localCallStatus, setLocalCallStatus] = useState<CallStatus>(callStatus);
  const [voiceEnabled, setVoiceEnabled] = useState(systemStatus.assistant_enabled);
  const [incomingCall, setIncomingCall] = useState<any>(null);
  const [showIncomingDialog, setShowIncomingDialog] = useState(false);
  const [activeTab, setActiveTab] = useState('voice');
  const [callingContact, setCallingContact] = useState<string | null>(null);
  const [showClaireFullScreen, setShowClaireFullScreen] = useState(false);
  const [claireListening, setClaireListening] = useState(false);
  const [claireSpeaking, setClaireSpeaking] = useState(false);
  const [claireTranscript, setClaireTranscript] = useState('');
  const [claireResponse, setClaireResponse] = useState('');
  const [micPermissionGranted, setMicPermissionGranted] = useState<boolean | null>(null);
  const { toast } = useToast();
  const processedCommandRef = useRef<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const commandRecognitionRef = useRef<any>(null);
  
  // Request microphone permission early on startup
  useEffect(() => {
    const requestMicPermission = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        // Stop the stream immediately - we just needed to trigger permission
        stream.getTracks().forEach(track => track.stop());
        setMicPermissionGranted(true);
        console.log('Microphone permission granted');
      } catch (error) {
        console.error('Microphone permission denied:', error);
        setMicPermissionGranted(false);
        toast({
          title: 'Microphone Access Required',
          description: 'Please allow microphone access for voice commands to work.',
          variant: 'destructive',
        });
      }
    };
    requestMicPermission();
  }, [toast]);
  
  // Use consistent patient ID stored in localStorage
  const getPatientId = () => {
    const stored = localStorage.getItem('patientId');
    if (stored) return stored;
    const newId = `patient-${Date.now().toString(36)}`;
    localStorage.setItem('patientId', newId);
    return newId;
  };
  const patientIdRef = useRef<string>(getPatientId());
  const patientId = patientIdRef.current;

  // Play audio from base64
  const playAudio = useCallback((audioBase64: string) => {
    try {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      const audio = new Audio(`data:audio/mp3;base64,${audioBase64}`);
      audioRef.current = audio;
      audio.onplay = () => setClaireSpeaking(true);
      audio.onended = () => setClaireSpeaking(false);
      audio.play().catch(err => console.error('Audio playback failed:', err));
    } catch (error) {
      console.error('Error playing audio:', error);
    }
  }, []);

  // Handle Claire voice command during call
  const handleClaireCommand = useCallback(async () => {
    if (!('webkitSpeechRecognition' in window)) {
      toast({
        title: 'Not Supported',
        description: 'Voice recognition not available',
        variant: 'destructive',
      });
      return;
    }

    setShowClaireFullScreen(true);
    setClaireListening(true);

    const recognition = new (window as any).webkitSpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = 'en-US';
    
    let silenceTimeout: NodeJS.Timeout | null = null;

    const resetSilenceTimeout = () => {
      if (silenceTimeout) clearTimeout(silenceTimeout);
      silenceTimeout = setTimeout(() => {
        try { recognition.stop(); } catch {}
        setShowClaireFullScreen(false);
        setClaireListening(false);
        setClaireSpeaking(false);
      }, 15000);
    };

    recognition.onstart = () => {
      resetSilenceTimeout();
    };

    recognition.onresult = async (event: any) => {
      const transcript = event.results?.[event.results.length - 1]?.[0]?.transcript ?? '';
      if (transcript) {
        setClaireTranscript(transcript);
        resetSilenceTimeout();

        // Check for call-specific commands
        const lowerTranscript = transcript.toLowerCase();
        
        // End call commands
        if (lowerTranscript.includes('end call') || lowerTranscript.includes('hang up') || lowerTranscript.includes('end the call')) {
          handleEndCall();
          setShowClaireFullScreen(false);
          setClaireListening(false);
          toast({ title: 'Call Ended', description: 'Claire ended the call' });
          try { recognition.stop(); } catch {}
          return;
        }
        
        // Answer call commands (when there's an incoming call)
        if (showIncomingDialog && incomingCall && 
            (lowerTranscript.includes('answer') || lowerTranscript.includes('accept') || 
             lowerTranscript.includes('pick up') || lowerTranscript.includes('yes'))) {
          handleAnswerCall();
          setShowClaireFullScreen(false);
          setClaireListening(false);
          toast({ title: 'Answering Call', description: 'Claire is connecting you...' });
          try { recognition.stop(); } catch {}
          return;
        }
        
        // Reject call commands
        if (showIncomingDialog && incomingCall && 
            (lowerTranscript.includes('reject') || lowerTranscript.includes('decline') || 
             lowerTranscript.includes('no') || lowerTranscript.includes('ignore'))) {
          handleRejectCall();
          setShowClaireFullScreen(false);
          setClaireListening(false);
          toast({ title: 'Call Declined', description: 'Claire declined the call' });
          try { recognition.stop(); } catch {}
          return;
        }
        
        // Mute/unmute commands during call
        if (localCallStatus.state === 'in_call') {
          if (lowerTranscript.includes('mute') && !lowerTranscript.includes('unmute')) {
            setClaireResponse('Microphone muted');
            // Mute handled by VideoConference component
            try { recognition.stop(); } catch {}
            return;
          }
          if (lowerTranscript.includes('unmute')) {
            setClaireResponse('Microphone unmuted');
            try { recognition.stop(); } catch {}
            return;
          }
        }

        // Send to backend for other processing
        try {
          const response = await api.post('/api/text-command', { text: transcript });
          if (response?.response) {
            setClaireResponse(response.response);
          }

          // Play audio response
          setTimeout(async () => {
            try {
              const audioResponse = await fetch('/api/audio/last');
              if (audioResponse.ok) {
                const blob = await audioResponse.blob();
                const audioUrl = URL.createObjectURL(blob);
                const audio = new Audio(audioUrl);
                audio.onplay = () => setClaireSpeaking(true);
                audio.onended = () => {
                  setClaireSpeaking(false);
                  resetSilenceTimeout();
                };
                audio.play().catch(() => setClaireSpeaking(false));
              }
            } catch {}
          }, 200);
        } catch (error) {
          console.error('Command failed:', error);
        }
      }
    };

    recognition.onerror = (event: any) => {
      if (event.error !== 'no-speech' && event.error !== 'aborted') {
        console.error('Recognition error:', event.error);
      }
      if (silenceTimeout) clearTimeout(silenceTimeout);
      setShowClaireFullScreen(false);
      setClaireListening(false);
      setClaireSpeaking(false);
    };

    recognition.onend = () => {
      if (silenceTimeout) clearTimeout(silenceTimeout);
      setClaireListening(false);
      // Keep full screen open if we played audio
      if (!claireSpeaking) {
        setShowClaireFullScreen(false);
      }
    };

    commandRecognitionRef.current = recognition;

    try {
      recognition.start();
    } catch (e) {
      console.error('Failed to start recognition:', e);
      setShowClaireFullScreen(false);
      setClaireListening(false);
    }
  }, [toast, claireSpeaking]);

  // Wake word detection - always active when voice is enabled
  const { isListening: wakeWordListening } = useSimpleWakeWord({
    isEnabled: voiceEnabled && !claireListening && !showClaireFullScreen,
    wakeWord: 'claire',
    onWakeWordDetected: handleClaireCommand,
  });

  // Handle incoming call announcements from Claire
  useEffect(() => {
    if (pendingCommand && pendingCommand.intent === 'incoming_call' && pendingCommand.slots?.call_id) {
      const commandId = `${pendingCommand.intent}-${pendingCommand.slots.call_id}`;
      
      // Avoid processing the same command twice
      if (processedCommandRef.current === commandId) return;
      processedCommandRef.current = commandId;
      
      // Show incoming call dialog
      setIncomingCall({
        call_id: pendingCommand.slots.call_id,
        initiator_name: pendingCommand.slots.caller_name,
        initiator_role: pendingCommand.slots.caller_role,
        room_id: pendingCommand.slots.room_id,
        patientId: patientId
      });
      setShowIncomingDialog(true);
      
      // Play Claire's announcement if audio is available
      if (systemStatus.last_audio) {
        playAudio(systemStatus.last_audio);
      }
      
      toast({
        title: 'Incoming Call!',
        description: `${pendingCommand.slots.caller_name} is calling...`,
      });
      
      clearPendingCommand();
    }
  }, [pendingCommand, clearPendingCommand, toast, playAudio, systemStatus.last_audio, patientId]);

  // Handle Claire-initiated calls via voice command
  useEffect(() => {
    if (pendingCommand && pendingCommand.intent === 'join_call' && pendingCommand.slots?.room_id) {
      const commandId = `${pendingCommand.intent}-${pendingCommand.slots.room_id}`;
      
      // Avoid processing the same command twice
      if (processedCommandRef.current === commandId) return;
      processedCommandRef.current = commandId;
      
      const contactName = pendingCommand.slots.contact_name || 'Contact';
      setCallingContact(contactName);
      
      toast({
        title: 'Calling...',
        description: `Connecting to ${contactName}`,
      });
      
      // Join the call
      setLocalCallStatus({
        state: 'connecting' as const
      });
      
      // Short delay then connect
      setTimeout(() => {
        setLocalCallStatus({
          state: 'in_call' as const,
          roomId: pendingCommand.slots.room_id,
          participantCount: 1
        });
        
        toast({
          title: 'Call Connected',
          description: `Connected to ${contactName}`,
        });
      }, 1500);
      
      clearPendingCommand();
    }
  }, [pendingCommand, clearPendingCommand, toast]);

  // Handle active call info from backend
  useEffect(() => {
    if (activeCallInfo && activeCallInfo.room_id && localCallStatus.state === 'not_in_call') {
      setCallingContact(activeCallInfo.contact_name || 'Contact');
      setLocalCallStatus({
        state: 'in_call' as const,
        roomId: activeCallInfo.room_id,
        participantCount: 1
      });
    }
  }, [activeCallInfo, localCallStatus.state]);

  // Check for pending calls via WebSocket pendingCommand - only use periodic polling as backup
  useEffect(() => {
    // Only poll if we're not getting updates via WebSocket
    const checkPendingCalls = async () => {
      // Skip if we already have an incoming call showing
      if (showIncomingDialog || incomingCall) return;
      
      try {
        const response = await fetch(`/api/calls/pending/${patientId}`);
        if (response.ok) {
          const data = await response.json();
          if (data.pending_calls && data.pending_calls.length > 0) {
            const call = data.pending_calls[0];
            setIncomingCall({
              ...call,
              patientId: patientId
            });
            setShowIncomingDialog(true);
            
            toast({
              title: 'Incoming Call!',
              description: `${call.initiator_name} is calling...`,
            });
          }
        }
      } catch (error) {
        console.error('Error checking pending calls:', error);
      }
    };

    // Check less frequently since WebSocket handles most updates
    const interval = setInterval(checkPendingCalls, 5000);
    checkPendingCalls();

    return () => clearInterval(interval);
  }, [toast, patientId, showIncomingDialog, incomingCall]);

  const handleAnswerCall = async () => {
    if (!incomingCall) return;

    try {
      setShowIncomingDialog(false);
      setCallingContact(incomingCall.initiator_name);
      setLocalCallStatus({ state: 'connecting' as const });

      const response = await fetch('/api/calls/answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          call_id: incomingCall.call_id,
          patient_id: patientId
        })
      });

      if (!response.ok) {
        throw new Error('Failed to answer call');
      }

      const data = await response.json();

      toast({
        title: 'Call Connected',
        description: `Connected to ${incomingCall.initiator_name}`,
      });

      setLocalCallStatus({ 
        state: 'in_call' as const,
        roomId: data.room_id,
        participantCount: 1
      });
      
      setIncomingCall(null);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to answer call',
        variant: 'destructive'
      });
      console.error('Error answering call:', error);
      setLocalCallStatus({ state: 'not_in_call' });
    }
  };

  const handleRejectCall = async () => {
    if (!incomingCall) return;

    try {
      await fetch('/api/calls/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          call_id: incomingCall.call_id,
          patient_id: patientId
        })
      });

      setShowIncomingDialog(false);
      setIncomingCall(null);

      toast({
        title: 'Call Rejected',
        description: `Call from ${incomingCall.initiator_name} was rejected`,
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to reject call',
        variant: 'destructive'
      });
    }
  };

  const handleEndCall = useCallback(() => {
    setLocalCallStatus({ state: 'not_in_call' });
    setCallingContact(null);
    setIncomingCall(null);
    setShowIncomingDialog(false);
  }, []);

  const handleCallStatusChange = (status: CallStatus) => {
    setLocalCallStatus(status);
  };

  const handleVoiceToggle = (enabled: boolean) => {
    setVoiceEnabled(enabled);
    updateStatus({ assistant_enabled: enabled });
  };

  const isListening = systemStatus.assistant_state === 'listening';
  const isInCall = localCallStatus.state === 'in_call';

  return (
    <ResponsiveLayout
      headerTitle="Claire Healthcare Robot"
      isFullScreen={isInCall}
      showHeader={true}
      showFooter={!isInCall}
      headerExtra={!isInCall ? <NavStatusIcons status={systemStatus} /> : undefined}
    >
      {/* Incoming Call Dialog Modal */}
      {showIncomingDialog && incomingCall && (
        <IncomingCallDialog
          isVisible={showIncomingDialog}
          callerName={incomingCall.initiator_name}
          callerRole={incomingCall.initiator_role}
          onAnswer={handleAnswerCall}
          onReject={handleRejectCall}
        />
      )}

      {/* Main Content Area */}
      <div className={cn(
        'flex-1 min-h-0 overflow-hidden',
        isInCall ? 'p-0' : 'p-2 sm:p-3 md:p-4'
      )}>
        {isInCall ? (
          /* Full Screen Call Mode */
          <div className="w-full h-full">
            <VideoConference
              callStatus={localCallStatus}
              onStatusChange={handleCallStatusChange}
              onEndCall={handleEndCall}
              callerName={callingContact || 'Contact'}
              isFullScreen={true}
            />
          </div>
        ) : (
          /* Normal Grid Layout */
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 sm:gap-3 h-full auto-rows-fr">
            {/* Video Conference Panel */}
            <div className="min-h-0 rounded-lg border border-border bg-card shadow-sm overflow-hidden">
              <VideoConference
                callStatus={localCallStatus}
                onStatusChange={handleCallStatusChange}
                onEndCall={handleEndCall}
                callerName={callingContact || 'Contact'}
                isFullScreen={false}
              />
            </div>

            {/* Control Panel with Tabs */}
            <div className="min-h-0 rounded-lg border border-border bg-card shadow-sm overflow-hidden flex flex-col">
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full h-full flex flex-col">
                <TabsList className="grid w-full grid-cols-2 rounded-none border-b border-border">
                  <TabsTrigger value="voice" className="text-xs sm:text-sm">
                    🎤 Talk to Claire
                  </TabsTrigger>
                  <TabsTrigger value="nurse" className="text-xs sm:text-sm">
                    ⚕️ Nurse Help
                  </TabsTrigger>
                </TabsList>

                {/* Voice Assistant Tab */}
                <TabsContent 
                  value="voice" 
                  className="flex-1 min-h-0 m-0 p-3 sm:p-4 overflow-y-auto data-[state=active]:flex data-[state=active]:flex-col"
                >
                  <VoiceAssistant
                    isEnabled={voiceEnabled}
                    isListening={isListening}
                    lastTranscript={lastTranscript}
                    onToggle={handleVoiceToggle}
                  />
                </TabsContent>

                {/* Nurse Features Tab */}
                <TabsContent 
                  value="nurse" 
                  className="flex-1 min-h-0 m-0 p-3 sm:p-4 overflow-y-auto data-[state=active]:flex data-[state=active]:flex-col"
                >
                  <NurseAssistant
                    isEnabled={voiceEnabled}
                    onFeatureExecuted={(featureId) => {
                      console.log(`Feature executed: ${featureId}`);
                    }}
                  />
                </TabsContent>
              </Tabs>
            </div>
          </div>
        )}
      </div>

      {/* Claire Corner Icon - Visible during calls, clickable to talk to Claire */}
      {isInCall && (
        <ClaireCornerIcon
          isListening={claireListening || wakeWordListening}
          isVisible={true}
          onClick={handleClaireCommand}
        />
      )}

      {/* Claire Full Screen Modal - For voice interaction during calls */}
      <ClaireFullScreen
        isOpen={showClaireFullScreen}
        isListening={claireListening}
        isSpeaking={claireSpeaking}
        lastTranscript={claireTranscript}
        lastResponse={claireResponse}
        onClose={() => {
          setShowClaireFullScreen(false);
          setClaireListening(false);
          setClaireSpeaking(false);
          try { commandRecognitionRef.current?.stop?.(); } catch {}
        }}
      />
    </ResponsiveLayout>
  );
};

export default Index;
