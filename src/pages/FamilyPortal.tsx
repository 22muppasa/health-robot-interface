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
} from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';

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
  }, [session]);

  // Call duration timer
  useEffect(() => {
    if (callState !== 'in_call') return;
    const interval = setInterval(() => {
      setCallDuration((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [callState]);

  const loadPatientStatus = async () => {
    try {
      // Get patient profile
      const profileRes = await fetch('/api/user-profile');
      const profileData = await profileRes.json();

      // Get robot status for vitals
      const statusRes = await fetch('/api/robot-status');
      const statusData = await statusRes.json();

      setPatientStatus({
        name: profileData.profile?.name || 'Patient',
        isOnline: true, // In a real app, check WebSocket connection
        lastSeen: new Date().toLocaleString(),
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
      // Use mock data
      setPatientStatus({
        name: 'Patient',
        isOnline: true,
        lastSeen: new Date().toLocaleString(),
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
    setCallState('calling');

    try {
      const callId = `call-${Date.now()}`;
      const newRoomId = `family-call-${callId}`;
      setRoomId(newRoomId);

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

      if (!response.ok) throw new Error('Failed to initiate call');

      const callData = await response.json();
      setRoomId(callData.room_id);

      toast({
        title: 'Calling...',
        description: 'Claire will announce your call to the patient',
      });

      // Poll for answer
      pollCallStatus(callData.call_id);
    } catch (error) {
      console.error('Failed to initiate call:', error);
      toast({
        title: 'Call Failed',
        description: 'Could not reach the patient',
        variant: 'destructive',
      });
      setCallState('idle');
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

    toast({
      title: 'Call Ended',
      description: `Duration: ${Math.floor(callDuration / 60)}m ${callDuration % 60}s`,
    });

    setCallState('idle');
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
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div
                  className={cn(
                    'w-16 h-16 rounded-full flex items-center justify-center',
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
                </div>
                <div>
                  <h2 className="text-xl font-bold">{patientStatus?.name}</h2>
                  <div className="flex items-center gap-2 mt-1">
                    <div
                      className={cn(
                        'w-2 h-2 rounded-full',
                        patientStatus?.isOnline ? 'bg-green-500' : 'bg-gray-400'
                      )}
                    />
                    <span className="text-sm text-muted-foreground">
                      {patientStatus?.isOnline ? 'Online' : 'Offline'}
                    </span>
                  </div>
                </div>
              </div>

              <Button size="lg" onClick={initiateCall} disabled={!patientStatus?.isOnline} className="gap-2">
                <Video className="w-5 h-5" />
                Call Now
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Main Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid grid-cols-5 w-full">
            <TabsTrigger value="call" className="gap-1">
              <Phone className="w-4 h-4" />
              <span className="hidden sm:inline">Call</span>
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

          {/* Status Tab */}
          <TabsContent value="status" className="mt-4">
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
                  <select className="w-full px-3 py-2 border rounded-md">
                    <option value="low">Low (louder voice needed)</option>
                    <option value="medium" selected>Medium (balanced)</option>
                    <option value="high">High (more sensitive)</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Voice Speed</label>
                  <select className="w-full px-3 py-2 border rounded-md">
                    <option value="slow">Slow</option>
                    <option value="normal" selected>Normal</option>
                    <option value="fast">Fast</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Auto-Answer Calls From Family</label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" className="w-4 h-4 rounded" />
                    <span className="text-sm">Automatically answer after 10 seconds</span>
                  </label>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Quiet Hours</label>
                  <div className="flex gap-2">
                    <Input type="time" defaultValue="22:00" className="flex-1" />
                    <span className="flex items-center text-muted-foreground">to</span>
                    <Input type="time" defaultValue="08:00" className="flex-1" />
                  </div>
                </div>

                <Button className="w-full mt-4">Save Preferences</Button>
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
