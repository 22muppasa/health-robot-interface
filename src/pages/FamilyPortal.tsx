// src/pages/FamilyPortal.tsx
/**
 * Family Portal Dashboard
 * Remote dashboard for family members to:
 * - Video call the patient
 * - View patient status (vitals, mood, etc.)
 * - Manage reminders and medications
 * - Update emergency contacts
 * - Set patient preferences
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Video,
  Phone,
  PhoneOff,
  User,
  LogOut,
  Heart,
  Pill,
  Bell,
  Users,
  Settings,
  Activity,
  Smile,
  Thermometer,
  Clock,
  Plus,
  Trash2,
  Edit,
  Save,
  X,
  Mic,
  MicOff,
  VideoOff,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  MessageSquare,
} from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import { wsManager, ConversationUpdate } from '@/lib/api';

interface FamilySession {
  token: string;
  familyId: string;
  name: string;
  patientId: string;
  expiresAt: number;
}

interface PatientStatus {
  name: string;
  isOnline: boolean;
  lastSeen: string;
  deviceId: string | null;
  vitals: {
    heartRate: number;
    bloodPressure: string;
    temperature: number;
    oxygenSaturation: number;
    lastUpdated: string;
  };
  mood: string;
  painLevel: number;
  lastMedication: string;
}

interface CallHistoryEntry {
  id: string;
  caller_name: string;
  patient_name: string;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number;
  status: 'completed' | 'missed' | 'rejected' | 'failed';
  direction: 'incoming' | 'outgoing';
}

interface ActivityLogEntry {
  id: string;
  action: string;
  description: string;
  timestamp: string;
  category: 'command' | 'reminder' | 'call' | 'system';
}

interface Reminder {
  id: string;
  title: string;
  description: string;
  reminder_type: 'medication' | 'appointment' | 'vital_check' | 'other';
  scheduled_time: string;
  frequency: 'once' | 'daily' | 'weekly' | 'monthly';
  is_active: boolean;
}

interface EmergencyContact {
  id: string;
  name: string;
  relationship: string;
  phone: string;
  isEmergency: boolean;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  intent?: string;
}

export default function FamilyPortal() {
  const [session, setSession] = useState<FamilySession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('call');
  const [patientStatus, setPatientStatus] = useState<PatientStatus | null>(null);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [contacts, setContacts] = useState<EmergencyContact[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Call state
  const [callState, setCallState] = useState<'idle' | 'calling' | 'connecting' | 'in_call'>('idle');
  const [callDuration, setCallDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [participantId, setParticipantId] = useState<string | null>(null);

  // Editing states
  const [editingReminder, setEditingReminder] = useState<Reminder | null>(null);
  const [newReminder, setNewReminder] = useState(false);
  const [editingContact, setEditingContact] = useState<EmergencyContact | null>(null);
  const [newContact, setNewContact] = useState(false);

  // Conversation state
  const [conversationMessages, setConversationMessages] = useState<ChatMessage[]>([]);
  const [loadingConversation, setLoadingConversation] = useState(false);
  const [hasNewMessages, setHasNewMessages] = useState(false);
  const conversationEndRef = useRef<HTMLDivElement>(null);

  // Settings state
  const [patientSettings, setPatientSettings] = useState({
    wake_word_sensitivity: 'medium',
    voice_speed: 'normal',
    auto_answer_family_calls: false,
    quiet_hours_start: '22:00',
    quiet_hours_end: '08:00',
  });
  const [savingSettings, setSavingSettings] = useState(false);

  // Call history and activity log
  const [callHistory, setCallHistory] = useState<CallHistoryEntry[]>([]);
  const [activityLog, setActivityLog] = useState<ActivityLogEntry[]>([]);
  const [missedCallsCount, setMissedCallsCount] = useState(0);
  const [loadingCallHistory, setLoadingCallHistory] = useState(false);
  const [loadingActivityLog, setLoadingActivityLog] = useState(false);
  const [currentCallId, setCurrentCallId] = useState<string | null>(null);

  // Video refs
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const signalingWebSocketRef = useRef<WebSocket | null>(null);

  const navigate = useNavigate();
  const { toast } = useToast();

  // Check authentication
  useEffect(() => {
    const sessionStr = localStorage.getItem('familySession');
    if (!sessionStr) {
      navigate('/family');
      return;
    }

    try {
      const sessionData: FamilySession = JSON.parse(sessionStr);
      if (sessionData.expiresAt < Date.now()) {
        localStorage.removeItem('familySession');
        navigate('/family');
        return;
      }
      setSession(sessionData);
      setIsLoading(false);
    } catch {
      localStorage.removeItem('familySession');
      navigate('/family');
    }
  }, [navigate]);

  // Load patient data
  useEffect(() => {
    if (!session) return;
    loadPatientStatus();
    loadReminders();
    loadContacts();
    loadConversationHistory();
    loadPatientSettings();
    loadCallHistory();
    loadActivityLog();
  }, [session]);

  // Subscribe to real-time conversation updates
  useEffect(() => {
    if (!session) return;

    // Connect to WebSocket if not already connected
    wsManager.connect();

    // Listen for conversation updates
    const unsubscribeConversation = wsManager.on('conversation_update', (data) => {
      const update = data as ConversationUpdate;
      // Only show messages for our patient
      if (update.patient_id === session.patientId || update.patient_id === 'patient-main') {
        setConversationMessages((prev) => {
          // Check if message already exists (avoid duplicates)
          if (prev.some((m) => m.id === update.message.id)) {
            return prev;
          }
          return [...prev, update.message];
        });
        // Mark as having new messages if not on conversation tab
        if (activeTab !== 'conversation') {
          setHasNewMessages(true);
        }
      }
    });

    // Listen for call events (answered, rejected, missed)
    const unsubscribeSystem = wsManager.on('system_update', (data) => {
      const payload = (data as { payload?: { call_event?: { type: string; call_id: string } } }).payload;
      if (payload?.call_event && currentCallId) {
        const event = payload.call_event;
        if (event.call_id === currentCallId) {
          if (event.type === 'call_rejected') {
            toast({
              title: 'Call Declined',
              description: `${patientStatus?.name || 'The patient'} declined your call`,
            });
            setCallState('idle');
            setCurrentCallId(null);
            loadCallHistory(); // Refresh call history
          } else if (event.type === 'call_answered') {
            // Call was answered - connection will proceed
            toast({
              title: 'Call Answered',
              description: 'Connecting...',
            });
          }
        }
      }
    });

    return () => {
      unsubscribeConversation();
      unsubscribeSystem();
    };
  }, [session, activeTab, currentCallId, patientStatus?.name, toast]);

  // Auto-scroll conversation to bottom when new messages arrive
  useEffect(() => {
    if (activeTab === 'conversation') {
      conversationEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      setHasNewMessages(false);
    }
  }, [conversationMessages, activeTab]);

  // Call duration timer
  useEffect(() => {
    if (callState !== 'in_call') return;
    const interval = setInterval(() => {
      setCallDuration((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [callState]);

  const loadPatientStatus = async () => {
    if (!session) return;
    try {
      // Get patient data from Supabase via backend
      const patientRes = await fetch(`/api/patient/${session.patientId}/status`);
      
      let patientData = null;
      let isOnline = false;
      let lastSeen = 'Unknown';
      let deviceId = null;
      let patientName = 'Patient';

      if (patientRes.ok) {
        patientData = await patientRes.json();
        isOnline = patientData.is_online ?? false;
        lastSeen = patientData.last_seen ? new Date(patientData.last_seen).toLocaleString() : 'Unknown';
        deviceId = patientData.device_id || null;
        patientName = patientData.name || 'Patient';
      } else {
        // Fallback to user-profile
        const profileRes = await fetch('/api/user-profile');
        if (profileRes.ok) {
          const profileData = await profileRes.json();
          patientName = profileData.profile?.name || 'Patient';
        }
      }

      // Get robot status for vitals
      const statusRes = await fetch('/api/robot-status');
      const statusData = statusRes.ok ? await statusRes.json() : {};

      setPatientStatus({
        name: patientName,
        isOnline,
        lastSeen,
        deviceId,
        vitals: {
          heartRate: statusData.vitals?.heart_rate || 72,
          bloodPressure: statusData.vitals?.blood_pressure || '120/80',
          temperature: statusData.vitals?.temperature || 98.6,
          oxygenSaturation: statusData.vitals?.oxygen_saturation || 98,
          lastUpdated: new Date().toLocaleTimeString(),
        },
        mood: statusData.mood || 'Good',
        painLevel: statusData.pain_level || 0,
        lastMedication: statusData.last_medication || 'Not recorded',
      });
    } catch (error) {
      console.error('Failed to load patient status:', error);
      setPatientStatus({
        name: 'Patient',
        isOnline: false,
        lastSeen: 'Unknown',
        deviceId: null,
        vitals: {
          heartRate: 72,
          bloodPressure: '120/80',
          temperature: 98.6,
          oxygenSaturation: 98,
          lastUpdated: new Date().toLocaleTimeString(),
        },
        mood: 'Good',
        painLevel: 0,
        lastMedication: 'Not recorded',
      });
    }
  };

  const loadCallHistory = async () => {
    if (!session) return;
    setLoadingCallHistory(true);
    try {
      const res = await fetch(`/api/family/call-history/${session.patientId}`);
      if (res.ok) {
        const data = await res.json();
        setCallHistory(data.calls || []);
        // Count unviewed missed calls
        const missed = (data.calls || []).filter(
          (c: CallHistoryEntry) => c.status === 'missed' && !c.ended_at
        ).length;
        setMissedCallsCount(missed);
      }
    } catch (error) {
      console.error('Failed to load call history:', error);
    } finally {
      setLoadingCallHistory(false);
    }
  };

  const loadActivityLog = async () => {
    if (!session) return;
    setLoadingActivityLog(true);
    try {
      const res = await fetch(`/api/family/activity-log/${session.patientId}?limit=50`);
      if (res.ok) {
        const data = await res.json();
        setActivityLog(data.activities || []);
      }
    } catch (error) {
      console.error('Failed to load activity log:', error);
    } finally {
      setLoadingActivityLog(false);
    }
  };

  const loadReminders = async () => {
    try {
      const res = await fetch('/api/reminders');
      const data = await res.json();
      setReminders(data.reminders || []);
    } catch (error) {
      console.error('Failed to load reminders:', error);
      setReminders([]);
    }
  };

  const loadContacts = async () => {
    try {
      const res = await fetch('/api/user-profile');
      const data = await res.json();
      setContacts(data.profile?.emergency_contacts || []);
    } catch (error) {
      console.error('Failed to load contacts:', error);
      setContacts([]);
    }
  };

  const loadConversationHistory = async () => {
    if (!session) return;
    setLoadingConversation(true);
    try {
      const patientId = session.patientId || 'patient-main';
      const res = await fetch(`/api/chat-history/${patientId}?limit=100`);
      if (res.ok) {
        const data = await res.json();
        setConversationMessages(data.messages || []);
      }
    } catch (error) {
      console.error('Failed to load conversation history:', error);
    } finally {
      setLoadingConversation(false);
    }
  };

  const loadPatientSettings = async () => {
    if (!session) return;
    try {
      const patientId = session.patientId || 'patient-main';
      const res = await fetch(`/api/patient-settings/${patientId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.settings) {
          setPatientSettings({
            wake_word_sensitivity: data.settings.wake_word_sensitivity || 'medium',
            voice_speed: data.settings.voice_speed || 'normal',
            auto_answer_family_calls: data.settings.auto_answer_family_calls || false,
            quiet_hours_start: data.settings.quiet_hours_start || '22:00',
            quiet_hours_end: data.settings.quiet_hours_end || '08:00',
          });
        }
      }
    } catch (error) {
      console.error('Failed to load patient settings:', error);
    }
  };

  const savePatientSettings = async () => {
    if (!session) return;
    setSavingSettings(true);
    try {
      const patientId = session.patientId || 'patient-main';
      const res = await fetch('/api/patient-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patient_id: patientId,
          ...patientSettings,
        }),
      });
      if (res.ok) {
        toast({
          title: 'Settings Saved',
          description: 'Patient preferences have been updated',
        });
      } else {
        throw new Error('Failed to save settings');
      }
    } catch (error) {
      console.error('Failed to save patient settings:', error);
      toast({
        title: 'Error',
        description: 'Failed to save settings. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSavingSettings(false);
    }
  };

  const formatMessageTimestamp = (timestamp: string) => {
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

  const handleLogout = () => {
    if (callState !== 'idle') {
      endCall();
    }
    localStorage.removeItem('familySession');
    navigate('/family');
  };

  const refreshData = async () => {
    setIsRefreshing(true);
    await Promise.all([loadPatientStatus(), loadReminders(), loadContacts()]);
    setIsRefreshing(false);
    toast({
      title: 'Refreshed',
      description: 'Patient data has been updated',
    });
  };

  // === VIDEO CALL FUNCTIONS ===
  const initiateCall = async () => {
    if (!session || !patientStatus) return;

    // Check if patient is online first
    if (!patientStatus.isOnline) {
      toast({
        title: 'Patient Offline',
        description: `${patientStatus.name} appears to be offline. Last seen: ${patientStatus.lastSeen}`,
        variant: 'destructive',
      });
      return;
    }

    // Check if device is paired
    if (!patientStatus.deviceId) {
      toast({
        title: 'No Device Paired',
        description: 'The patient has no device paired. They need to pair a device first.',
        variant: 'destructive',
      });
      return;
    }

    setCallState('calling');

    try {
      // Initiate call via backend
      const response = await fetch('/api/calls/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          initiator_id: `family-${session.familyId}`,
          initiator_name: session.name,
          initiator_role: 'Family Member',
          patient_id: session.patientId,
          call_type: 'video',
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.detail || 'Failed to initiate call';
        
        // Provide specific error messages
        if (response.status === 503) {
          throw new Error('Patient device is not connected. Please try again later.');
        } else if (response.status === 404) {
          throw new Error('Patient not found. Please check the connection.');
        } else {
          throw new Error(errorMessage);
        }
      }

      const callData = await response.json();
      setRoomId(callData.room_id);
      setCurrentCallId(callData.call_id);

      toast({
        title: 'Calling...',
        description: 'Claire will announce your call to the patient',
      });

      // Poll for answer
      pollCallStatus(callData.call_id);
    } catch (error) {
      console.error('Failed to initiate call:', error);
      const errorMessage = error instanceof Error ? error.message : 'Could not reach the patient';
      
      // Log failed call attempt
      try {
        await fetch('/api/family/log-call', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            patient_id: session.patientId,
            caller_name: session.name,
            status: 'failed',
            error: errorMessage,
          }),
        });
      } catch (logError) {
        console.error('Failed to log call:', logError);
      }

      toast({
        title: 'Call Failed',
        description: errorMessage,
        variant: 'destructive',
      });
      setCallState('idle');
      setCurrentCallId(null);
    }
  };

  const pollCallStatus = async (callId: string) => {
    let attempts = 0;
    const maxAttempts = 60;

    const checkStatus = async () => {
      try {
        const response = await fetch(`/api/calls/${callId}/status`);
        if (!response.ok) {
          if (response.status === 404) {
            await joinVideoRoom();
            return;
          }
          throw new Error('Failed to check status');
        }

        const data = await response.json();
        if (data.answered) {
          await joinVideoRoom();
          return;
        } else if (data.rejected) {
          toast({
            title: 'Call Declined',
            description: 'The patient declined the call',
          });
          setCallState('idle');
          return;
        }

        attempts++;
        if (attempts < maxAttempts) {
          setTimeout(checkStatus, 1000);
        } else {
          toast({
            title: 'No Answer',
            description: 'The patient did not answer',
          });
          setCallState('idle');
        }
      } catch (error) {
        if (attempts > 5) {
          await joinVideoRoom();
        } else {
          attempts++;
          setTimeout(checkStatus, 1000);
        }
      }
    };

    checkStatus();
  };

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
          urls: 'turn:a.relay.metered.ca:443',
          username: 'e8e8e8e8e8e8e8e8e8e8e8e8',
          credential: 'e8e8e8e8e8e8e8e8e8e8e8e8',
        },
      ],
    });

    pc.onicecandidate = (event) => {
      if (event.candidate && signalingWebSocketRef.current?.readyState === WebSocket.OPEN) {
        signalingWebSocketRef.current.send(
          JSON.stringify({ type: 'ice_candidate', candidate: event.candidate })
        );
      }
    };

    pc.ontrack = (event) => {
      if (remoteVideoRef.current && event.streams[0]) {
        remoteVideoRef.current.srcObject = event.streams[0];
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        endCall();
      }
    };

    return pc;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const joinVideoRoom = async () => {
    setCallState('connecting');

    try {
      const response = await fetch('/api/video/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room_id: roomId }),
      });

      if (!response.ok) throw new Error('Failed to join video room');

      const data = await response.json();
      setParticipantId(data.participant_id);

      // Setup signaling
      setupSignaling(data.participant_id);

      // Get local media
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

      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream);
      });

      setCallState('in_call');
      setCallDuration(0);

      toast({
        title: 'Connected!',
        description: `In call with ${patientStatus?.name || 'Patient'}`,
      });
    } catch (error) {
      console.error('Failed to join video room:', error);
      toast({
        title: 'Connection Failed',
        description: 'Could not establish video connection',
        variant: 'destructive',
      });
      setCallState('idle');
    }
  };

  const setupSignaling = (pid: string) => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname;
    const port = 8000;
    const wsUrl = `${protocol}//${host}:${port}/ws/video/${pid}`;

    const ws = new WebSocket(wsUrl);

    ws.onopen = () => console.log('Signaling connected');
    ws.onmessage = async (event) => {
      try {
        const message = JSON.parse(event.data);
        await handleSignalingMessage(message);
      } catch (error) {
        console.error('Signaling error:', error);
      }
    };
    ws.onerror = (error) => console.error('WebSocket error:', error);

    signalingWebSocketRef.current = ws;
  };

  const handleSignalingMessage = async (message: { type: string; sdp?: string; candidate?: RTCIceCandidateInit }) => {
    const pc = peerConnectionRef.current;
    if (!pc) return;

    if (message.type === 'sdp_offer') {
      await pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: message.sdp }));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      if (signalingWebSocketRef.current?.readyState === WebSocket.OPEN) {
        signalingWebSocketRef.current.send(JSON.stringify({ type: 'sdp_answer', sdp: answer.sdp }));
      }
    } else if (message.type === 'sdp_answer') {
      await pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: message.sdp }));
    } else if (message.type === 'ice_candidate' && message.candidate) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(message.candidate));
      } catch (e) {
        console.error('Failed to add ICE candidate:', e);
      }
    }
  };

  const endCall = async () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }

    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }

    if (signalingWebSocketRef.current) {
      signalingWebSocketRef.current.close();
      signalingWebSocketRef.current = null;
    }

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

    // Log completed call to history
    if (currentCallId && session) {
      try {
        await fetch('/api/family/log-call', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            call_id: currentCallId,
            patient_id: session.patientId,
            caller_name: session.name,
            status: 'completed',
            duration_seconds: callDuration,
          }),
        });
        // Refresh call history
        loadCallHistory();
      } catch (error) {
        console.error('Error logging call:', error);
      }
    }

    toast({
      title: 'Call Ended',
      description: `Duration: ${Math.floor(callDuration / 60)}m ${callDuration % 60}s`,
    });

    setCallState('idle');
    setCallDuration(0);
    setRoomId(null);
    setParticipantId(null);
    setCurrentCallId(null);
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

  // === REMINDER FUNCTIONS ===
  const saveReminder = async (reminder: Partial<Reminder>) => {
    try {
      const method = reminder.id ? 'PUT' : 'POST';
      const url = reminder.id ? `/api/reminders/${reminder.id}` : '/api/reminders';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reminder),
      });

      if (!res.ok) throw new Error('Failed to save reminder');

      toast({ title: 'Saved', description: 'Reminder has been saved' });
      loadReminders();
      setEditingReminder(null);
      setNewReminder(false);
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to save reminder', variant: 'destructive' });
    }
  };

  const deleteReminder = async (id: string) => {
    try {
      await fetch(`/api/reminders/${id}`, { method: 'DELETE' });
      toast({ title: 'Deleted', description: 'Reminder has been deleted' });
      loadReminders();
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to delete reminder', variant: 'destructive' });
    }
  };

  // === CONTACT FUNCTIONS ===
  const saveContact = async (contact: EmergencyContact) => {
    try {
      const updatedContacts = contact.id
        ? contacts.map((c) => (c.id === contact.id ? contact : c))
        : [...contacts, { ...contact, id: `contact-${Date.now()}` }];

      const profileRes = await fetch('/api/user-profile');
      const profile = await profileRes.json();

      await fetch('/api/user-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...profile.profile,
          emergency_contacts: updatedContacts,
        }),
      });

      toast({ title: 'Saved', description: 'Contact has been saved' });
      setContacts(updatedContacts);
      setEditingContact(null);
      setNewContact(false);
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to save contact', variant: 'destructive' });
    }
  };

  const deleteContact = async (id: string) => {
    try {
      const updatedContacts = contacts.filter((c) => c.id !== id);

      const profileRes = await fetch('/api/user-profile');
      const profile = await profileRes.json();

      await fetch('/api/user-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...profile.profile,
          emergency_contacts: updatedContacts,
        }),
      });

      toast({ title: 'Deleted', description: 'Contact has been deleted' });
      setContacts(updatedContacts);
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to delete contact', variant: 'destructive' });
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  // In-call view (full screen)
  if (callState === 'in_call' || callState === 'connecting') {
    return (
      <div className="fixed inset-0 bg-black z-50 flex flex-col">
        <div className="flex-1 relative">
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="absolute inset-0 w-full h-full object-cover"
          />

          {!isVideoOff && (
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="absolute bottom-24 right-4 w-32 h-44 rounded-lg border-2 border-white shadow-lg object-cover"
            />
          )}

          <div className="absolute top-4 left-4 bg-black/60 backdrop-blur rounded-lg px-4 py-2">
            <p className="text-white font-semibold">{patientStatus?.name}</p>
            <p className="text-white/70 text-sm">
              {callState === 'connecting' ? 'Connecting...' : formatDuration(callDuration)}
            </p>
          </div>

          <div className="absolute top-4 right-4 flex gap-2">
            {isMuted && (
              <div className="bg-red-500/90 text-white px-2 py-1 rounded text-xs flex items-center gap-1">
                <MicOff className="w-3 h-3" /> Muted
              </div>
            )}
            {isVideoOff && (
              <div className="bg-red-500/90 text-white px-2 py-1 rounded text-xs flex items-center gap-1">
                <VideoOff className="w-3 h-3" /> Camera Off
              </div>
            )}
          </div>
        </div>

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
      <div className="fixed inset-0 bg-gradient-to-b from-blue-600 to-blue-800 z-50 flex flex-col items-center justify-center">
        <div className="text-center">
          <div className="w-32 h-32 mx-auto mb-6 rounded-full bg-white/20 flex items-center justify-center animate-pulse">
            <User className="w-16 h-16 text-white" />
          </div>
          <p className="text-white text-2xl font-semibold mb-2">
            Calling {patientStatus?.name}...
          </p>
          <p className="text-white/70 mb-8">Claire is announcing your call</p>

          <Button
            variant="destructive"
            size="lg"
            onClick={() => setCallState('idle')}
            className="rounded-full px-8"
          >
            <PhoneOff className="w-5 h-5 mr-2" />
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 border-b shadow-sm sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
              <Heart className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-lg">Family Portal</h1>
              <p className="text-xs text-muted-foreground">Welcome, {session?.name}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={refreshData} disabled={isRefreshing}>
              <RefreshCw className={cn('w-4 h-4', isRefreshing && 'animate-spin')} />
            </Button>
            <Button variant="ghost" size="icon" onClick={handleLogout}>
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-4 space-y-6">
        {/* Patient Status Card */}
        <Card className="bg-white/80 dark:bg-gray-800/80 backdrop-blur">
          <CardContent className="p-4">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-4">
                <div
                  className={cn(
                    'w-16 h-16 rounded-full flex items-center justify-center relative',
                    patientStatus?.isOnline
                      ? 'bg-green-100 dark:bg-green-900'
                      : 'bg-gray-100 dark:bg-gray-800'
                  )}
                >
                  <User
                    className={cn(
                      'w-8 h-8',
                      patientStatus?.isOnline
                        ? 'text-green-600 dark:text-green-400'
                        : 'text-gray-400'
                    )}
                  />
                  {/* Online indicator dot */}
                  <div
                    className={cn(
                      'absolute bottom-0 right-0 w-4 h-4 rounded-full border-2 border-white dark:border-gray-800',
                      patientStatus?.isOnline ? 'bg-green-500' : 'bg-gray-400'
                    )}
                  />
                </div>
                <div>
                  <h2 className="text-xl font-bold">{patientStatus?.name}</h2>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={cn(
                      'text-sm font-medium',
                      patientStatus?.isOnline ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'
                    )}>
                      {patientStatus?.isOnline ? 'Online' : 'Offline'}
                    </span>
                    {!patientStatus?.isOnline && patientStatus?.lastSeen && (
                      <span className="text-xs text-muted-foreground">
                        • Last seen: {patientStatus.lastSeen}
                      </span>
                    )}
                  </div>
                  {!patientStatus?.deviceId && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-1 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      No device paired
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3">
                {/* Quick stats */}
                <div className="hidden sm:flex items-center gap-4 mr-4 text-sm">
                  <div className="text-center">
                    <Heart className="w-4 h-4 mx-auto text-red-500" />
                    <span className="text-xs text-muted-foreground">{patientStatus?.vitals.heartRate} bpm</span>
                  </div>
                  <div className="text-center">
                    <Smile className="w-4 h-4 mx-auto text-yellow-500" />
                    <span className="text-xs text-muted-foreground">{patientStatus?.mood}</span>
                  </div>
                </div>
                <Button 
                  size="lg" 
                  onClick={initiateCall} 
                  disabled={!patientStatus?.isOnline || !patientStatus?.deviceId} 
                  className="gap-2"
                >
                  <Video className="w-5 h-5" />
                  Call Now
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Main Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid grid-cols-7 w-full">
            <TabsTrigger value="call" className="gap-1">
              <Phone className="w-4 h-4" />
              <span className="hidden sm:inline">Call</span>
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-1 relative">
              <Clock className="w-4 h-4" />
              <span className="hidden sm:inline">History</span>
              {missedCallsCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                  {missedCallsCount}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="conversation" className="gap-1 relative">
              <MessageSquare className="w-4 h-4" />
              <span className="hidden sm:inline">Chat</span>
              {hasNewMessages && (
                <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
              )}
            </TabsTrigger>
            <TabsTrigger value="status" className="gap-1">
              <Activity className="w-4 h-4" />
              <span className="hidden sm:inline">Status</span>
            </TabsTrigger>
            <TabsTrigger value="reminders" className="gap-1">
              <Bell className="w-4 h-4" />
              <span className="hidden sm:inline">Reminders</span>
            </TabsTrigger>
            <TabsTrigger value="contacts" className="gap-1">
              <Users className="w-4 h-4" />
              <span className="hidden sm:inline">Contacts</span>
            </TabsTrigger>
            <TabsTrigger value="settings" className="gap-1">
              <Settings className="w-4 h-4" />
              <span className="hidden sm:inline">Settings</span>
            </TabsTrigger>
          </TabsList>

          {/* Call Tab */}
          <TabsContent value="call" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Video Call</CardTitle>
                <CardDescription>
                  Connect with {patientStatus?.name} through Claire
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="text-center py-8">
                  <div className="w-24 h-24 mx-auto mb-4 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center">
                    <Video className="w-12 h-12 text-green-600 dark:text-green-400" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">Ready to Call</h3>
                  <p className="text-muted-foreground mb-6">
                    When you call, Claire will announce your call to the patient
                  </p>
                  <Button size="lg" onClick={initiateCall} disabled={!patientStatus?.isOnline} className="gap-2 px-8">
                    <Video className="w-5 h-5" />
                    Start Video Call
                  </Button>
                </div>

                <div className="bg-blue-50 dark:bg-blue-950 rounded-lg p-4 text-sm">
                  <p className="font-medium text-blue-800 dark:text-blue-200 mb-2">📞 How calls work:</p>
                  <ol className="list-decimal list-inside space-y-1 text-blue-700 dark:text-blue-300">
                    <li>Claire announces your call to the patient</li>
                    <li>The patient can answer by voice ("Claire, answer the call")</li>
                    <li>Or by tapping the answer button on screen</li>
                    <li>You'll be connected once they answer</li>
                  </ol>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Call History Tab */}
          <TabsContent value="history" className="mt-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="w-5 h-5 text-primary" />
                    Call History
                  </CardTitle>
                  <CardDescription>
                    Recent calls with {patientStatus?.name}
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={loadCallHistory}
                  disabled={loadingCallHistory}
                >
                  <RefreshCw className={cn('w-4 h-4 mr-1', loadingCallHistory && 'animate-spin')} />
                  Refresh
                </Button>
              </CardHeader>
              <CardContent>
                {loadingCallHistory ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                  </div>
                ) : callHistory.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Phone className="w-16 h-16 mx-auto mb-4 opacity-30" />
                    <p className="text-lg font-medium mb-2">No call history yet</p>
                    <p className="text-sm">
                      Your calls with {patientStatus?.name || 'the patient'} will appear here.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3 max-h-[500px] overflow-y-auto">
                    {callHistory.map((call) => (
                      <div
                        key={call.id}
                        className={cn(
                          'flex items-center justify-between p-3 rounded-lg border transition-colors',
                          call.status === 'completed' && 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-900',
                          call.status === 'missed' && 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900',
                          call.status === 'rejected' && 'bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-900',
                          call.status === 'failed' && 'bg-gray-50 dark:bg-gray-900/30 border-gray-200 dark:border-gray-800',
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            'w-10 h-10 rounded-full flex items-center justify-center',
                            call.status === 'completed' && 'bg-green-100 dark:bg-green-900',
                            call.status === 'missed' && 'bg-red-100 dark:bg-red-900',
                            call.status === 'rejected' && 'bg-orange-100 dark:bg-orange-900',
                            call.status === 'failed' && 'bg-gray-100 dark:bg-gray-800',
                          )}>
                            {call.status === 'completed' ? (
                              <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
                            ) : call.status === 'missed' ? (
                              <Phone className="w-5 h-5 text-red-600 dark:text-red-400" />
                            ) : call.status === 'rejected' ? (
                              <PhoneOff className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                            ) : (
                              <AlertCircle className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                            )}
                          </div>
                          <div>
                            <p className="font-medium">
                              {call.direction === 'incoming' ? `From ${call.caller_name}` : `To ${patientStatus?.name || 'Patient'}`}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(call.started_at).toLocaleString()}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className={cn(
                            'px-2 py-1 rounded-full text-xs font-medium',
                            call.status === 'completed' && 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
                            call.status === 'missed' && 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
                            call.status === 'rejected' && 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300',
                            call.status === 'failed' && 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
                          )}>
                            {call.status === 'completed' ? 'Completed' : 
                             call.status === 'missed' ? 'Missed' : 
                             call.status === 'rejected' ? 'Declined' : 'Failed'}
                          </span>
                          {call.status === 'completed' && call.duration_seconds > 0 && (
                            <p className="text-xs text-muted-foreground mt-1">
                              {Math.floor(call.duration_seconds / 60)}m {call.duration_seconds % 60}s
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Conversation Tab - Real-time chat history */}
          <TabsContent value="conversation" className="mt-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <MessageSquare className="w-5 h-5 text-primary" />
                    Live Conversation
                  </CardTitle>
                  <CardDescription>
                    Real-time view of {patientStatus?.name}'s conversations with Claire
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={loadConversationHistory}
                  disabled={loadingConversation}
                >
                  <RefreshCw className={cn('w-4 h-4 mr-1', loadingConversation && 'animate-spin')} />
                  Refresh
                </Button>
              </CardHeader>
              <CardContent>
                {loadingConversation ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                  </div>
                ) : conversationMessages.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <MessageSquare className="w-16 h-16 mx-auto mb-4 opacity-30" />
                    <p className="text-lg font-medium mb-2">No conversations yet</p>
                    <p className="text-sm">
                      When {patientStatus?.name || 'the patient'} talks to Claire, you'll see the conversation here in real-time.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2">
                    {conversationMessages.map((message) => (
                      <div
                        key={message.id}
                        className={cn(
                          'flex flex-col gap-1 p-3 rounded-lg transition-all',
                          message.role === 'user'
                            ? 'bg-blue-50 dark:bg-blue-950/50 ml-8 border-l-4 border-blue-400'
                            : 'bg-pink-50 dark:bg-pink-950/50 mr-8 border-l-4 border-pink-400'
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            {message.role === 'user' ? (
                              <User className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                            ) : (
                              <Heart className="w-4 h-4 text-pink-600 dark:text-pink-400" />
                            )}
                            <span
                              className={cn(
                                'text-xs font-semibold uppercase tracking-wide',
                                message.role === 'user'
                                  ? 'text-blue-600 dark:text-blue-400'
                                  : 'text-pink-600 dark:text-pink-400'
                              )}
                            >
                              {message.role === 'user' ? patientStatus?.name || 'Patient' : 'Claire'}
                            </span>
                          </div>
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {formatMessageTimestamp(message.timestamp)}
                          </span>
                        </div>
                        <p className="text-sm leading-relaxed mt-1">{message.content}</p>
                        {message.intent && message.intent !== 'conversation' && (
                          <span className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                            <Activity className="w-3 h-3" />
                            Action: {message.intent.replace(/_/g, ' ')}
                          </span>
                        )}
                      </div>
                    ))}
                    <div ref={conversationEndRef} />
                  </div>
                )}

                {/* Live indicator */}
                <div className="mt-4 pt-4 border-t flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                  </span>
                  Live - Updates appear automatically
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Status Tab */}
          <TabsContent value="status" className="mt-4 space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Heart className="w-5 h-5 text-red-500" />
                    Vital Signs
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between items-center p-2 bg-muted rounded">
                    <span className="text-sm">Heart Rate</span>
                    <span className="font-bold">{patientStatus?.vitals.heartRate} bpm</span>
                  </div>
                  <div className="flex justify-between items-center p-2 bg-muted rounded">
                    <span className="text-sm">Blood Pressure</span>
                    <span className="font-bold">{patientStatus?.vitals.bloodPressure}</span>
                  </div>
                  <div className="flex justify-between items-center p-2 bg-muted rounded">
                    <span className="text-sm">Temperature</span>
                    <span className="font-bold">{patientStatus?.vitals.temperature}°F</span>
                  </div>
                  <div className="flex justify-between items-center p-2 bg-muted rounded">
                    <span className="text-sm">O₂ Saturation</span>
                    <span className="font-bold">{patientStatus?.vitals.oxygenSaturation}%</span>
                  </div>
                  <p className="text-xs text-muted-foreground text-right">
                    Last updated: {patientStatus?.vitals.lastUpdated}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Smile className="w-5 h-5 text-yellow-500" />
                    Wellbeing
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between items-center p-2 bg-muted rounded">
                    <span className="text-sm">Mood</span>
                    <span className="font-bold">{patientStatus?.mood}</span>
                  </div>
                  <div className="flex justify-between items-center p-2 bg-muted rounded">
                    <span className="text-sm">Pain Level</span>
                    <span className="font-bold">{patientStatus?.painLevel}/10</span>
                  </div>
                  <div className="flex justify-between items-center p-2 bg-muted rounded">
                    <span className="text-sm">Last Medication</span>
                    <span className="font-bold text-sm">{patientStatus?.lastMedication}</span>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Activity Log */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="w-5 h-5 text-purple-500" />
                    Recent Activity
                  </CardTitle>
                  <CardDescription>
                    Commands and actions performed by {patientStatus?.name}
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={loadActivityLog}
                  disabled={loadingActivityLog}
                >
                  <RefreshCw className={cn('w-4 h-4 mr-1', loadingActivityLog && 'animate-spin')} />
                  Refresh
                </Button>
              </CardHeader>
              <CardContent>
                {loadingActivityLog ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
                  </div>
                ) : activityLog.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Activity className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">No recent activity to display</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[300px] overflow-y-auto">
                    {activityLog.map((activity) => (
                      <div
                        key={activity.id}
                        className="flex items-center gap-3 p-2 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                      >
                        <div className={cn(
                          'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0',
                          activity.category === 'command' && 'bg-blue-100 dark:bg-blue-900',
                          activity.category === 'reminder' && 'bg-yellow-100 dark:bg-yellow-900',
                          activity.category === 'call' && 'bg-green-100 dark:bg-green-900',
                          activity.category === 'system' && 'bg-gray-100 dark:bg-gray-800',
                        )}>
                          {activity.category === 'command' && <MessageSquare className="w-4 h-4 text-blue-600 dark:text-blue-400" />}
                          {activity.category === 'reminder' && <Bell className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />}
                          {activity.category === 'call' && <Phone className="w-4 h-4 text-green-600 dark:text-green-400" />}
                          {activity.category === 'system' && <Settings className="w-4 h-4 text-gray-600 dark:text-gray-400" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{activity.action}</p>
                          <p className="text-xs text-muted-foreground truncate">{activity.description}</p>
                        </div>
                        <span className="text-xs text-muted-foreground flex-shrink-0">
                          {new Date(activity.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Reminders Tab */}
          <TabsContent value="reminders" className="mt-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Reminders & Medications</CardTitle>
                  <CardDescription>Manage patient reminders</CardDescription>
                </div>
                <Button size="sm" onClick={() => setNewReminder(true)}>
                  <Plus className="w-4 h-4 mr-1" /> Add
                </Button>
              </CardHeader>
              <CardContent>
                {reminders.length === 0 && !newReminder ? (
                  <p className="text-center text-muted-foreground py-8">
                    No reminders set. Add one to get started!
                  </p>
                ) : (
                  <div className="space-y-3">
                    {newReminder && (
                      <ReminderForm
                        onSave={saveReminder}
                        onCancel={() => setNewReminder(false)}
                      />
                    )}
                    {reminders.map((reminder) =>
                      editingReminder?.id === reminder.id ? (
                        <ReminderForm
                          key={reminder.id}
                          reminder={reminder}
                          onSave={saveReminder}
                          onCancel={() => setEditingReminder(null)}
                        />
                      ) : (
                        <div
                          key={reminder.id}
                          className="flex items-center justify-between p-3 border rounded-lg"
                        >
                          <div className="flex items-center gap-3">
                            {reminder.reminder_type === 'medication' ? (
                              <Pill className="w-5 h-5 text-blue-500" />
                            ) : (
                              <Bell className="w-5 h-5 text-yellow-500" />
                            )}
                            <div>
                              <p className="font-medium">{reminder.title}</p>
                              <p className="text-xs text-muted-foreground">
                                {reminder.frequency} • {new Date(reminder.scheduled_time).toLocaleString()}
                              </p>
                            </div>
                          </div>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setEditingReminder(reminder)}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => deleteReminder(reminder.id)}
                            >
                              <Trash2 className="w-4 h-4 text-red-500" />
                            </Button>
                          </div>
                        </div>
                      )
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Contacts Tab */}
          <TabsContent value="contacts" className="mt-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Emergency Contacts</CardTitle>
                  <CardDescription>People Claire can call for help</CardDescription>
                </div>
                <Button size="sm" onClick={() => setNewContact(true)}>
                  <Plus className="w-4 h-4 mr-1" /> Add
                </Button>
              </CardHeader>
              <CardContent>
                {contacts.length === 0 && !newContact ? (
                  <p className="text-center text-muted-foreground py-8">
                    No emergency contacts set. Add one!
                  </p>
                ) : (
                  <div className="space-y-3">
                    {newContact && (
                      <ContactForm
                        onSave={saveContact}
                        onCancel={() => setNewContact(false)}
                      />
                    )}
                    {contacts.map((contact) =>
                      editingContact?.id === contact.id ? (
                        <ContactForm
                          key={contact.id}
                          contact={contact}
                          onSave={saveContact}
                          onCancel={() => setEditingContact(null)}
                        />
                      ) : (
                        <div
                          key={contact.id}
                          className="flex items-center justify-between p-3 border rounded-lg"
                        >
                          <div className="flex items-center gap-3">
                            <User className="w-5 h-5 text-blue-500" />
                            <div>
                              <p className="font-medium">{contact.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {contact.relationship} • {contact.phone}
                              </p>
                            </div>
                            {contact.isEmergency && (
                              <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded">
                                Emergency
                              </span>
                            )}
                          </div>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setEditingContact(contact)}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => deleteContact(contact.id)}
                            >
                              <Trash2 className="w-4 h-4 text-red-500" />
                            </Button>
                          </div>
                        </div>
                      )
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Settings Tab */}
          <TabsContent value="settings" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Patient Preferences</CardTitle>
                <CardDescription>Configure how Claire interacts with the patient</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Wake Word Sensitivity</label>
                  <select
                    className="w-full px-3 py-2 border rounded-md"
                    value={patientSettings.wake_word_sensitivity}
                    onChange={(e) => setPatientSettings({ ...patientSettings, wake_word_sensitivity: e.target.value })}
                  >
                    <option value="low">Low (louder voice needed)</option>
                    <option value="medium">Medium (balanced)</option>
                    <option value="high">High (more sensitive)</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Voice Speed</label>
                  <select
                    className="w-full px-3 py-2 border rounded-md"
                    value={patientSettings.voice_speed}
                    onChange={(e) => setPatientSettings({ ...patientSettings, voice_speed: e.target.value })}
                  >
                    <option value="slow">Slow</option>
                    <option value="normal">Normal</option>
                    <option value="fast">Fast</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Auto-Answer Calls From Family</label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      className="w-4 h-4 rounded"
                      checked={patientSettings.auto_answer_family_calls}
                      onChange={(e) => setPatientSettings({ ...patientSettings, auto_answer_family_calls: e.target.checked })}
                    />
                    <span className="text-sm">Automatically answer after 10 seconds</span>
                  </label>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Quiet Hours</label>
                  <div className="flex gap-2">
                    <Input
                      type="time"
                      value={patientSettings.quiet_hours_start}
                      onChange={(e) => setPatientSettings({ ...patientSettings, quiet_hours_start: e.target.value })}
                      className="flex-1"
                    />
                    <span className="flex items-center text-muted-foreground">to</span>
                    <Input
                      type="time"
                      value={patientSettings.quiet_hours_end}
                      onChange={(e) => setPatientSettings({ ...patientSettings, quiet_hours_end: e.target.value })}
                      className="flex-1"
                    />
                  </div>
                </div>

                <Button
                  className="w-full mt-4"
                  onClick={savePatientSettings}
                  disabled={savingSettings}
                >
                  {savingSettings ? 'Saving...' : 'Save Preferences'}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

// Reminder Form Component
function ReminderForm({
  reminder,
  onSave,
  onCancel,
}: {
  reminder?: Reminder;
  onSave: (reminder: Partial<Reminder>) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    id: reminder?.id || '',
    title: reminder?.title || '',
    description: reminder?.description || '',
    reminder_type: reminder?.reminder_type || 'medication',
    scheduled_time: reminder?.scheduled_time || new Date().toISOString().slice(0, 16),
    frequency: reminder?.frequency || 'daily',
    is_active: reminder?.is_active ?? true,
  });

  return (
    <div className="p-4 border rounded-lg bg-muted/50 space-y-3">
      <Input
        placeholder="Reminder title"
        value={form.title}
        onChange={(e) => setForm({ ...form, title: e.target.value })}
      />
      <Input
        placeholder="Description (optional)"
        value={form.description}
        onChange={(e) => setForm({ ...form, description: e.target.value })}
      />
      <div className="grid grid-cols-2 gap-2">
        <select
          className="px-3 py-2 border rounded-md text-sm"
          value={form.reminder_type}
          onChange={(e) => setForm({ ...form, reminder_type: e.target.value as 'medication' | 'appointment' | 'vital_check' | 'other' })}
        >
          <option value="medication">Medication</option>
          <option value="appointment">Appointment</option>
          <option value="vital_check">Vital Check</option>
          <option value="other">Other</option>
        </select>
        <select
          className="px-3 py-2 border rounded-md text-sm"
          value={form.frequency}
          onChange={(e) => setForm({ ...form, frequency: e.target.value as 'once' | 'daily' | 'weekly' | 'monthly' })}
        >
          <option value="once">Once</option>
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
        </select>
      </div>
      <Input
        type="datetime-local"
        value={form.scheduled_time}
        onChange={(e) => setForm({ ...form, scheduled_time: e.target.value })}
      />
      <div className="flex gap-2 justify-end">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          <X className="w-4 h-4 mr-1" /> Cancel
        </Button>
        <Button size="sm" onClick={() => onSave(form)}>
          <Save className="w-4 h-4 mr-1" /> Save
        </Button>
      </div>
    </div>
  );
}

// Contact Form Component
function ContactForm({
  contact,
  onSave,
  onCancel,
}: {
  contact?: EmergencyContact;
  onSave: (contact: EmergencyContact) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    id: contact?.id || '',
    name: contact?.name || '',
    relationship: contact?.relationship || '',
    phone: contact?.phone || '',
    isEmergency: contact?.isEmergency ?? false,
  });

  return (
    <div className="p-4 border rounded-lg bg-muted/50 space-y-3">
      <Input
        placeholder="Contact name"
        value={form.name}
        onChange={(e) => setForm({ ...form, name: e.target.value })}
      />
      <Input
        placeholder="Relationship (e.g., Daughter)"
        value={form.relationship}
        onChange={(e) => setForm({ ...form, relationship: e.target.value })}
      />
      <Input
        placeholder="Phone number"
        value={form.phone}
        onChange={(e) => setForm({ ...form, phone: e.target.value })}
      />
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={form.isEmergency}
          onChange={(e) => setForm({ ...form, isEmergency: e.target.checked })}
        />
        <span className="text-sm">Mark as emergency contact</span>
      </label>
      <div className="flex gap-2 justify-end">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          <X className="w-4 h-4 mr-1" /> Cancel
        </Button>
        <Button size="sm" onClick={() => onSave(form as EmergencyContact)}>
          <Save className="w-4 h-4 mr-1" /> Save
        </Button>
      </div>
    </div>
  );
}
