import { useState, useEffect, useCallback, useRef } from 'react';
import { SimpleVideoCall } from '@/components/SimpleVideoCall';
import { ClaireChatPanel } from '@/components/ClaireChatPanel';
import { NurseAssistant } from '@/components/NurseAssistant';
import { IncomingCallDialog } from '@/components/IncomingCallDialog';
import { ClaireCornerIcon } from '@/components/ClaireCornerIcon';
import { ResponsiveLayout } from '@/components/ResponsiveLayout';
import { ClaireFullScreen } from '@/components/ClaireFullScreen';
import { ModeRenderer, isImmersiveMode } from '@/components/ModeRenderer';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useSimpleWakeWord } from '@/hooks/useSimpleWakeWord';
import { useConversation } from '@/hooks/useConversation';
import { useMode, type ClaireMode, MODE_INFO } from '@/hooks/useMode';
import { usePatientIdentity } from '@/hooks/usePatientIdentity';
import DevicePairingScreen from '@/components/DevicePairingScreen';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import { Phone, AlertTriangle, HelpCircle, Users, X, Mic, Bell, Clock } from 'lucide-react';

// Check if device pairing is required (can be disabled for development)
const REQUIRE_PAIRING = import.meta.env.VITE_REQUIRE_PAIRING !== 'false';

const Index = () => {
  const { systemStatus, pendingCommand, activeCallInfo, clearPendingCommand } = useWebSocket();
  const { identity, isPaired, isLoading: isIdentityLoading } = usePatientIdentity();
  const [incomingCall, setIncomingCall] = useState<{ call_id?: string; caller_name?: string; initiator_name?: string; initiator_role?: string; room_id?: string; patientId?: string } | null>(null);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [isCallActive, setIsCallActive] = useState(false);
  const [isCallMuted, setIsCallMuted] = useState(false);
  const [isCallVideoOff, setIsCallVideoOff] = useState(false);
  const [callerName, setCallerName] = useState<string>('Family');
  const [showIncomingDialog, setShowIncomingDialog] = useState(false);
  const [showClaireFullScreen, setShowClaireFullScreen] = useState(false);
  const [claireState, setClaireState] = useState<'idle' | 'listening' | 'thinking' | 'speaking'>('idle');
  const [claireTranscript, setClaireTranscript] = useState('');
  const [claireResponse, setClaireResponse] = useState('');
  const [micPermissionGranted, setMicPermissionGranted] = useState<boolean | null>(null);
  const [showContactsModal, setShowContactsModal] = useState(false);
  const [showNurseModal, setShowNurseModal] = useState(false);
  const [contacts, setContacts] = useState<{ id: string; name: string; phone?: string; relationship?: string; type?: string; photo_url?: string }[]>([]);
  const [upcomingReminders, setUpcomingReminders] = useState<{ id: string; title: string; scheduled_time: string }[]>([]);
  const { toast } = useToast();
  const processedCommandRef = useRef<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const commandRecognitionRef = useRef<SpeechRecognition | null>(null);
  const claireStateRef = useRef<'idle' | 'listening' | 'thinking' | 'speaking'>('idle');
  const faceCloseTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const showClaireFullScreenRef = useRef(false);
  
  // Keep refs in sync with state
  useEffect(() => {
    claireStateRef.current = claireState;
  }, [claireState]);
  
  useEffect(() => {
    showClaireFullScreenRef.current = showClaireFullScreen;
  }, [showClaireFullScreen]);
  
  // Conversation hook for chat messages
  const { messages, isWaiting, sendMessage, cancelMessage, isPlayingAudio } = useConversation();
  
  // Mode hook for display modes
  const { currentMode, setMode, isImmersiveMode: isImmersive } = useMode();
  
  // Request microphone permission early on startup
  useEffect(() => {
    const requestMicPermission = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
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

  // Load contacts on startup
  useEffect(() => {
    const loadContacts = async () => {
      try {
        const response = await fetch('/api/user-profile');
        if (response.ok) {
          const data = await response.json();
          const allContacts = [
            ...(data.family_contacts || []),
            ...(data.emergency_contacts || [])
          ];
          setContacts(allContacts);
        }
      } catch (error) {
        console.error('Failed to load contacts:', error);
      }
    };
    loadContacts();
  }, []);

  // Load upcoming reminders
  useEffect(() => {
    const loadReminders = async () => {
      try {
        const response = await fetch('/api/reminders/upcoming');
        if (response.ok) {
          const data = await response.json();
          setUpcomingReminders((data.upcoming || []).slice(0, 3));
        }
      } catch (error) {
        console.error('Failed to load reminders:', error);
      }
    };
    loadReminders();
    const interval = setInterval(loadReminders, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, []);
  
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
      audio.onplay = () => setClaireState('speaking');
      audio.onended = () => setClaireState('idle');
      audio.play().catch(err => console.error('Audio playback failed:', err));
    } catch (error) {
      console.error('Error playing audio:', error);
    }
  }, []);

  // Handle Claire voice command
  const handleClaireCommand = useCallback(async () => {
    const SpeechRecognitionConstructor = window.webkitSpeechRecognition || window.SpeechRecognition;
    if (!SpeechRecognitionConstructor) {
      toast({
        title: 'Not Supported',
        description: 'Voice recognition not available',
        variant: 'destructive',
      });
      return;
    }

    setShowClaireFullScreen(true);
    setClaireState('listening');
    setClaireTranscript('');

    const recognition = new SpeechRecognitionConstructor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    
    let silenceTimeout: NodeJS.Timeout | null = null;
    let finalTranscript = '';

    const resetSilenceTimeout = () => {
      if (silenceTimeout) clearTimeout(silenceTimeout);
      silenceTimeout = setTimeout(() => {
        // Process final transcript before closing
        if (finalTranscript) {
          processCommand(finalTranscript);
        }
        try { recognition.stop(); } catch {
          // Ignore errors when stopping recognition
        }
      }, 3000); // 3 seconds of silence to process
    };

    const processCommand = async (transcript: string) => {
      if (!transcript.trim()) return;
      
      setClaireState('thinking');
      
      const lowerTranscript = transcript.toLowerCase();
      
      // Call-specific commands
      if (lowerTranscript.includes('end call') || lowerTranscript.includes('hang up') || lowerTranscript.includes('end the call')) {
        handleEndCall();
        setShowClaireFullScreen(false);
        setClaireState('idle');
        toast({ title: 'Call Ended', description: 'Claire ended the call' });
        return;
      }
      
      // Answer call commands
      if (showIncomingDialog && incomingCall && 
          (lowerTranscript.includes('answer') || lowerTranscript.includes('accept') || 
           lowerTranscript.includes('pick up') || lowerTranscript.includes('yes'))) {
        handleAnswerCall();
        setShowClaireFullScreen(false);
        setClaireState('idle');
        toast({ title: 'Answering Call', description: 'Claire is connecting you...' });
        return;
      }
      
      // Reject call commands
      if (showIncomingDialog && incomingCall && 
          (lowerTranscript.includes('reject') || lowerTranscript.includes('decline') || 
           lowerTranscript.includes('no') || lowerTranscript.includes('ignore'))) {
        handleRejectCall();
        setShowClaireFullScreen(false);
        setClaireState('idle');
        toast({ title: 'Call Declined', description: 'Claire declined the call' });
        return;
      }

      // Send to backend for all other processing (including "call [name]")
      try {
        const response = await api.post('/api/text-command', { text: transcript }) as { response?: string; audio?: string; pending_command?: { intent: string; slots?: Record<string, string> } };
        if (response?.response) {
          setClaireResponse(response.response);
        }

        // Handle mode switch directly from response
        if (response?.pending_command?.intent === 'switch_mode' && response.pending_command.slots?.mode_name) {
          const modeName = response.pending_command.slots.mode_name as ClaireMode;
          setMode(modeName);
          const modeInfo = MODE_INFO[modeName];
          toast({
            title: `${modeInfo?.icon || '✨'} ${modeInfo?.label || modeName} Mode`,
            description: modeInfo?.description || `Switched to ${modeName} mode`,
            duration: 3000,
          });
          // Clear pending command in both frontend and backend
          clearPendingCommand();
          api.post('/api/clear-pending-command', {}).catch(() => {});
        }

        // Play audio directly from response (no race condition)
        if (response?.audio) {
          try {
            if (audioRef.current) {
              audioRef.current.pause();
            }
            const audio = new Audio(`data:audio/mp3;base64,${response.audio}`);
            audioRef.current = audio;
            audio.onplay = () => {
              setClaireState('speaking');
              claireStateRef.current = 'speaking';
            };
            audio.onended = () => {
              // Multi-turn conversation: Auto-restart listening for follow-up
              setClaireState('listening');
              claireStateRef.current = 'listening';
              
              // Start new recognition for follow-up
              const FollowUpSpeechRecognition = window.webkitSpeechRecognition || window.SpeechRecognition;
              if (FollowUpSpeechRecognition && showClaireFullScreenRef.current) {
                const followUpRecognition = new FollowUpSpeechRecognition();
                followUpRecognition.continuous = true;
                followUpRecognition.interimResults = true;
                followUpRecognition.lang = 'en-US';
                
                let followUpSilenceTimeout: NodeJS.Timeout | null = null;
                let followUpTranscript = '';
                
                const resetFollowUpTimeout = () => {
                  if (followUpSilenceTimeout) clearTimeout(followUpSilenceTimeout);
                  followUpSilenceTimeout = setTimeout(() => {
                    // 5 seconds of silence - end conversation
                    try { followUpRecognition.stop(); } catch {
                      // Ignore errors stopping recognition
                    }
                    if (faceCloseTimeoutRef.current) clearTimeout(faceCloseTimeoutRef.current);
                    setShowClaireFullScreen(false);
                    setClaireState('idle');
                    claireStateRef.current = 'idle';
                  }, 5000); // 5 seconds to allow follow-up
                };
                
                followUpRecognition.onstart = () => {
                  resetFollowUpTimeout();
                };
                
                followUpRecognition.onresult = (event: SpeechRecognitionEvent) => {
                  for (let i = event.resultIndex; i < event.results.length; i++) {
                    const transcript = event.results[i][0].transcript;
                    if (event.results[i].isFinal) {
                      followUpTranscript += transcript + ' ';
                    }
                  }
                  
                  // Check for exit phrases
                  const exitPhrases = ['thank you', 'thanks', 'goodbye', 'bye', "that's all", 'never mind', 'cancel'];
                  const lowerTranscript = followUpTranscript.toLowerCase().trim();
                  const isExitPhrase = exitPhrases.some(phrase => lowerTranscript.includes(phrase));
                  
                  if (isExitPhrase && followUpTranscript.trim().length < 30) {
                    // Short exit phrase - close conversation
                    try { followUpRecognition.stop(); } catch {
                      // Ignore errors stopping recognition
                    }
                    if (followUpSilenceTimeout) clearTimeout(followUpSilenceTimeout);
                    setShowClaireFullScreen(false);
                    setClaireState('idle');
                    claireStateRef.current = 'idle';
                    return;
                  }
                  
                  setClaireTranscript(followUpTranscript);
                  
                  // Reset timeout on speech
                  if (followUpSilenceTimeout) clearTimeout(followUpSilenceTimeout);
                  followUpSilenceTimeout = setTimeout(() => {
                    // Process the follow-up command
                    if (followUpTranscript.trim()) {
                      try { followUpRecognition.stop(); } catch {
                        // Ignore errors stopping recognition
                      }
                      processCommand(followUpTranscript.trim());
                    }
                  }, 3000); // 3 seconds pause to complete thought
                };
                
                followUpRecognition.onerror = (event: SpeechRecognitionErrorEvent) => {
                  if (event.error !== 'no-speech' && event.error !== 'aborted') {
                    console.error('Follow-up recognition error:', event.error);
                  }
                  if (followUpSilenceTimeout) clearTimeout(followUpSilenceTimeout);
                };
                
                followUpRecognition.onend = () => {
                  if (followUpSilenceTimeout) clearTimeout(followUpSilenceTimeout);
                };
                
                try {
                  followUpRecognition.start();
                  commandRecognitionRef.current = followUpRecognition;
                } catch (e) {
                  console.error('Failed to start follow-up recognition:', e);
                  if (faceCloseTimeoutRef.current) clearTimeout(faceCloseTimeoutRef.current);
                  faceCloseTimeoutRef.current = setTimeout(() => {
                    setShowClaireFullScreen(false);
                    setClaireState('idle');
                  }, 2000);
                }
              } else {
                // No speech recognition available, close after delay
                if (faceCloseTimeoutRef.current) clearTimeout(faceCloseTimeoutRef.current);
                faceCloseTimeoutRef.current = setTimeout(() => {
                  setShowClaireFullScreen(false);
                  setClaireState('idle');
                }, 2000);
              }
            };
            audio.play().catch((err) => {
              console.error('Audio playback failed:', err);
              setClaireState('idle');
            });
          } catch (audioErr) {
            console.error('Error playing audio:', audioErr);
            setClaireState('idle');
          }
        } else {
          // No audio, just show response and keep face for 2s
          if (faceCloseTimeoutRef.current) clearTimeout(faceCloseTimeoutRef.current);
          faceCloseTimeoutRef.current = setTimeout(() => {
            setShowClaireFullScreen(false);
            setClaireState('idle');
          }, 2000);
        }
      } catch (error) {
        console.error('Command failed:', error);
        setClaireState('idle');
      }
    };

    recognition.onstart = () => {
      resetSilenceTimeout();
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interimTranscript = '';
      
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript + ' ';
        } else {
          interimTranscript += transcript;
        }
      }
      
      setClaireTranscript(finalTranscript + interimTranscript);
      resetSilenceTimeout();
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error !== 'no-speech' && event.error !== 'aborted') {
        console.error('Recognition error:', event.error);
      }
      if (silenceTimeout) clearTimeout(silenceTimeout);
    };

    recognition.onend = () => {
      if (silenceTimeout) clearTimeout(silenceTimeout);
      // Use ref to check current state (avoids closure issue)
      // Don't close if speaking or thinking - let the timeout handle it
      if (claireStateRef.current === 'speaking' || claireStateRef.current === 'thinking') {
        return; // Let audio.onended or timeout handle closing
      }
      // If idle and no face close timeout pending, close immediately
      if (!faceCloseTimeoutRef.current) {
        setShowClaireFullScreen(false);
        setClaireState('idle');
      }
    };

    commandRecognitionRef.current = recognition;

    try {
      recognition.start();
    } catch (e) {
      console.error('Failed to start recognition:', e);
      setShowClaireFullScreen(false);
      setClaireState('idle');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast, showIncomingDialog, incomingCall]);

  // Wake word detection - ALWAYS ACTIVE
  const { isListening: wakeWordListening, lastTranscript: wakeWordTranscript } = useSimpleWakeWord({
    isEnabled: micPermissionGranted === true && claireState === 'idle' && !showClaireFullScreen,
    wakeWord: 'claire',
    onWakeWordDetected: handleClaireCommand,
  });

  // Handle incoming call announcements from Claire
  useEffect(() => {
    if (pendingCommand && pendingCommand.intent === 'incoming_call' && pendingCommand.slots?.call_id) {
      const commandId = `${pendingCommand.intent}-${pendingCommand.slots.call_id}`;
      
      if (processedCommandRef.current === commandId) return;
      processedCommandRef.current = commandId;
      
      setIncomingCall({
        call_id: pendingCommand.slots.call_id,
        initiator_name: pendingCommand.slots.caller_name,
        initiator_role: pendingCommand.slots.caller_role,
        room_id: pendingCommand.slots.room_id,
        patientId: patientId
      });
      setShowIncomingDialog(true);
      
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
      
      if (processedCommandRef.current === commandId) return;
      processedCommandRef.current = commandId;
      
      const contactName = pendingCommand.slots.contact_name || 'Contact';
      setCallerName(contactName);
      
      toast({
        title: 'Calling...',
        description: `Connecting to ${contactName}`,
      });
      
      // Start call with room ID from command
      setTimeout(() => {
        setActiveRoomId(pendingCommand.slots.room_id);
        setIsCallActive(true);
        
        toast({
          title: 'Call Connected',
          description: `Connected to ${contactName}`,
        });
      }, 1500);
      
      clearPendingCommand();
    }
  }, [pendingCommand, clearPendingCommand, toast]);

  // Handle reminder alerts from backend
  useEffect(() => {
    if (pendingCommand && pendingCommand.intent === 'reminder_alert' && pendingCommand.slots?.reminder_id) {
      const commandId = `reminder-${pendingCommand.slots.reminder_id}`;
      
      if (processedCommandRef.current === commandId) return;
      processedCommandRef.current = commandId;
      
      const reminderTitle = pendingCommand.slots.title || 'Reminder';
      const reminderDescription = pendingCommand.slots.description || '';
      
      // Show toast notification
      toast({
        title: `⏰ ${reminderTitle}`,
        description: reminderDescription || 'Time for your reminder!',
        duration: 10000, // Keep visible for 10 seconds
      });
      
      // Play the audio announcement if available
      if (systemStatus.last_audio) {
        playAudio(systemStatus.last_audio);
      }
      
      clearPendingCommand();
    }
  }, [pendingCommand, clearPendingCommand, toast, playAudio, systemStatus.last_audio]);

  // Handle mode switch commands from voice
  useEffect(() => {
    if (pendingCommand && pendingCommand.intent === 'switch_mode' && pendingCommand.slots?.mode_name) {
      const commandId = `mode-${pendingCommand.slots.mode_name}-${Date.now()}`;
      
      if (processedCommandRef.current === commandId) return;
      processedCommandRef.current = commandId;
      
      const modeName = pendingCommand.slots.mode_name as ClaireMode;
      setMode(modeName);
      
      const modeInfo = MODE_INFO[modeName];
      toast({
        title: `${modeInfo?.icon || '✨'} ${modeInfo?.label || modeName} Mode`,
        description: modeInfo?.description || `Switched to ${modeName} mode`,
        duration: 3000,
      });
      
      // Play the audio response if available
      if (systemStatus.last_audio) {
        playAudio(systemStatus.last_audio);
      }
      
      // Clear pending command in both frontend and backend
      clearPendingCommand();
      api.post('/api/clear-pending-command', {}).catch(() => {});
    }
  }, [pendingCommand, clearPendingCommand, toast, playAudio, systemStatus.last_audio, setMode]);

  // Handle show_contacts command from voice
  useEffect(() => {
    if (pendingCommand && pendingCommand.intent === 'show_contacts') {
      const commandId = `show-contacts-${Date.now()}`;
      
      if (processedCommandRef.current === commandId) return;
      processedCommandRef.current = commandId;
      
      setShowContactsModal(true);
      
      // Play the audio response if available
      if (systemStatus.last_audio) {
        playAudio(systemStatus.last_audio);
      }
      
      // Clear pending command
      clearPendingCommand();
      api.post('/api/clear-pending-command', {}).catch(() => {});
    }
  }, [pendingCommand, clearPendingCommand, playAudio, systemStatus.last_audio]);

  // Handle end_call command from voice
  useEffect(() => {
    if (pendingCommand && pendingCommand.intent === 'end_call') {
      const commandId = `end-call-${Date.now()}`;
      
      if (processedCommandRef.current === commandId) return;
      processedCommandRef.current = commandId;
      
      // End the active call
      if (isCallActive) {
        setIsCallActive(false);
        setActiveRoomId(null);
        setCallerName('Family');
        
        toast({
          title: 'Call Ended',
          description: 'Video call has ended.',
        });
      }
      
      // Play the audio response if available
      if (systemStatus.last_audio) {
        playAudio(systemStatus.last_audio);
      }
      
      // Clear pending command
      clearPendingCommand();
      api.post('/api/clear-pending-command', {}).catch(() => {});
    }
  }, [pendingCommand, clearPendingCommand, toast, playAudio, systemStatus.last_audio, isCallActive]);

  // Handle call_nurse command from voice
  useEffect(() => {
    if (pendingCommand && pendingCommand.intent === 'call_nurse') {
      const commandId = `call-nurse-${Date.now()}`;
      
      if (processedCommandRef.current === commandId) return;
      processedCommandRef.current = commandId;
      
      setShowNurseModal(true);
      
      toast({
        title: 'Calling Nurse Station',
        description: 'Connecting you to the nurse station...',
      });
      
      // Play the audio response if available
      if (systemStatus.last_audio) {
        playAudio(systemStatus.last_audio);
      }
      
      // Clear pending command
      clearPendingCommand();
      api.post('/api/clear-pending-command', {}).catch(() => {});
    }
  }, [pendingCommand, clearPendingCommand, toast, playAudio, systemStatus.last_audio]);

  // Handle mute_call command from voice
  useEffect(() => {
    if (pendingCommand && pendingCommand.intent === 'mute_call') {
      const commandId = `mute-call-${Date.now()}`;
      
      if (processedCommandRef.current === commandId) return;
      processedCommandRef.current = commandId;
      
      if (isCallActive) {
        setIsCallMuted(true);
        toast({
          title: 'Microphone Muted',
          description: 'Your microphone is now muted.',
        });
      }
      
      // Play the audio response if available
      if (systemStatus.last_audio) {
        playAudio(systemStatus.last_audio);
      }
      
      clearPendingCommand();
      api.post('/api/clear-pending-command', {}).catch(() => {});
    }
  }, [pendingCommand, clearPendingCommand, toast, playAudio, systemStatus.last_audio, isCallActive]);

  // Handle unmute_call command from voice
  useEffect(() => {
    if (pendingCommand && pendingCommand.intent === 'unmute_call') {
      const commandId = `unmute-call-${Date.now()}`;
      
      if (processedCommandRef.current === commandId) return;
      processedCommandRef.current = commandId;
      
      if (isCallActive) {
        setIsCallMuted(false);
        toast({
          title: 'Microphone Unmuted',
          description: 'Your microphone is now on.',
        });
      }
      
      // Play the audio response if available
      if (systemStatus.last_audio) {
        playAudio(systemStatus.last_audio);
      }
      
      clearPendingCommand();
      api.post('/api/clear-pending-command', {}).catch(() => {});
    }
  }, [pendingCommand, clearPendingCommand, toast, playAudio, systemStatus.last_audio, isCallActive]);

  // Handle toggle_camera command from voice
  useEffect(() => {
    if (pendingCommand && pendingCommand.intent === 'toggle_camera') {
      const commandId = `toggle-camera-${Date.now()}`;
      
      if (processedCommandRef.current === commandId) return;
      processedCommandRef.current = commandId;
      
      if (isCallActive) {
        const turnCameraOn = pendingCommand.slots?.camera_on;
        const newVideoOff = turnCameraOn === false ? true : turnCameraOn === true ? false : !isCallVideoOff;
        setIsCallVideoOff(newVideoOff);
        toast({
          title: newVideoOff ? 'Camera Off' : 'Camera On',
          description: newVideoOff ? 'Your camera is now off.' : 'Your camera is now on.',
        });
      }
      
      // Play the audio response if available
      if (systemStatus.last_audio) {
        playAudio(systemStatus.last_audio);
      }
      
      clearPendingCommand();
      api.post('/api/clear-pending-command', {}).catch(() => {});
    }
  }, [pendingCommand, clearPendingCommand, toast, playAudio, systemStatus.last_audio, isCallActive, isCallVideoOff]);

  // Handle active call info from backend
  useEffect(() => {
    if (activeCallInfo && activeCallInfo.room_id && !isCallActive) {
      setCallerName(activeCallInfo.contact_name || 'Contact');
      setActiveRoomId(activeCallInfo.room_id);
      setIsCallActive(true);
    }
  }, [activeCallInfo, isCallActive]);

  // Check for pending calls periodically
  useEffect(() => {
    const checkPendingCalls = async () => {
      if (showIncomingDialog || incomingCall) return;
      
      try {
        const response = await fetch(`/api/calls/pending/${patientId}`);
        if (response.ok) {
          const data = await response.json();
          if (data.pending_calls && data.pending_calls.length > 0) {
            const call = data.pending_calls[0];
            setIncomingCall({ ...call, patientId: patientId });
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

    const interval = setInterval(checkPendingCalls, 5000);
    checkPendingCalls();

    return () => clearInterval(interval);
  }, [toast, patientId, showIncomingDialog, incomingCall]);

  const handleAnswerCall = async () => {
    if (!incomingCall) return;

    try {
      setShowIncomingDialog(false);
      setCallerName(incomingCall.initiator_name);

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
      
      // Set the room ID and activate call
      setActiveRoomId(data.room_id);
      setIsCallActive(true);

      toast({
        title: 'Call Connected',
        description: `Connected to ${incomingCall.initiator_name}`,
      });
      
      setIncomingCall(null);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to answer call',
        variant: 'destructive'
      });
      console.error('Error answering call:', error);
      setIsCallActive(false);
      setActiveRoomId(null);
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
    setIsCallActive(false);
    setActiveRoomId(null);
    setCallerName('Family');
    setIncomingCall(null);
    setShowIncomingDialog(false);
    setIsCallMuted(false);
    setIsCallVideoOff(false);
  }, []);

  // Call a contact by name
  const handleCallContact = async (contact: { name: string; phone?: string }) => {
    setShowContactsModal(false);
    try {
      const response = await api.post('/api/text-command', { text: `Call ${contact.name}` }) as { response?: string };
      if (response?.response) {
        toast({
          title: 'Calling...',
          description: response.response,
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to initiate call',
        variant: 'destructive'
      });
    }
  };

  const isInCall = isCallActive;

  // Voice listening status indicator
  const VoiceStatusBadge = () => (
    <div className={cn(
      "flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-all",
      wakeWordListening 
        ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800"
        : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400"
    )}>
      <div className="relative">
        <Mic className="w-4 h-4" />
        {wakeWordListening && (
          <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
          </span>
        )}
      </div>
      <span>{wakeWordListening ? 'Listening' : 'Voice Off'}</span>
    </div>
  );

  // Show pairing screen if device is not paired (unless disabled in env)
  if (REQUIRE_PAIRING && !isPaired && !isIdentityLoading) {
    return (
      <DevicePairingScreen 
        onPaired={(patientId, patientName) => {
          toast({
            title: `Hello, ${patientName}!`,
            description: 'CLAIRE is now connected to your profile.',
          });
          // Force reload to pick up new identity
          window.location.reload();
        }} 
      />
    );
  }

  // Show loading while checking identity
  if (REQUIRE_PAIRING && isIdentityLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-800 to-indigo-900 flex items-center justify-center">
        <div className="text-white text-xl flex items-center gap-3">
          <svg className="animate-spin h-8 w-8" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          Loading CLAIRE...
        </div>
      </div>
    );
  }

  return (
    <ResponsiveLayout
      headerTitle="Claire Healthcare"
      isFullScreen={isInCall || isImmersive}
      showHeader={!isImmersive}
      showFooter={false}
      headerExtra={!isInCall && !isImmersive ? <VoiceStatusBadge /> : undefined}
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

      {/* Contacts Modal */}
      {showContactsModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-card rounded-xl shadow-2xl max-w-md w-full max-h-[80vh] overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h2 className="text-lg font-semibold">Call a Contact</h2>
              <Button variant="ghost" size="icon" onClick={() => setShowContactsModal(false)}>
                <X className="w-5 h-5" />
              </Button>
            </div>
            <div className="p-4 space-y-2 overflow-y-auto max-h-[60vh]">
              {contacts.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No contacts available</p>
              ) : (
                contacts.map((contact, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleCallContact(contact)}
                    className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-muted transition-colors text-left"
                  >
                    <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-lg">
                      {contact.photo_url ? (
                        <img src={contact.photo_url} alt={contact.name} className="w-full h-full rounded-full object-cover" />
                      ) : (
                        '👤'
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="font-medium">{contact.name}</p>
                      <p className="text-sm text-muted-foreground capitalize">{contact.relationship || contact.type}</p>
                    </div>
                    <Phone className="w-5 h-5 text-green-500" />
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Nurse Help Modal */}
      {showNurseModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-card rounded-xl shadow-2xl max-w-lg w-full max-h-[80vh] overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h2 className="text-lg font-semibold">Nurse Help</h2>
              <Button variant="ghost" size="icon" onClick={() => setShowNurseModal(false)}>
                <X className="w-5 h-5" />
              </Button>
            </div>
            <div className="p-4 overflow-y-auto max-h-[60vh]">
              <NurseAssistant
                isEnabled={true}
                onFeatureExecuted={(featureId) => {
                  console.log(`Feature executed: ${featureId}`);
                  setShowNurseModal(false);
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className={cn(
        'flex-1 min-h-0 overflow-hidden flex flex-col',
        isInCall ? 'p-0' : (isImmersive ? 'p-0' : 'p-2 sm:p-4')
      )}>
        {isInCall ? (
          /* Full Screen Call Mode */
          <div className="w-full h-full">
            <SimpleVideoCall
              roomId={activeRoomId}
              callerName={callerName}
              onEndCall={handleEndCall}
              isActive={isCallActive}
              externalMuted={isCallMuted}
              externalVideoOff={isCallVideoOff}
              onMuteChange={setIsCallMuted}
              onVideoChange={setIsCallVideoOff}
            />
          </div>
        ) : currentMode !== 'chat' ? (
          /* Non-Chat Modes */
          <ModeRenderer
            mode={currentMode}
            claireState={claireState}
            isWakeWordActive={wakeWordListening}
            onSendMessage={sendMessage}
            onCallContact={(name) => {
              toast({
                title: 'Calling...',
                description: `Connecting to ${name}`,
              });
            }}
            onQuickAction={(action) => {
              sendMessage(action);
            }}
            onBackToDashboard={() => setMode('chat')}
            lastUserMessage={claireTranscript || messages.filter(m => m.role === 'user').pop()?.content}
            lastClaireMessage={claireResponse || messages.filter(m => m.role === 'assistant').pop()?.content}
          />
        ) : (
          /* Chat Mode - Normal Layout */
          <>
          <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-3 sm:gap-4">
            {/* Left Column - Claire Face / Status Widget */}
            <div className="lg:w-1/2 min-h-[200px] lg:min-h-0 flex-shrink-0 lg:flex-shrink">
              <div className="h-full rounded-xl border border-border bg-gradient-to-br from-primary/5 to-primary/10 shadow-sm overflow-hidden flex flex-col items-center justify-center p-6">
                <div className="text-6xl mb-4">👋</div>
                <h2 className="text-xl font-semibold text-foreground mb-2">Hi there!</h2>
                <p className="text-muted-foreground text-center mb-4">
                  Say <strong>"Claire"</strong> to talk to me, or tap a button below
                </p>
                <div className="flex items-center gap-2 text-sm">
                  {wakeWordListening ? (
                    <>
                      <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                      <span className="text-green-600 dark:text-green-400">Listening for "Claire"</span>
                    </>
                  ) : (
                    <>
                      <div className="w-2 h-2 rounded-full bg-gray-400" />
                      <span className="text-muted-foreground">Voice not active</span>
                    </>
                  )}
                </div>

                {/* Manual activation button */}
                <Button
                  variant="outline"
                  size="lg"
                  className="mt-4"
                  onClick={handleClaireCommand}
                >
                  <Mic className="w-5 h-5 mr-2" />
                  Talk to Claire
                </Button>

                {/* Upcoming Reminders Widget */}
                {upcomingReminders.length > 0 && (
                  <div className="mt-4 w-full max-w-xs">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                      <Bell className="w-4 h-4" />
                      <span>Upcoming Reminders</span>
                    </div>
                    <div className="space-y-2">
                      {upcomingReminders.map((reminder) => (
                        <div key={reminder.id} className="flex items-center gap-2 text-sm bg-white/50 dark:bg-white/5 rounded-lg px-3 py-2">
                          <Clock className="w-3 h-3 text-muted-foreground" />
                          <span className="text-foreground">{reminder.title}</span>
                          <span className="text-muted-foreground text-xs ml-auto">
                            {new Date(reminder.scheduled_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Right Column - Claire Chat */}
            <div className="lg:w-1/2 flex-1 min-h-0 flex flex-col">
              <div className="flex-1 min-h-0 rounded-xl border border-border shadow-sm overflow-hidden">
                <ClaireChatPanel
                  messages={messages}
                  isWaiting={isWaiting}
                  onSend={sendMessage}
                  onCancel={cancelMessage}
                  disabled={false}
                  isPlayingAudio={isPlayingAudio}
                  claireState={claireState}
                  lastVoiceTranscript={wakeWordTranscript}
                  isWakeWordListening={wakeWordListening}
                />
              </div>
            </div>
          </div>

          {/* Quick Actions Bar - Only visible in chat mode */}
          <div className="flex-shrink-0 mt-3 sm:mt-4">
            {/* Mode Selector */}
            <div className="flex flex-wrap gap-2 justify-center mb-3">
              {Object.entries(MODE_INFO).map(([mode, info]) => (
                <Button
                  key={mode}
                  size="sm"
                  variant={currentMode === mode ? "default" : "ghost"}
                  className={cn(
                    "h-9 gap-1.5 rounded-lg",
                    currentMode === mode && "bg-primary text-primary-foreground"
                  )}
                  onClick={() => setMode(mode as ClaireMode)}
                >
                  <span>{info.icon}</span>
                  <span className="text-xs">{info.label}</span>
                </Button>
              ))}
            </div>

            <div className="flex flex-wrap gap-2 sm:gap-3 justify-center">
              <Button
                size="lg"
                variant="outline"
                className="flex-1 sm:flex-none min-w-[120px] h-14 gap-2 text-base rounded-xl border-2 hover:bg-primary/5 hover:border-primary"
                onClick={() => setShowContactsModal(true)}
              >
                <Users className="w-5 h-5" />
                <span>Call Family</span>
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="flex-1 sm:flex-none min-w-[120px] h-14 gap-2 text-base rounded-xl border-2 border-red-200 text-red-600 hover:bg-red-50 hover:border-red-400"
                onClick={() => sendMessage("I need emergency help!")}
              >
                <AlertTriangle className="w-5 h-5" />
                <span>Emergency</span>
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="flex-1 sm:flex-none min-w-[120px] h-14 gap-2 text-base rounded-xl border-2 hover:bg-primary/5 hover:border-primary"
                onClick={() => setShowNurseModal(true)}
              >
                <HelpCircle className="w-5 h-5" />
                <span>Nurse Help</span>
              </Button>
            </div>
          </div>
          </>
        )}
      </div>

      {/* Claire Corner Icon - Visible during calls or immersive modes */}
      {(isInCall || (isImmersive && currentMode !== 'face' && currentMode !== 'companion')) && (
        <ClaireCornerIcon
          isListening={claireState === 'listening' || wakeWordListening}
          isVisible={true}
          onClick={handleClaireCommand}
        />
      )}

      {/* Claire Full Screen Modal - For voice interaction */}
      <ClaireFullScreen
        isOpen={showClaireFullScreen}
        isListening={claireState === 'listening'}
        isSpeaking={claireState === 'speaking'}
        lastTranscript={claireTranscript}
        lastResponse={claireResponse}
        onClose={() => {
          setShowClaireFullScreen(false);
          setClaireState('idle');
          try { commandRecognitionRef.current?.stop?.(); } catch {
            // Ignore errors stopping recognition
          }
        }}
      />
    </ResponsiveLayout>
  );
};

export default Index;
