import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Video, Users, ClipboardList, LogOut, Lock, Phone } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { api } from '@/lib/api';

interface GuardianAccount {
  id: string;
  username: string;
  email: string;
  name: string;
  role: 'guardian' | 'caregiver' | 'doctor';
  patientsManaged: string[];
  canViewVideo: boolean;
  canEditHealth: boolean;
  lastLogin?: string;
}

interface PatientInfo {
  id: string;
  name: string;
  email?: string;
  medical_history?: string;
  age?: number;
}

interface GuardianDashboardProps {
  onLogout?: () => void;
  initialAccount?: GuardianAccount;
}

export function GuardianDashboard({ onLogout, initialAccount }: GuardianDashboardProps) {
  const [isLoggedIn, setIsLoggedIn] = useState(!!initialAccount);
  const [currentAccount, setCurrentAccount] = useState<GuardianAccount | null>(initialAccount || null);
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [selectedPatient, setSelectedPatient] = useState<string>('');
  const [patientData, setPatientData] = useState<Record<string, unknown>>(null);
  const [patientDetails, setPatientDetails] = useState<PatientInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [videoCallActive, setVideoCallActive] = useState(false);
  const [callDuration, setCallDuration] = useState(0);

  const { toast } = useToast();

  // Handle video call timer
  useEffect(() => {
    if (!videoCallActive) return;
    const interval = setInterval(() => {
      setCallDuration((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [videoCallActive]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // Simulate login - in production, this would call an authentication endpoint
      const mockAccount: GuardianAccount = {
        id: 'guardian-' + Date.now(),
        username: loginForm.username,
        email: loginForm.username + '@example.com',
        name: capitalizeFirst(loginForm.username),
        role: 'guardian',
        patientsManaged: ['patient-1', 'patient-2'],
        canViewVideo: true,
        canEditHealth: true,
        lastLogin: new Date().toISOString(),
      };

      setCurrentAccount(mockAccount);
      setIsLoggedIn(true);

      toast({
        title: 'Login Successful',
        description: `Welcome back, ${mockAccount.name}!`,
      });
    } catch (error) {
      toast({
        title: 'Login Failed',
        description: 'Invalid credentials',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleLoadPatientData = async () => {
    if (!selectedPatient) {
      toast({
        title: 'Error',
        description: 'Please select a patient',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    try {
      const response = await api.get('/api/user-profile');
      setPatientData(response.profile);
    } catch (error) {
      // Use mock data if API fails
      setPatientData({
        patient_name: 'John Doe',
        medical_history: 'Type 2 Diabetes, Hypertension',
        medications: ['Metformin 500mg', 'Lisinopril 10mg'],
        allergies: ['Penicillin', 'Shellfish'],
        family_contacts: [],
      });
    } finally {
      setIsLoading(false);
    }
  };

  const startVideoCall = async () => {
    try {
      // Initiate call to patient instead of joining directly
      const response = await fetch('/api/calls/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          initiator_id: currentAccount?.id,
          initiator_name: currentAccount?.name,
          initiator_role: currentAccount?.role,
          patient_id: selectedPatient,
          call_type: 'video'
        })
      });

      if (!response.ok) {
        throw new Error('Failed to initiate call');
      }

      const data = await response.json();
      
      // Guardian joins the call room immediately
      await api.sendCommand({ 
        intent: 'join_call', 
        slots: { room: data.room_id } 
      });
      
      setVideoCallActive(true);
      setCallDuration(0);

      toast({
        title: 'Video Call Initiated',
        description: 'Calling patient... Waiting for answer...',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to initiate call',
        variant: 'destructive',
      });
    }
  };

  const callPatientDirectly = async (patientId: string, patientName: string) => {
    try {
      // Send command to initiate call
      await api.sendCommand({
        intent: 'call_contact',
        slots: {
          contact_name: patientName,
          video_call: true
        }
      });

      // Initiate call via API
      const response = await fetch('/api/calls/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          initiator_id: currentAccount?.id,
          initiator_name: currentAccount?.name,
          initiator_role: currentAccount?.role,
          patient_id: patientId,
          call_type: 'video'
        })
      });

      if (!response.ok) {
        throw new Error('Failed to initiate call');
      }

      const data = await response.json();
      
      // Join the call room
      await api.sendCommand({ 
        intent: 'join_call', 
        slots: { room: data.room_id } 
      });
      
      setVideoCallActive(true);
      setCallDuration(0);

      toast({
        title: 'Video Call Initiated',
        description: `Calling ${patientName}...`,
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to initiate call',
        variant: 'destructive',
      });
    }
  };

  const endVideoCall = async () => {
    try {
      await api.sendCommand({ intent: 'end_call' });
      setVideoCallActive(false);

      toast({
        title: 'Video Call Ended',
        description: `Call duration: ${Math.floor(callDuration / 60)}m ${callDuration % 60}s`,
      });
    } catch (error) {
      console.error('Error ending call:', error);
    }
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    setCurrentAccount(null);
    setLoginForm({ username: '', password: '' });
    setSelectedPatient('');
    setPatientData(null);

    if (onLogout) {
      onLogout();
    }

    toast({
      title: 'Logged Out',
      description: 'You have been logged out successfully',
    });
  };

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen w-full bg-gradient-to-br from-primary/5 to-primary/10 flex items-center justify-center p-4">
        <Card className="w-full max-w-md shadow-lg">
          <CardHeader className="text-center">
            <Lock className="w-8 h-8 mx-auto mb-2 text-primary" />
            <CardTitle className="text-2xl">Guardian Portal</CardTitle>
            <CardDescription>Secure access to patient care interface</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Username</label>
                <Input
                  placeholder="Enter your username"
                  value={loginForm.username}
                  onChange={(e) => setLoginForm((prev) => ({ ...prev, username: e.target.value }))}
                  disabled={isLoading}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Password</label>
                <Input
                  type="password"
                  placeholder="Enter your password"
                  value={loginForm.password}
                  onChange={(e) => setLoginForm((prev) => ({ ...prev, password: e.target.value }))}
                  disabled={isLoading}
                />
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={isLoading || !loginForm.username}
              >
                {isLoading ? 'Logging in...' : 'Login'}
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                Demo: Use any username (password not checked)
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="w-full space-y-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground">
            Guardian Dashboard
          </h1>
          <p className="text-sm md:text-base text-muted-foreground mt-1">
            Welcome, <span className="font-semibold">{currentAccount?.name}</span> ({currentAccount?.role})
          </p>
        </div>
        <Button variant="outline" onClick={handleLogout} className="self-start sm:self-auto">
          <LogOut className="w-4 h-4 mr-2" /> Logout
        </Button>
      </div>

      {/* Patient Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Users className="w-5 h-5" />
            Select Patient
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="text-sm font-medium">Managed Patients</label>
              <div className="flex flex-col gap-2">
                {currentAccount?.patientsManaged.map((patient) => (
                  <div key={patient} className="flex items-center gap-2">
                    <Button
                      variant={selectedPatient === patient ? 'default' : 'outline'}
                      className="justify-start flex-1 text-left"
                      onClick={() => setSelectedPatient(patient)}
                    >
                      {patient === 'patient-1' ? 'John Doe' : 'Jane Smith'}
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => callPatientDirectly(patient, patient === 'patient-1' ? 'John Doe' : 'Jane Smith')}
                      className="flex items-center gap-1"
                      title="Call this patient"
                    >
                      <Phone className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            {selectedPatient && (
              <Button
                onClick={handleLoadPatientData}
                disabled={isLoading}
                className="self-end"
              >
                {isLoading ? 'Loading...' : 'Load Patient Info'}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Tabs for Guardian Functions */}
      <Tabs defaultValue="health" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="health">Health Data</TabsTrigger>
          <TabsTrigger value="video">Video Call</TabsTrigger>
          <TabsTrigger value="reminders">Reminders</TabsTrigger>
        </TabsList>

        {/* Health Data Tab */}
        <TabsContent value="health" className="space-y-4">
          {selectedPatient && patientData ? (
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Patient Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Patient Name</p>
                    <p className="text-lg font-semibold">{patientData.patient_name}</p>
                  </div>
                  {patientData.medical_history && (
                    <div>
                      <p className="text-sm text-muted-foreground">Medical History</p>
                      <p className="text-base">{patientData.medical_history}</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {patientData.medications && patientData.medications.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Current Medications</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {patientData.medications.map((med: string) => (
                        <li key={med} className="flex items-center gap-2 text-sm">
                          <span className="w-2 h-2 rounded-full bg-primary" />
                          {med}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}

              {patientData.allergies && patientData.allergies.length > 0 && (
                <Card className="border-red-200 dark:border-red-800">
                  <CardHeader>
                    <CardTitle className="text-base text-red-600">Allergies</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {patientData.allergies.map((allergy: string) => (
                        <li key={allergy} className="flex items-center gap-2 text-sm font-semibold text-red-600">
                          ⚠️ {allergy}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}
            </div>
          ) : (
            <Card>
              <CardContent className="pt-6">
                <p className="text-center text-muted-foreground">
                  {!selectedPatient
                    ? 'Select a patient to view information'
                    : 'Click "Load Patient Info" to fetch data'}
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Video Call Tab */}
        <TabsContent value="video" className="space-y-4">
          {!currentAccount?.canViewVideo ? (
            <Card>
              <CardContent className="pt-6">
                <p className="text-center text-muted-foreground">
                  You do not have permission to access video calls
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Video className="w-5 h-5" />
                  Video Conference
                </CardTitle>
                <CardDescription>Start a secure video call with the patient</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {videoCallActive ? (
                  <div className="space-y-4 p-4 bg-muted rounded-lg">
                    <div className="text-center">
                      <p className="text-2xl font-bold text-primary">
                        {Math.floor(callDuration / 60)}:{String(callDuration % 60).padStart(2, '0')}
                      </p>
                      <p className="text-sm text-muted-foreground">Call Duration</p>
                    </div>
                    <div className="w-full aspect-video bg-black rounded-lg flex items-center justify-center">
                      <p className="text-white text-sm">Video Stream (WebRTC)</p>
                    </div>
                    <Button
                      onClick={endVideoCall}
                      variant="destructive"
                      className="w-full"
                    >
                      End Call
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      {selectedPatient
                        ? 'Ready to start a video call with the patient'
                        : 'Select a patient first'}
                    </p>
                    <Button
                      onClick={startVideoCall}
                      disabled={!selectedPatient || isLoading}
                      className="w-full"
                      size="lg"
                    >
                      <Video className="w-4 h-4 mr-2" />
                      Start Video Call
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Reminders Tab */}
        <TabsContent value="reminders" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <ClipboardList className="w-5 h-5" />
                Patient Reminders
              </CardTitle>
              <CardDescription>Monitor patient medications and appointments</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Reminders are being managed through the patient's device. Check in regularly to ensure compliance.
              </p>
              {patientData?.medications && (
                <div className="mt-4 space-y-2">
                  <p className="text-sm font-semibold">Active Medications to Monitor:</p>
                  <ul className="space-y-1">
                    {patientData.medications.slice(0, 3).map((med: string) => (
                      <li key={med} className="text-sm text-muted-foreground">
                        • {med}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function capitalizeFirst(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
