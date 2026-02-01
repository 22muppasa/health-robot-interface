import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Video, Phone, PhoneOff, User, Lock, LogOut, Mic, MicOff, VideoOff, Monitor, MessageSquare, ChevronDown, ChevronUp, Clock } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

interface PatientContact {
  id: string;
  name: string;
  relationship: string;
  status: 'online' | 'offline' | 'busy';
  lastSeen?: string;
}

interface FamilyCallerDashboardProps {
  className?: string;
}

export function FamilyCallerDashboard({ className }: FamilyCallerDashboardProps) {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [familyMemberName, setFamilyMemberName] = useState('');
  const [loginForm, setLoginForm] = useState({ name: '', relationship: '' });
  const [patients, setPatients] = useState<PatientContact[]>([]);
  const [callingPatient, setCallingPatient] = useState<PatientContact | null>(null);
  const [callState, setCallState] = useState<'idle' | 'calling' | 'connecting' | 'in_call'>('idle');
  const [callDuration, setCallDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [participantId, setParticipantId] = useState<string | null>(null);
  const [showChatHistory, setShowChatHistory] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const signalingWebSocketRef = useRef<WebSocket | null>(null);
  const remoteParticipantIdRef = useRef<string | null>(null);
  const makingOfferRef = useRef(false);
  const otherParticipantReadyRef = useRef(false);
  const sentOfferRef = useRef(false);
  
  const { toast } = useToast();

  // Call duration timer
  useEffect(() => {
    if (callState !== 'in_call') return;
    const interval = setInterval(() => {
      setCallDuration((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [callState]);

  // Load patients on login
  useEffect(() => {
    if (isLoggedIn) {
      loadPatients();
    }
  }, [isLoggedIn]);

  const loadPatients = async () => {
    try {
      // Load patient profile from backend
      const response = await fetch('/api/user-profile');
      const data = await response.json();
      
      // Create patient contact from profile
      const patientName = data.profile?.name || 'Patient';
      setPatients([
        {
          id: 'patient-main',
          name: patientName,
          relationship: 'Your Patient',
          status: 'online',
        }
      ]);
    } catch (error) {
      // Fallback patient
      setPatients([
        {
          id: 'patient-main',
          name: 'Patient',
          relationship: 'Your Patient',
          status: 'online',
        }
      ]);
    }
  };

  const loadChatHistory = async (patientId: string) => {
    setLoadingHistory(true);
    try {
      const response = await fetch(`/api/chat-history/${patientId}?limit=50`);
      if (response.ok) {
        const data = await response.json();
        setChatMessages(data.messages || []);
      }
    } catch (error) {
      console.error('Failed to load chat history:', error);
      toast({
        title: 'Error',
        description: 'Failed to load conversation history',
        variant: 'destructive',
      });
    } finally {
      setLoadingHistory(false);
    }
  };

  const toggleChatHistory = (patientId: string) => {
    if (showChatHistory) {
      setShowChatHistory(false);
      setChatMessages([]);
    } else {
      setShowChatHistory(true);
      loadChatHistory(patientId);
    }
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (diffDays === 1) {
      return 'Yesterday ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (diffDays < 7) {
      return date.toLocaleDateString([], { weekday: 'short' }) + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginForm.name.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter your name',
        variant: 'destructive',
      });
      return;
    }

    setFamilyMemberName(loginForm.name);
    setIsLoggedIn(true);
    
    toast({
      title: 'Welcome!',
      description: `Logged in as ${loginForm.name}`,
    });
  };

  const handleLogout = () => {
    if (callState !== 'idle') {
      endCall();
    }
    setIsLoggedIn(false);
    setFamilyMemberName('');
    setLoginForm({ name: '', relationship: '' });
    setPatients([]);
  };

  const initiateCall = async (patient: PatientContact) => {
    setCallingPatient(patient);
    setCallState('calling');
    
    try {
      // Initiate call via backend - this will trigger Claire to announce
      const response = await fetch('/api/calls/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          initiator_id: `family-${familyMemberName.toLowerCase().replace(/\s+/g, '-')}`,
          initiator_name: familyMemberName,
          initiator_role: loginForm.relationship || 'Family Member',
          patient_id: patient.id,
          call_type: 'video',
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to initiate call');
      }

      const callData = await response.json();
      // IMPORTANT: Use backend's room_id directly, pass it to pollCallStatus
      // to avoid React state timing issues
      const backendRoomId = callData.room_id;
      setRoomId(backendRoomId);

      toast({
        title: 'Calling...',
        description: `Calling ${patient.name}. Claire will announce your call.`,
      });

      // Wait for patient to answer (poll for call status)
      // Pass room_id directly to avoid state timing issues
      pollCallStatus(callData.call_id, backendRoomId);

    } catch (error) {
      console.error('Failed to initiate call:', error);
      toast({
        title: 'Call Failed',
        description: 'Could not reach the patient. Please try again.',
        variant: 'destructive',
      });
      setCallState('idle');
      setCallingPatient(null);
    }
  };

  const pollCallStatus = async (callId: string, callRoomId: string) => {
    let attempts = 0;
    const maxAttempts = 60; // 60 seconds timeout

    const checkStatus = async () => {
      try {
        const response = await fetch(`/api/calls/${callId}/status`);
        if (!response.ok) {
          if (response.status === 404) {
            // Call not found, might be answered or rejected
            // Try to join the room using the passed roomId
            await joinVideoRoom(callRoomId);
            return;
          }
          throw new Error('Failed to check call status');
        }

        const data = await response.json();
        
        if (data.answered) {
          // Patient answered! Join the call using the correct room ID
          await joinVideoRoom(callRoomId);
          return;
        } else if (data.rejected) {
          toast({
            title: 'Call Declined',
            description: `${callingPatient?.name} declined the call.`,
          });
          setCallState('idle');
          setCallingPatient(null);
          return;
        }

        // Still ringing
        attempts++;
        if (attempts < maxAttempts) {
          setTimeout(checkStatus, 1000);
        } else {
          toast({
            title: 'No Answer',
            description: `${callingPatient?.name} did not answer.`,
          });
          setCallState('idle');
          setCallingPatient(null);
        }
      } catch (error) {
        console.error('Error checking call status:', error);
        // Try to join anyway after some attempts
        if (attempts > 5) {
          await joinVideoRoom(callRoomId);
        } else {
          attempts++;
          setTimeout(checkStatus, 1000);
        }
      }
    };

    checkStatus();
  };

  const joinVideoRoom = async (callRoomId: string) => {
    setCallState('connecting');
    
    try {
      // Join video room using the passed room ID (avoid state timing issues)
      const response = await fetch('/api/video/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room_id: callRoomId }),
      });

      if (!response.ok) {
        throw new Error('Failed to join video room');
      }

      const data = await response.json();
      setParticipantId(data.participant_id);
      console.log('Family: Joined room', callRoomId, 'as participant', data.participant_id);

      // Get local media first
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });

      localStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      // Create peer connection
      const pc = createPeerConnection();
      peerConnectionRef.current = pc;

      // Add tracks
      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream);
      });

      // Setup signaling WebSocket - pass PC so we can send offer immediately
      setupSignaling(data.participant_id, pc);

      setCallState('connecting');
      setCallDuration(0);

      toast({
        title: 'Calling...',
        description: `Connecting to ${callingPatient?.name}`,
      });

    } catch (error) {
      console.error('Failed to join video room:', error);
      toast({
        title: 'Connection Failed',
        description: 'Could not establish video connection.',
        variant: 'destructive',
      });
      setCallState('idle');
      setCallingPatient(null);
    }
  };

  const createPeerConnection = () => {
    const pc = new RTCPeerConnection({
      iceServers: [
        // STUN servers for NAT traversal
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        // Free TURN servers (for production, use your own TURN server)
        {
          urls: 'turn:a.relay.metered.ca:80',
          username: 'e8e8e8e8e8e8e8e8e8e8e8e8',
          credential: 'e8e8e8e8e8e8e8e8e8e8e8e8',
        },
        {
          urls: 'turn:a.relay.metered.ca:80?transport=tcp',
          username: 'e8e8e8e8e8e8e8e8e8e8e8e8',
          credential: 'e8e8e8e8e8e8e8e8e8e8e8e8',
        },
        {
          urls: 'turn:a.relay.metered.ca:443',
          username: 'e8e8e8e8e8e8e8e8e8e8e8e8',
          credential: 'e8e8e8e8e8e8e8e8e8e8e8e8',
        },
        {
          urls: 'turn:a.relay.metered.ca:443?transport=tcp',
          username: 'e8e8e8e8e8e8e8e8e8e8e8e8',
          credential: 'e8e8e8e8e8e8e8e8e8e8e8e8',
        },
      ],
      iceCandidatePoolSize: 10,
    });

    pc.onicecandidate = (event) => {
      if (event.candidate && signalingWebSocketRef.current?.readyState === WebSocket.OPEN) {
        signalingWebSocketRef.current.send(
          JSON.stringify({
            type: 'ice_candidate',
            candidate: event.candidate,
          })
        );
      }
    };

    pc.ontrack = (event) => {
      console.log('Family: Received remote track:', event.track.kind, 'streams:', event.streams.length);
      if (remoteVideoRef.current && event.streams[0]) {
        console.log('Family: Setting remote video source, tracks:', event.streams[0].getTracks().map(t => t.kind));
        remoteVideoRef.current.srcObject = event.streams[0];
      }
    };

    pc.onconnectionstatechange = () => {
      console.log('Family: Connection state:', pc.connectionState);
      if (pc.connectionState === 'connected') {
        setCallState('in_call');
        toast({
          title: 'Connected!',
          description: 'Call is now active',
        });
      } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        endCall();
      }
    };

    return pc;
  };

  const setupSignaling = (pid: string, pc: RTCPeerConnection) => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    // Use same host/port as page so Vite proxy can route to backend
    const wsUrl = `${protocol}//${window.location.host}/ws/video/${pid}`;
    console.log('Family: Connecting to signaling WebSocket:', wsUrl);

    const ws = new WebSocket(wsUrl);
    
    // Helper to send offer when ready
    const sendOffer = async () => {
      if (sentOfferRef.current) return;
      sentOfferRef.current = true;
      
      try {
        makingOfferRef.current = true;
        const offer = await pc.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: true,
        });
        await pc.setLocalDescription(offer);
        
        ws.send(JSON.stringify({
          type: 'sdp_offer',
          sdp: offer.sdp,
        }));
        console.log('Family: Sent SDP offer');
        makingOfferRef.current = false;
      } catch (error) {
        console.error('Failed to create/send offer:', error);
        makingOfferRef.current = false;
        sentOfferRef.current = false;
      }
    };

    ws.onopen = async () => {
      console.log('Family: Signaling WebSocket connected, sending ready signal');
      
      // Reset state
      otherParticipantReadyRef.current = false;
      sentOfferRef.current = false;
      
      // Send ready signal first - wait for patient to be ready
      ws.send(JSON.stringify({ type: 'participant_ready' }));
      console.log('Family: Sent participant_ready, waiting for patient...');
      
      // If patient is already ready (they connected first), we'll get their ready signal
      // Otherwise wait up to 5 seconds then send offer anyway
      setTimeout(() => {
        if (!sentOfferRef.current && ws.readyState === WebSocket.OPEN) {
          console.log('Family: Timeout waiting for patient ready, sending offer anyway');
          sendOffer();
        }
      }, 5000);
    };

    ws.onmessage = async (event) => {
      try {
        const message = JSON.parse(event.data);
        await handleSignalingMessage(message);
      } catch (error) {
        console.error('Signaling error:', error);
      }
    };

    ws.onerror = (error) => {
      console.error('Signaling WebSocket error:', error);
    };

    signalingWebSocketRef.current = ws;
  };

  const handleSignalingMessage = async (message: { type: string; from_participant_id?: string; sdp?: string; candidate?: RTCIceCandidateInit }) => {
    const pc = peerConnectionRef.current;
    if (!pc) return;

    console.log('Family received signaling:', message.type);

    if (message.type === 'participant_ready') {
      // Patient is ready - send our offer now
      console.log('Family: Patient is ready, sending offer');
      otherParticipantReadyRef.current = true;
      remoteParticipantIdRef.current = message.from_participant_id;
      
      // Send offer if we haven't already
      if (!sentOfferRef.current && signalingWebSocketRef.current?.readyState === WebSocket.OPEN) {
        sentOfferRef.current = true;
        try {
          makingOfferRef.current = true;
          const offer = await pc.createOffer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: true,
          });
          await pc.setLocalDescription(offer);
          
          signalingWebSocketRef.current.send(JSON.stringify({
            type: 'sdp_offer',
            sdp: offer.sdp,
          }));
          console.log('Family: Sent SDP offer to patient');
          makingOfferRef.current = false;
        } catch (error) {
          console.error('Failed to create/send offer:', error);
          makingOfferRef.current = false;
          sentOfferRef.current = false;
        }
      }
    } else if (message.type === 'sdp_offer') {
      // Store remote participant ID for responses
      if (message.from_participant_id) {
        remoteParticipantIdRef.current = message.from_participant_id;
      }
      
      // Handle offer collision (polite peer pattern - family is impolite, ignores if making offer)
      const offerCollision = makingOfferRef.current || pc.signalingState !== 'stable';
      if (offerCollision) {
        console.log('Family: Ignoring offer collision (we are impolite peer)');
        return;
      }
      
      await pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: message.sdp }));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      
      if (signalingWebSocketRef.current?.readyState === WebSocket.OPEN) {
        signalingWebSocketRef.current.send(
          JSON.stringify({
            type: 'sdp_answer',
            sdp: answer.sdp,
            to_participant_id: message.from_participant_id,
          })
        );
        console.log('Family: Sent SDP answer to', message.from_participant_id);
      }
    } else if (message.type === 'sdp_answer') {
      // Store remote participant ID
      if (message.from_participant_id) {
        remoteParticipantIdRef.current = message.from_participant_id;
      }
      await pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: message.sdp }));
      console.log('Family: Applied SDP answer');
    } else if (message.type === 'ice_candidate' && message.candidate) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(message.candidate));
      } catch (e) {
        console.error('Failed to add ICE candidate:', e);
      }
    } else if (message.type === 'participant_left') {
      // Remote participant ended call - clean up our side
      console.log('Family: Remote participant left, ending call');
      endCall();
    }
  };

  const endCall = async () => {
    // Stop local stream
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }

    // Close peer connection
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }

    // Close signaling
    if (signalingWebSocketRef.current) {
      signalingWebSocketRef.current.close();
      signalingWebSocketRef.current = null;
    }

    // Notify backend
    if (participantId) {
      try {
        await fetch('/api/video/end', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ participant_id: participantId }),
        });
      } catch (error) {
        console.error('Error ending call:', error);
      }
    }

    toast({
      title: 'Call Ended',
      description: `Call duration: ${Math.floor(callDuration / 60)}m ${callDuration % 60}s`,
    });

    // Reset refs
    remoteParticipantIdRef.current = null;
    otherParticipantReadyRef.current = false;
    sentOfferRef.current = false;

    setCallState('idle');
    setCallingPatient(null);
    setCallDuration(0);
    setRoomId(null);
    setParticipantId(null);
    setIsMuted(false);
    setIsVideoOff(false);
  };

  const toggleMute = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((track) => {
        track.enabled = isMuted;
      });
      setIsMuted(!isMuted);
    }
  };

  const toggleVideo = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach((track) => {
        track.enabled = isVideoOff;
      });
      setIsVideoOff(!isVideoOff);
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Login screen
  if (!isLoggedIn) {
    return (
      <div className={cn('min-h-screen w-full bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4', className)}>
        <Card className="w-full max-w-md shadow-xl">
          <CardHeader className="text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-primary/10 flex items-center justify-center">
              <User className="w-8 h-8 text-primary" />
            </div>
            <CardTitle className="text-2xl">Family Portal</CardTitle>
            <CardDescription>Sign in to call your loved one</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Your Name</label>
                <Input
                  placeholder="Enter your name (e.g., Mom, Dad, Sarah)"
                  value={loginForm.name}
                  onChange={(e) => setLoginForm((prev) => ({ ...prev, name: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Relationship (optional)</label>
                <Input
                  placeholder="e.g., Mother, Son, Friend"
                  value={loginForm.relationship}
                  onChange={(e) => setLoginForm((prev) => ({ ...prev, relationship: e.target.value }))}
                />
              </div>
              <Button type="submit" className="w-full" size="lg">
                <Phone className="w-4 h-4 mr-2" />
                Continue to Call
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  // In-call view (full screen)
  if (callState === 'in_call' || callState === 'connecting') {
    return (
      <div className={cn('fixed inset-0 bg-black z-50 flex flex-col', className)}>
        {/* Video area */}
        <div className="flex-1 relative">
          {/* Remote video (full screen) - always rendered */}
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="absolute inset-0 w-full h-full object-cover"
          />

          {/* Connecting overlay when no remote video yet */}
          {callState === 'connecting' && (
            <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
              <div className="text-center">
                <div className="w-16 h-16 border-4 border-white/30 border-t-white rounded-full animate-spin mx-auto mb-4" />
                <p className="text-white text-xl">Connecting to {callingPatient?.name}...</p>
              </div>
            </div>
          )}

          {/* Local video (PiP) - always rendered, visibility controlled */}
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className={cn(
              "absolute bottom-28 right-4 w-36 h-48 rounded-xl border-2 border-white shadow-2xl object-cover z-20 transition-opacity duration-300",
              isVideoOff ? "opacity-0 pointer-events-none" : "opacity-100"
            )}
          />

          {/* Call info overlay */}
          <div className="absolute top-4 left-4 bg-black/60 backdrop-blur rounded-lg px-4 py-2">
            <p className="text-white font-semibold">{callingPatient?.name}</p>
            <p className="text-white/70 text-sm">
              {callState === 'connecting' ? 'Connecting...' : formatDuration(callDuration)}
            </p>
          </div>

          {/* Status indicators */}
          <div className="absolute top-4 right-4 flex gap-2">
            {isMuted && (
              <div className="bg-red-500/90 text-white px-2 py-1 rounded text-xs flex items-center gap-1">
                <MicOff className="w-3 h-3" />
                Muted
              </div>
            )}
            {isVideoOff && (
              <div className="bg-red-500/90 text-white px-2 py-1 rounded text-xs flex items-center gap-1">
                <VideoOff className="w-3 h-3" />
                Camera Off
              </div>
            )}
          </div>
        </div>

        {/* Call controls */}
        <div className="flex-shrink-0 bg-black/80 backdrop-blur border-t border-white/10 px-4 py-6">
          <div className="flex items-center justify-center gap-4">
            <Button
              variant={isMuted ? 'destructive' : 'secondary'}
              size="lg"
              onClick={toggleMute}
              className="rounded-full w-14 h-14"
            >
              {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
            </Button>

            <Button
              variant={isVideoOff ? 'destructive' : 'secondary'}
              size="lg"
              onClick={toggleVideo}
              className="rounded-full w-14 h-14"
            >
              {isVideoOff ? <VideoOff className="w-6 h-6" /> : <Video className="w-6 h-6" />}
            </Button>

            <Button
              variant="destructive"
              size="lg"
              onClick={endCall}
              className="rounded-full w-16 h-16"
            >
              <PhoneOff className="w-7 h-7" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Calling screen
  if (callState === 'calling') {
    return (
      <div className={cn('fixed inset-0 bg-gradient-to-b from-blue-600 to-blue-800 z-50 flex flex-col items-center justify-center', className)}>
        <div className="text-center">
          <div className="w-32 h-32 mx-auto mb-6 rounded-full bg-white/20 flex items-center justify-center animate-pulse">
            <User className="w-16 h-16 text-white" />
          </div>
          <p className="text-white text-2xl font-semibold mb-2">Calling {callingPatient?.name}...</p>
          <p className="text-white/70 mb-8">Claire is announcing your call</p>
          
          <Button
            variant="destructive"
            size="lg"
            onClick={() => {
              setCallState('idle');
              setCallingPatient(null);
            }}
            className="rounded-full px-8"
          >
            <PhoneOff className="w-5 h-5 mr-2" />
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  // Main dashboard (patient list)
  return (
    <div className={cn('min-h-screen w-full bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 p-4 md:p-6', className)}>
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">
              Family Portal
            </h1>
            <p className="text-muted-foreground">
              Welcome, {familyMemberName}
            </p>
          </div>
          <Button variant="outline" onClick={handleLogout}>
            <LogOut className="w-4 h-4 mr-2" />
            Logout
          </Button>
        </div>

        {/* Patient Cards */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Your Patient</h2>
          
          {patients.map((patient) => (
            <Card key={patient.id} className="overflow-hidden">
              <CardContent className="p-0">
                <div className="flex items-center gap-4 p-4">
                  {/* Avatar */}
                  <div className={cn(
                    'w-16 h-16 rounded-full flex items-center justify-center flex-shrink-0',
                    patient.status === 'online' ? 'bg-green-100 dark:bg-green-900' : 'bg-gray-100 dark:bg-gray-800'
                  )}>
                    <User className={cn(
                      'w-8 h-8',
                      patient.status === 'online' ? 'text-green-600 dark:text-green-400' : 'text-gray-400'
                    )} />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-lg truncate">{patient.name}</p>
                    <p className="text-sm text-muted-foreground">{patient.relationship}</p>
                    <div className="flex items-center gap-1 mt-1">
                      <div className={cn(
                        'w-2 h-2 rounded-full',
                        patient.status === 'online' ? 'bg-green-500' : 'bg-gray-400'
                      )} />
                      <span className="text-xs text-muted-foreground capitalize">{patient.status}</span>
                    </div>
                  </div>

                  {/* Call buttons */}
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="lg"
                      onClick={() => toggleChatHistory(patient.id)}
                      className="gap-2"
                    >
                      <MessageSquare className="w-5 h-5" />
                      <span className="hidden sm:inline">History</span>
                      {showChatHistory ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </Button>
                    <Button
                      size="lg"
                      onClick={() => initiateCall(patient)}
                      disabled={patient.status !== 'online'}
                      className="gap-2"
                    >
                      <Video className="w-5 h-5" />
                      <span className="hidden sm:inline">Video Call</span>
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          
          {/* Chat History Panel */}
          {showChatHistory && (
            <Card className="overflow-hidden">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <MessageSquare className="w-5 h-5" />
                  Conversation History with Claire
                </CardTitle>
                <CardDescription>
                  Recent conversations between your patient and Claire
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loadingHistory ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
                  </div>
                ) : chatMessages.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>No conversation history yet</p>
                    <p className="text-sm">Messages will appear here when your patient talks with Claire</p>
                  </div>
                ) : (
                  <div className="space-y-4 max-h-[400px] overflow-y-auto">
                    {chatMessages.map((message) => (
                      <div
                        key={message.id}
                        className={cn(
                          'flex flex-col gap-1 p-3 rounded-lg',
                          message.role === 'user'
                            ? 'bg-blue-50 dark:bg-blue-950 ml-8'
                            : 'bg-pink-50 dark:bg-pink-950 mr-8'
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className={cn(
                            'text-xs font-medium',
                            message.role === 'user'
                              ? 'text-blue-600 dark:text-blue-400'
                              : 'text-pink-600 dark:text-pink-400'
                          )}>
                            {message.role === 'user' ? 'Patient' : 'Claire'}
                          </span>
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {formatTimestamp(message.timestamp)}
                          </span>
                        </div>
                        <p className="text-sm">{message.content}</p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Info box */}
        <Card className="bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
          <CardContent className="p-4">
            <p className="text-sm text-blue-800 dark:text-blue-200">
              <strong>Tip:</strong> When you call, Claire will announce your call to the patient. 
              They can answer by saying "Claire, answer the call" or by tapping on the screen.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
