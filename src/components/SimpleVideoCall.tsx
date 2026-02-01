import { useState, useRef, useEffect, useCallback } from 'react';
import { Video, Phone, PhoneOff, Mic, MicOff, VideoOff, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/use-toast';

interface SimpleVideoCallProps {
  roomId: string | null;
  callerName?: string;
  onEndCall?: () => void;
  isActive: boolean; // Whether call is active
  externalMuted?: boolean; // External control of mute state
  externalVideoOff?: boolean; // External control of video state
  onMuteChange?: (isMuted: boolean) => void;
  onVideoChange?: (isVideoOff: boolean) => void;
}

export function SimpleVideoCall({ 
  roomId, 
  callerName = 'Family', 
  onEndCall, 
  isActive,
  externalMuted,
  externalVideoOff,
  onMuteChange,
  onVideoChange,
}: SimpleVideoCallProps) {
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [callDuration, setCallDuration] = useState(0);
  const [hasRemoteStream, setHasRemoteStream] = useState(false);
  const { toast } = useToast();

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const localVideoPipRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const participantIdRef = useRef<string | null>(null);
  const joinedRef = useRef(false);
  const callStartRef = useRef<number | null>(null);
  const lastRoomIdRef = useRef<string | null>(null);
  const receivedOfferRef = useRef(false);
  const offerTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const connectionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const endCallRef = useRef<() => void>(() => {});

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Call duration timer
  useEffect(() => {
    if (!isConnected) {
      setCallDuration(0);
      callStartRef.current = null;
      return;
    }
    
    callStartRef.current = Date.now();
    const interval = setInterval(() => {
      if (callStartRef.current) {
        setCallDuration(Math.floor((Date.now() - callStartRef.current) / 1000));
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [isConnected]);

  // Sync external mute state
  useEffect(() => {
    if (externalMuted !== undefined && externalMuted !== isMuted) {
      setIsMuted(externalMuted);
      if (localStreamRef.current) {
        localStreamRef.current.getAudioTracks().forEach(track => {
          track.enabled = !externalMuted;
        });
      }
    }
  }, [externalMuted, isMuted]);

  // Sync external video state
  useEffect(() => {
    if (externalVideoOff !== undefined && externalVideoOff !== isVideoOff) {
      setIsVideoOff(externalVideoOff);
      if (localStreamRef.current) {
        localStreamRef.current.getVideoTracks().forEach(track => {
          track.enabled = !externalVideoOff;
        });
      }
    }
  }, [externalVideoOff, isVideoOff]);

  // Get local camera stream
  const getLocalStream = useCallback(async () => {
    if (localStreamRef.current) {
      // Re-attach to video elements if stream exists
      if (localVideoRef.current && !localVideoRef.current.srcObject) {
        localVideoRef.current.srcObject = localStreamRef.current;
      }
      return localStreamRef.current;
    }
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
        audio: true,
      });
      localStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      if (localVideoPipRef.current) {
        localVideoPipRef.current.srcObject = stream;
      }
      return stream;
    } catch (err) {
      console.error('Camera error:', err);
      setError('Camera access denied');
      throw err;
    }
  }, []);

  // Create peer connection
  const createPeerConnection = useCallback(() => {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        {
          urls: 'turn:a.relay.metered.ca:80',
          username: 'e8e8e8e8e8e8e8e8e8e8e8e8',
          credential: 'e8e8e8e8e8e8e8e8e8e8e8e8',
        },
        {
          urls: 'turn:a.relay.metered.ca:443?transport=tcp',
          username: 'e8e8e8e8e8e8e8e8e8e8e8e8',
          credential: 'e8e8e8e8e8e8e8e8e8e8e8e8',
        },
      ],
    });

    pc.onicecandidate = (event) => {
      if (event.candidate && wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'ice_candidate',
          candidate: event.candidate,
        }));
      }
    };

    pc.ontrack = (event) => {
      console.log('Patient: Received remote track:', event.track.kind, 'streams:', event.streams.length);
      if (remoteVideoRef.current && event.streams[0]) {
        console.log('Patient: Setting remote video source, tracks:', event.streams[0].getTracks().map(t => t.kind));
        remoteVideoRef.current.srcObject = event.streams[0];
        setHasRemoteStream(true);
      }
    };

    pc.onconnectionstatechange = () => {
      console.log('Connection state:', pc.connectionState);
      if (pc.connectionState === 'connected') {
        // Clear connection timeout since we're now connected
        if (connectionTimeoutRef.current) {
          clearTimeout(connectionTimeoutRef.current);
          connectionTimeoutRef.current = null;
        }
        setIsConnected(true);
        setIsConnecting(false);
        setError(null);
      } else if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        setError('Connection lost');
      }
    };

    return pc;
  }, []);

  // Handle signaling messages
  const handleSignalingMessage = useCallback(async (message: { type: string; from_participant_id?: string; sdp?: string; candidate?: RTCIceCandidateInit }) => {
    const pc = peerConnectionRef.current;
    if (!pc) return;

    console.log('Patient received signaling:', message.type, 'from:', message.from_participant_id);

    if (message.type === 'participant_ready') {
      // Family is ready - they will send the offer, cancel our timeout
      console.log('Patient: Family is ready and will send offer');
      if (offerTimeoutRef.current) {
        clearTimeout(offerTimeoutRef.current);
        offerTimeoutRef.current = null;
      }
    } else if (message.type === 'sdp_offer') {
      // We received an offer - mark it and clear timeout
      receivedOfferRef.current = true;
      if (offerTimeoutRef.current) {
        clearTimeout(offerTimeoutRef.current);
        offerTimeoutRef.current = null;
      }
      
      // Handle collision - patient is "polite" peer, rollback our offer if we made one
      if (pc.signalingState !== 'stable') {
        console.log('Patient: Offer collision detected, rolling back (we are polite peer)');
        try {
          await pc.setLocalDescription({ type: 'rollback' });
        } catch (e) {
          console.log('Patient: Rollback not needed or failed:', e);
        }
      }
      
      // Create answer
      try {
        await pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: message.sdp }));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({
            type: 'sdp_answer',
            sdp: answer.sdp,
            to_participant_id: message.from_participant_id,
          }));
          console.log('Patient: Sent SDP answer to', message.from_participant_id);
        }
      } catch (e) {
        console.error('Patient: Failed to handle SDP offer:', e);
      }
    } else if (message.type === 'sdp_answer') {
      // We received an answer to our offer
      try {
        await pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: message.sdp }));
        console.log('Patient: Applied SDP answer');
      } catch (e) {
        console.error('Patient: Failed to apply SDP answer:', e);
      }
    } else if (message.type === 'ice_candidate' && message.candidate) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(message.candidate));
      } catch (e) {
        console.error('Failed to add ICE candidate:', e);
      }
    } else if (message.type === 'participant_left') {
      // Remote participant ended call - clean up our side
      console.log('Patient: Remote participant left, ending call');
      // Use the ref to get latest endCall function
      endCallRef.current();
    }
  }, []);

  // Join call
  const joinCall = useCallback(async () => {
    if (!roomId || joinedRef.current || isConnecting) return;
    
    joinedRef.current = true;
    setIsConnecting(true);
    setError(null);
    console.log('Joining room:', roomId);

    try {
      // Get local camera
      const stream = await getLocalStream();

      // Join room via backend
      const response = await fetch('/api/video/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room_id: roomId }),
      });

      if (!response.ok) throw new Error('Failed to join room');

      const data = await response.json();
      participantIdRef.current = data.participant_id;
      console.log('Joined as:', data.participant_id);

      // Create peer connection
      const pc = createPeerConnection();
      peerConnectionRef.current = pc;

      // Add local tracks
      stream.getTracks().forEach(track => {
        pc.addTrack(track, stream);
      });

      // Setup WebSocket signaling - use same host/port as the page (Vite will proxy to backend)
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws/video/${data.participant_id}`;
      console.log('Patient: Connecting to signaling WebSocket:', wsUrl);
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('Patient: Signaling WebSocket connected, sending ready signal');
        setIsConnecting(false); // WebSocket connected, now waiting for WebRTC
        
        // Reset offer tracking
        receivedOfferRef.current = false;
        
        // Set connection timeout - if not connected within 60 seconds, end call
        if (connectionTimeoutRef.current) {
          clearTimeout(connectionTimeoutRef.current);
        }
        connectionTimeoutRef.current = setTimeout(() => {
          if (!peerConnectionRef.current || peerConnectionRef.current.connectionState !== 'connected') {
            console.log('Patient: Connection timeout - call taking too long');
            setError('Connection timeout. Please try again.');
            toast({
              title: 'Connection Timeout',
              description: 'Could not establish connection. Please try calling again.',
              variant: 'destructive',
            });
            endCallRef.current();
          }
        }, 60000); // 60 second timeout
        
        // Send ready signal to trigger re-broadcast of any existing offers
        // This solves the race condition where family sends offer before patient connects
        ws.send(JSON.stringify({ type: 'participant_ready' }));
        console.log('Patient: Sent participant_ready signal');
        
        // If no offer received within 3 seconds, patient sends an offer
        // This handles the case where patient connects before family
        offerTimeoutRef.current = setTimeout(async () => {
          if (!receivedOfferRef.current && peerConnectionRef.current && ws.readyState === WebSocket.OPEN) {
            console.log('Patient: No offer received, creating our own offer');
            try {
              const offer = await peerConnectionRef.current.createOffer({
                offerToReceiveAudio: true,
                offerToReceiveVideo: true,
              });
              await peerConnectionRef.current.setLocalDescription(offer);
              ws.send(JSON.stringify({
                type: 'sdp_offer',
                sdp: offer.sdp,
              }));
              console.log('Patient: Sent SDP offer');
            } catch (e) {
              console.error('Patient: Failed to create offer:', e);
            }
          }
        }, 3000);
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          handleSignalingMessage(message);
        } catch (e) {
          console.error('Failed to parse message:', e);
        }
      };

      ws.onerror = (e) => console.error('WebSocket error:', e);
      ws.onclose = () => console.log('WebSocket closed');

    } catch (err) {
      console.error('Join failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to join');
      setIsConnecting(false);
      joinedRef.current = false;
    }
  }, [roomId, isConnecting, getLocalStream, createPeerConnection, handleSignalingMessage]);

  // End call
  const endCall = useCallback(() => {
    console.log('Ending call');
    
    // Clear offer timeout
    if (offerTimeoutRef.current) {
      clearTimeout(offerTimeoutRef.current);
      offerTimeoutRef.current = null;
    }
    
    // Clear connection timeout
    if (connectionTimeoutRef.current) {
      clearTimeout(connectionTimeoutRef.current);
      connectionTimeoutRef.current = null;
    }
    
    receivedOfferRef.current = false;
    
    // Stop local stream
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }

    // Close peer connection
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }

    // Close WebSocket
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    // Notify backend
    if (participantIdRef.current) {
      fetch('/api/video/end', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ participant_id: participantIdRef.current }),
      }).catch(() => {});
    }

    // Reset state
    setIsConnected(false);
    setIsConnecting(false);
    setHasRemoteStream(false);
    joinedRef.current = false;
    participantIdRef.current = null;

    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;

    onEndCall?.();
  }, [onEndCall]);

  // Keep endCallRef updated for use in callbacks
  useEffect(() => {
    endCallRef.current = endCall;
  }, [endCall]);

  // Auto-join when isActive and roomId are set
  useEffect(() => {
    // Reset joinedRef if roomId changes (new call)
    if (roomId !== lastRoomIdRef.current) {
      lastRoomIdRef.current = roomId;
      if (!isActive) {
        joinedRef.current = false;
      }
    }
    
    if (isActive && roomId && !joinedRef.current && !isConnecting && !isConnected) {
      joinCall();
    }
  }, [isActive, roomId, joinCall, isConnecting, isConnected]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
      }
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  // Toggle mute
  const toggleMute = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(track => {
        track.enabled = isMuted;
      });
      const newMuted = !isMuted;
      setIsMuted(newMuted);
      onMuteChange?.(newMuted);
    }
  };

  // Toggle video
  const toggleVideo = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach(track => {
        track.enabled = isVideoOff;
      });
      const newVideoOff = !isVideoOff;
      setIsVideoOff(newVideoOff);
      onVideoChange?.(newVideoOff);
    }
  };

  // Start local preview on mount
  useEffect(() => {
    getLocalStream().catch(() => {});
  }, [getLocalStream]);

  // Ensure local stream is attached to PIP when connected
  useEffect(() => {
    if (isConnected && localStreamRef.current && localVideoPipRef.current) {
      if (!localVideoPipRef.current.srcObject) {
        console.log('Attaching local stream to PIP video element');
        localVideoPipRef.current.srcObject = localStreamRef.current;
      }
    }
  }, [isConnected]);

  // Debug: Log remote stream info when it changes
  useEffect(() => {
    if (hasRemoteStream && remoteVideoRef.current?.srcObject) {
      const stream = remoteVideoRef.current.srcObject as MediaStream;
      console.log('Remote stream tracks:', stream.getTracks().map(t => `${t.kind}: ${t.enabled}`));
    }
  }, [hasRemoteStream]);

  return (
    <div className="w-full h-full flex flex-col bg-black relative overflow-hidden">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-10 bg-gradient-to-b from-black/70 to-transparent p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Video className="w-5 h-5 text-white" />
            <div>
              <h2 className="text-white font-semibold">
                {isConnected ? `On Call with ${callerName}` : isConnecting ? 'Connecting...' : 'Camera Preview'}
              </h2>
              {isConnected && (
                <p className="text-sm text-white/70">{formatDuration(callDuration)}</p>
              )}
            </div>
          </div>
          {isConnected && (
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-green-400 text-sm">Connected</span>
            </div>
          )}
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="absolute top-16 left-4 right-4 z-10 bg-red-500/90 text-white px-4 py-2 rounded-lg text-sm">
          {error}
          <Button variant="ghost" size="sm" className="ml-2 text-white" onClick={() => {
            joinedRef.current = false;
            joinCall();
          }}>
            <RefreshCw className="w-4 h-4 mr-1" /> Retry
          </Button>
        </div>
      )}

      {/* Video Area */}
      <div className="flex-1 relative">
        {/* Remote video - always rendered, shown when connected with stream */}
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          className={cn(
            "absolute inset-0 w-full h-full object-cover transition-opacity duration-300",
            (isConnected && hasRemoteStream) ? "opacity-100" : "opacity-0 pointer-events-none"
          )}
        />
        
        {/* Local video as main view when not connected or no remote stream */}
        <video
          ref={localVideoRef}
          autoPlay
          playsInline
          muted
          className={cn(
            "absolute inset-0 w-full h-full object-cover transition-opacity duration-300",
            (!isConnected || !hasRemoteStream) ? "opacity-100" : "opacity-0 pointer-events-none"
          )}
        />

        {/* Local video PIP when connected - always rendered, visibility controlled */}
        <video
          ref={localVideoPipRef}
          autoPlay
          playsInline
          muted
          className={cn(
            "absolute bottom-24 right-4 w-36 h-48 rounded-xl border-2 border-white shadow-2xl object-cover transition-opacity duration-300 z-20",
            (isConnected && !isVideoOff) ? "opacity-100" : "opacity-0 pointer-events-none"
          )}
        />

        {/* Connecting overlay */}
        {isConnecting && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
            <div className="text-center">
              <div className="w-12 h-12 border-4 border-white/30 border-t-white rounded-full animate-spin mx-auto mb-4" />
              <p className="text-white text-lg">Connecting to {callerName}...</p>
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="absolute bottom-0 left-0 right-0 z-10 bg-gradient-to-t from-black/80 to-transparent p-6">
        <div className="flex items-center justify-center gap-4">
          {isActive ? (
            <>
              <Button
                variant={isMuted ? 'destructive' : 'secondary'}
                size="lg"
                onClick={toggleMute}
                className="rounded-full w-14 h-14 p-0"
              >
                {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
              </Button>

              <Button
                variant={isVideoOff ? 'destructive' : 'secondary'}
                size="lg"
                onClick={toggleVideo}
                className="rounded-full w-14 h-14 p-0"
              >
                {isVideoOff ? <VideoOff className="w-6 h-6" /> : <Video className="w-6 h-6" />}
              </Button>

              <Button
                variant="destructive"
                size="lg"
                onClick={endCall}
                className="rounded-full w-16 h-16 p-0 bg-red-600 hover:bg-red-700"
              >
                <PhoneOff className="w-7 h-7" />
              </Button>
            </>
          ) : (
            <div className="text-white/70 text-center">
              <p>Waiting for call...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
