import { useState, useRef, useEffect, useCallback } from 'react';
import { Video, Phone, PhoneOff, Mic, MicOff, VideoOff, Monitor, Maximize2, Minimize2, WifiOff, Wifi } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatusIndicator } from '@/components/StatusIndicator';
import { CallStatus } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/use-toast';

interface VideoConferenceProps {
  callStatus: CallStatus;
  onStatusChange?: (status: CallStatus) => void;
  patientName?: string;
  callerName?: string;
  onEndCall?: () => void;
  isFullScreen?: boolean;
  roomId?: string; // Room to join for the call
}

const callStateLabels: Record<CallStatus['state'], string> = {
  not_in_call: 'Ready to receive calls',
  connecting: 'Connecting...',
  in_call: 'In Call',
};

const callStateStatus: Record<CallStatus['state'], 'muted' | 'warning' | 'success'> = {
  not_in_call: 'muted',
  connecting: 'warning',
  in_call: 'success',
};

export function VideoConference({ callStatus, onStatusChange, patientName = 'Patient', callerName: initialCallerName, onEndCall, isFullScreen = false, roomId: propRoomId }: VideoConferenceProps) {
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [participants, setParticipants] = useState(1);
  const [participantId, setParticipantId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [callerName, setCallerName] = useState(initialCallerName || 'Family Member');
  const [callDuration, setCallDuration] = useState(0);
  const [connectionQuality, setConnectionQuality] = useState<'excellent' | 'good' | 'poor' | 'unknown'>('unknown');
  const [wsReconnectAttempts, setWsReconnectAttempts] = useState(0);
  const [iceConnectionState, setIceConnectionState] = useState<string>('new');
  const { toast } = useToast();

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const signalingWebSocketRef = useRef<WebSocket | null>(null);
  const offerPendingRef = useRef(false);
  const callStartTimeRef = useRef<number | null>(null);
  const wsReconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const statsIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Format call duration
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Call duration timer
  useEffect(() => {
    if (callStatus.state === 'in_call') {
      if (!callStartTimeRef.current) {
        callStartTimeRef.current = Date.now();
      }
      const interval = setInterval(() => {
        if (callStartTimeRef.current) {
          setCallDuration(Math.floor((Date.now() - callStartTimeRef.current) / 1000));
        }
      }, 1000);
      return () => clearInterval(interval);
    } else {
      callStartTimeRef.current = null;
      setCallDuration(0);
    }
  }, [callStatus.state]);

  // Initialize WebRTC with STUN and TURN servers
  const createPeerConnection = useCallback(() => {
    const pc = new RTCPeerConnection({
      iceServers: [
        // STUN servers for NAT traversal
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' },
        // Free TURN servers (for production, use your own TURN server)
        // These are public Metered.ca free TURN servers
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

    // Handle ICE candidates
    pc.onicecandidate = async (event) => {
      if (event.candidate) {
        console.log('New ICE candidate:', event.candidate);
        if (signalingWebSocketRef.current?.readyState === WebSocket.OPEN) {
          signalingWebSocketRef.current.send(
            JSON.stringify({
              type: 'ice_candidate',
              candidate: event.candidate,
            })
          );
        }
      }
    };

    // Handle connection state changes
    pc.onconnectionstatechange = () => {
      console.log('Connection state:', pc.connectionState);
      if (pc.connectionState === 'connected') {
        onStatusChange?.({ state: 'in_call', roomId: 'conference', participantCount: participants });
        setError(null);
        startStatsMonitoring(pc);
      } else if (pc.connectionState === 'failed') {
        setError('Connection failed. Trying to reconnect...');
        // Attempt ICE restart
        restartIce();
      } else if (pc.connectionState === 'disconnected') {
        setError('Connection lost. Reconnecting...');
        setConnectionQuality('poor');
      }
    };

    // Handle ICE connection state changes
    pc.oniceconnectionstatechange = () => {
      console.log('ICE connection state:', pc.iceConnectionState);
      setIceConnectionState(pc.iceConnectionState);
      
      if (pc.iceConnectionState === 'failed') {
        restartIce();
      } else if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        setError(null);
      }
    };

    // Handle remote stream
    pc.ontrack = (event) => {
      console.log('Received remote track:', event.track.kind);
      if (remoteVideoRef.current && event.streams[0]) {
        remoteVideoRef.current.srcObject = event.streams[0];
        setParticipants(2);
      }
    };

    return pc;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onStatusChange, participants]);

  // ICE restart for connection recovery
  const restartIce = useCallback(async () => {
    const pc = peerConnectionRef.current;
    if (!pc) return;
    
    try {
      console.log('Attempting ICE restart...');
      const offer = await pc.createOffer({ iceRestart: true });
      await pc.setLocalDescription(offer);
      
      if (signalingWebSocketRef.current?.readyState === WebSocket.OPEN) {
        signalingWebSocketRef.current.send(
          JSON.stringify({
            type: 'sdp_offer',
            sdp: offer.sdp,
          })
        );
      }
    } catch (e) {
      console.error('ICE restart failed:', e);
    }
  }, []);

  // Start monitoring connection quality
  const startStatsMonitoring = useCallback((pc: RTCPeerConnection) => {
    if (statsIntervalRef.current) {
      clearInterval(statsIntervalRef.current);
    }
    
    statsIntervalRef.current = setInterval(async () => {
      try {
        const stats = await pc.getStats();
        let packetsLost = 0;
        let packetsReceived = 0;
        let roundTripTime = 0;
        
        stats.forEach((report) => {
          if (report.type === 'inbound-rtp' && report.kind === 'video') {
            packetsLost += report.packetsLost || 0;
            packetsReceived += report.packetsReceived || 0;
          }
          if (report.type === 'candidate-pair' && report.currentRoundTripTime) {
            roundTripTime = report.currentRoundTripTime * 1000; // Convert to ms
          }
        });
        
        const lossRate = packetsReceived > 0 ? (packetsLost / (packetsReceived + packetsLost)) * 100 : 0;
        
        if (lossRate < 1 && roundTripTime < 150) {
          setConnectionQuality('excellent');
        } else if (lossRate < 5 && roundTripTime < 300) {
          setConnectionQuality('good');
        } else {
          setConnectionQuality('poor');
        }
      } catch (e) {
        // Stats not available
      }
    }, 2000);
  }, []);

  const startWebRTC = async () => {
    try {
      setError(null);

      // Get user media
      const stream = await navigator.mediaDevices.getUserMedia({
        video: !isVideoOff,
        audio: !isMuted,
      });

      localStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      // Create peer connection
      const pc = createPeerConnection();
      peerConnectionRef.current = pc;

      // Add local tracks to peer connection
      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream);
      });

      // Create and send SDP offer
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      });

      await pc.setLocalDescription(offer);

      // Send offer via signaling
      if (signalingWebSocketRef.current?.readyState === WebSocket.OPEN) {
        signalingWebSocketRef.current.send(
          JSON.stringify({
            type: 'sdp_offer',
            sdp: offer.sdp,
          })
        );
        offerPendingRef.current = true;
      }
    } catch (error) {
      console.error('WebRTC setup failed:', error);
      setError(error instanceof Error ? error.message : 'Failed to start WebRTC');
      onStatusChange?.({ state: 'not_in_call' });
    }
  };

  const stopWebRTC = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }

    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }

    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }

    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }

    setParticipants(1);
  };

  // Handle signaling messages
  const handleSignalingMessage = async (message: { type: string; from_participant_id?: string; sdp?: string; candidate?: RTCIceCandidateInit }) => {
    try {
      if (message.type === 'sdp_offer') {
        console.log('Received SDP offer');
        const pc = peerConnectionRef.current;
        if (!pc) return;

        // Get user media if not already available
        if (!localStreamRef.current) {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: !isVideoOff,
            audio: !isMuted,
          });
          localStreamRef.current = stream;
          if (localVideoRef.current) {
            localVideoRef.current.srcObject = stream;
          }
          stream.getTracks().forEach((track) => {
            pc.addTrack(track, stream);
          });
        }

        // Set remote description and create answer
        await pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: message.sdp }));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        // Send answer via signaling
        if (signalingWebSocketRef.current?.readyState === WebSocket.OPEN && message.from_participant_id) {
          signalingWebSocketRef.current.send(
            JSON.stringify({
              type: 'sdp_answer',
              sdp: answer.sdp,
              to_participant_id: message.from_participant_id,
            })
          );
        }
      } else if (message.type === 'sdp_answer') {
        console.log('Received SDP answer');
        const pc = peerConnectionRef.current;
        if (pc && offerPendingRef.current) {
          await pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: message.sdp }));
          offerPendingRef.current = false;
        }
      } else if (message.type === 'ice_candidate') {
        console.log('Received ICE candidate');
        const pc = peerConnectionRef.current;
        if (pc && message.candidate) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(message.candidate));
          } catch (e) {
            console.error('Failed to add ICE candidate:', e);
          }
        }
      } else if (message.type === 'participant_left') {
        console.log('Participant left');
        setParticipants(1);
      } else if (message.type === 'participant_muted') {
        console.log('Participant muted');
      } else if (message.type === 'participant_video') {
        console.log('Participant video toggled');
      }
    } catch (error) {
      console.error('Error handling signaling message:', error);
      setError(error instanceof Error ? error.message : 'Signaling error');
    }
  };

  // Setup signaling WebSocket with reconnection
  const setupSignaling = useCallback((pid: string) => {
    // Use backend WebSocket endpoint
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname;
    const port = 8000; // Backend port
    const wsUrl = `${protocol}//${host}:${port}/ws/video/${pid}`;

    const connect = () => {
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log('Signaling WebSocket connected');
        setError(null);
        setWsReconnectAttempts(0);
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          console.log('Signaling message:', message.type);
          handleSignalingMessage(message);
        } catch (error) {
          console.error('Failed to parse signaling message:', error);
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };

      ws.onclose = (event) => {
        console.log('Signaling WebSocket closed:', event.code, event.reason);
        signalingWebSocketRef.current = null;
        
        // Attempt reconnection if call is still active
        if (callStatus.state === 'in_call' && wsReconnectAttempts < 5) {
          const delay = Math.min(1000 * Math.pow(2, wsReconnectAttempts), 10000); // Exponential backoff, max 10s
          setError(`Connection lost. Reconnecting in ${delay / 1000}s...`);
          setWsReconnectAttempts(prev => prev + 1);
          
          wsReconnectTimeoutRef.current = setTimeout(() => {
            console.log(`Reconnection attempt ${wsReconnectAttempts + 1}...`);
            connect();
          }, delay);
        } else if (wsReconnectAttempts >= 5) {
          setError('Connection failed after multiple attempts. Please end the call and try again.');
        }
      };

      signalingWebSocketRef.current = ws;
    };

    connect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callStatus.state, wsReconnectAttempts]);

  // Auto-join when call status changes to in_call/connecting with a room ID
  useEffect(() => {
    const hasRoom = propRoomId || callStatus.roomId;
    const shouldAutoJoin = (callStatus.state === 'in_call' || callStatus.state === 'connecting') && hasRoom && !participantId && !isLoading;
    
    if (shouldAutoJoin) {
      console.log('Auto-joining video room...');
      handleJoinCall();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callStatus.state, propRoomId, callStatus.roomId, participantId, isLoading]);

  // Handle call state changes - start WebRTC when joined
  useEffect(() => {
    if (callStatus.state === 'in_call' && participantId) {
      startWebRTC();
    } else if (callStatus.state === 'not_in_call') {
      stopWebRTC();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callStatus.state, participantId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopWebRTC();
      if (signalingWebSocketRef.current) {
        signalingWebSocketRef.current.close();
      }
      if (wsReconnectTimeoutRef.current) {
        clearTimeout(wsReconnectTimeoutRef.current);
      }
      if (statsIntervalRef.current) {
        clearInterval(statsIntervalRef.current);
      }
    };
  }, []);

  const handleJoinCall = async () => {
    setIsLoading(true);
    setError(null);
    try {
      onStatusChange?.({ state: 'connecting' });

      // Use provided room ID or generate one
      const targetRoomId = propRoomId || callStatus.roomId || `room-${Date.now()}`;
      console.log('Joining video room:', targetRoomId);

      // Call backend to join video room
      const response = await fetch('/api/video/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room_id: targetRoomId }),
      });

      if (!response.ok) {
        throw new Error(`Failed to join call: ${response.status}`);
      }

      const data = await response.json();
      const pid = data.participant_id;
      setParticipantId(pid);
      console.log('Joined as participant:', pid);

      // Setup signaling WebSocket
      setupSignaling(pid);

      // Now start WebRTC
      onStatusChange?.({ state: 'in_call', roomId: targetRoomId, participantCount: 1 });
    } catch (error) {
      console.error('Failed to join call:', error);
      setError(error instanceof Error ? error.message : 'Failed to join call');
      onStatusChange?.({ state: 'not_in_call' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleEndCall = async () => {
    setIsLoading(true);
    try {
      if (participantId) {
        await fetch('/api/video/end', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ participant_id: participantId }),
        });
      }

      stopWebRTC();
      if (signalingWebSocketRef.current) {
        signalingWebSocketRef.current.close();
      }

      const duration = callDuration;
      setParticipantId(null);
      setIsMuted(false);
      setIsVideoOff(false);
      setIsScreenSharing(false);
      setCallDuration(0);
      callStartTimeRef.current = null;
      
      // Call external handler if provided
      if (onEndCall) {
        onEndCall();
      }
      
      onStatusChange?.({ state: 'not_in_call' });
      
      toast({
        title: 'Call Ended',
        description: duration > 0 ? `Call duration: ${formatDuration(duration)}` : 'The call has been disconnected.',
      });
    } catch (error) {
      console.error('Failed to end call:', error);
      setError(error instanceof Error ? error.message : 'Failed to end call');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleMute = async () => {
    if (!participantId) return;
    
    try {
      const newMutedState = !isMuted;
      const endpoint = newMutedState ? '/api/video/mute' : '/api/video/unmute';

      await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ participant_id: participantId }),
      });

      // Toggle local audio tracks BEFORE updating state
      if (localStreamRef.current) {
        localStreamRef.current.getAudioTracks().forEach((track) => {
          track.enabled = !newMutedState; // enabled = opposite of muted
        });
      }
      
      setIsMuted(newMutedState);
    } catch (error) {
      console.error('Failed to toggle mute:', error);
      setError('Failed to toggle mute');
    }
  };

  const toggleVideo = async () => {
    if (!participantId) return;

    try {
      const newState = !isVideoOff;
      
      await fetch('/api/video/toggle-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ participant_id: participantId, video_on: !newState }),
      });

      setIsVideoOff(newState);

      // Also toggle local video tracks
      if (localStreamRef.current) {
        localStreamRef.current.getVideoTracks().forEach((track) => {
          track.enabled = !newState;
        });
      }
    } catch (error) {
      console.error('Failed to toggle video:', error);
      setError('Failed to toggle video');
    }
  };

  const toggleScreenShare = async () => {
    try {
      if (isScreenSharing) {
        // Stop screen sharing
        if (localStreamRef.current && peerConnectionRef.current) {
          const videoTrack = localStreamRef.current.getVideoTracks()[0];
          if (videoTrack) {
            videoTrack.stop();
            // Re-enable camera
            const newStream = await navigator.mediaDevices.getUserMedia({ video: true });
            const newTrack = newStream.getVideoTracks()[0];
            const sender = peerConnectionRef.current.getSenders().find((s) => s.track?.kind === 'video');
            if (sender) {
              await sender.replaceTrack(newTrack);
            }
            localStreamRef.current.removeTrack(videoTrack);
            localStreamRef.current.addTrack(newTrack);
            if (localVideoRef.current) {
              localVideoRef.current.srcObject = localStreamRef.current;
            }
          }
        }
        setIsScreenSharing(false);
      } else {
        // Start screen sharing
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: false,
        });

        const screenTrack = screenStream.getVideoTracks()[0];
        if (peerConnectionRef.current && localStreamRef.current) {
          const sender = peerConnectionRef.current.getSenders().find((s) => s.track?.kind === 'video');
          if (sender) {
            await sender.replaceTrack(screenTrack);
          }
          const oldTrack = localStreamRef.current.getVideoTracks()[0];
          localStreamRef.current.removeTrack(oldTrack);
          localStreamRef.current.addTrack(screenTrack);
          if (localVideoRef.current) {
            localVideoRef.current.srcObject = localStreamRef.current;
          }
        }
        setIsScreenSharing(true);
      }
    } catch (error) {
      console.error('Screen share toggle failed:', error);
      setError('Screen sharing not supported');
    }
  };

  const isInCall = callStatus.state === 'in_call';
  const isConnecting = callStatus.state === 'connecting';

  return (
    <div className="w-full h-full flex flex-col overflow-hidden bg-black relative">
      {/* Header */}
      <div className={cn(
        "flex-shrink-0 px-3 py-2 border-b border-white/10",
        isFullScreen && "absolute top-0 left-0 right-0 z-10 bg-black/50 backdrop-blur"
      )}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Video className="w-5 h-5 text-white" />
            <div>
              <h2 className="text-white font-semibold">{callStateLabels[callStatus.state]}</h2>
              {isInCall && (
                <p className="text-sm text-white/70">
                  {callerName} • {formatDuration(callDuration)}
                </p>
              )}
            </div>
          </div>
          <StatusIndicator
            status={callStateStatus[callStatus.state]}
            label=""
            pulse={isConnecting}
          />
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="px-3 py-2 bg-red-500/20 text-red-200 text-xs sm:text-sm border-b border-red-500/30">
          {error}
        </div>
      )}

      {/* Video Area - Fills remaining space */}
      <div className="flex-1 min-h-0 relative bg-black overflow-hidden">
        {isInCall ? (
          <>
            {/* Remote video (main, fullscreen) */}
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="absolute inset-0 w-full h-full object-cover"
            />

            {/* Local video (picture-in-picture, bottom-right corner) */}
            {!isVideoOff && (
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className="absolute bottom-4 right-4 w-24 h-32 sm:w-32 sm:h-40 border-2 border-white rounded-lg shadow-lg object-cover"
              />
            )}

            {/* Participant info overlay (top-left) */}
            <div className="absolute top-4 left-4 bg-black/70 backdrop-blur text-white px-3 py-2 rounded-lg">
              <p className="text-sm font-semibold">{callerName}</p>
              <p className="text-xs text-white/70">{formatDuration(callDuration)} • On call</p>
            </div>

            {/* Mute/Camera status indicators */}
            <div className="absolute top-4 right-4 flex gap-2">
              {/* Connection quality indicator */}
              <div className={cn(
                'px-2 py-1 rounded text-xs flex items-center gap-1',
                connectionQuality === 'excellent' && 'bg-green-500/90 text-white',
                connectionQuality === 'good' && 'bg-yellow-500/90 text-white',
                connectionQuality === 'poor' && 'bg-red-500/90 text-white',
                connectionQuality === 'unknown' && 'bg-gray-500/90 text-white'
              )}>
                {connectionQuality === 'poor' ? <WifiOff className="w-3 h-3" /> : <Wifi className="w-3 h-3" />}
                {connectionQuality === 'excellent' ? 'HD' : connectionQuality === 'good' ? 'SD' : connectionQuality === 'poor' ? 'Low' : '...'}
              </div>
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
          </>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className="text-center">
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-white/10 flex items-center justify-center mx-auto mb-4">
                <Video className="w-8 h-8 sm:w-10 sm:h-10 text-white/50" />
              </div>
              <p className="text-white text-lg sm:text-xl font-semibold mb-2">Ready for Calls</p>
              <p className="text-white/70 text-sm mb-6">Waiting to receive a call from {patientName}</p>
              {callStatus.state === 'not_in_call' && (
                <Button
                  onClick={handleJoinCall}
                  disabled={isLoading}
                  className="bg-green-600 hover:bg-green-700 text-white"
                  size="lg"
                >
                  <Phone className="w-5 h-5 mr-2" />
                  {isLoading ? 'Joining...' : 'Join Call Room'}
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Call Controls - Sticky at bottom */}
      <div className={cn(
        "flex-shrink-0 bg-black/80 backdrop-blur border-t border-white/10 px-3 sm:px-4 py-3 sm:py-4",
        isFullScreen && "absolute bottom-0 left-0 right-0 z-10"
      )}>
        <div className="flex items-center justify-center gap-3 sm:gap-4">
          {!isInCall ? (
            <Button
              variant="default"
              size="lg"
              onClick={handleJoinCall}
              disabled={isLoading || isConnecting}
              className="bg-green-600 hover:bg-green-700 text-white gap-2 rounded-full px-6"
            >
              <Phone className="w-5 h-5" />
              {isConnecting ? 'Connecting...' : 'Join Call'}
            </Button>
          ) : (
            <>
              {/* Mute Button */}
              <Button
                variant={isMuted ? 'destructive' : 'secondary'}
                size="lg"
                onClick={toggleMute}
                disabled={isLoading}
                className="rounded-full w-12 h-12 sm:w-14 sm:h-14 p-0"
                title={isMuted ? 'Unmute' : 'Mute'}
              >
                {isMuted ? <MicOff className="w-5 h-5 sm:w-6 sm:h-6" /> : <Mic className="w-5 h-5 sm:w-6 sm:h-6" />}
              </Button>

              {/* Video Toggle Button */}
              <Button
                variant={isVideoOff ? 'destructive' : 'secondary'}
                size="lg"
                onClick={toggleVideo}
                disabled={isLoading}
                className="rounded-full w-12 h-12 sm:w-14 sm:h-14 p-0"
                title={isVideoOff ? 'Turn on camera' : 'Turn off camera'}
              >
                {isVideoOff ? <VideoOff className="w-5 h-5 sm:w-6 sm:h-6" /> : <Video className="w-5 h-5 sm:w-6 sm:h-6" />}
              </Button>

              {/* Screen Share Button */}
              <Button
                variant={isScreenSharing ? 'default' : 'secondary'}
                size="lg"
                onClick={toggleScreenShare}
                disabled={isLoading}
                className="rounded-full w-12 h-12 sm:w-14 sm:h-14 p-0 hidden sm:flex"
                title={isScreenSharing ? 'Stop sharing' : 'Share screen'}
              >
                <Monitor className="w-5 h-5 sm:w-6 sm:h-6" />
              </Button>

              {/* End Call Button */}
              <Button
                variant="destructive"
                size="lg"
                onClick={handleEndCall}
                disabled={isLoading}
                className="rounded-full w-14 h-14 sm:w-16 sm:h-16 p-0 bg-red-600 hover:bg-red-700"
              >
                <PhoneOff className="w-6 h-6 sm:w-7 sm:h-7" />
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
