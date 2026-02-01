import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, Phone, AlertCircle, Plus, Trash2, Video, Heart, Activity, Calendar } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { api, CallStatus } from '@/lib/api';
import { QuickCallPanel } from './QuickCallPanel';
import { VideoConference } from './VideoConference';
import { Link } from 'react-router-dom';

interface FamilyContact {
  id: string;
  name: string;
  relationship: string;
  phone: string;
  email?: string;
  notes?: string;
}

interface DashboardData {
  patient_name: string;
  family_contacts: FamilyContact[];
  emergency_contacts: FamilyContact[];
  medical_history?: string;
  medications: string[];
  allergies: string[];
}

export function FamilyDashboard() {
  const [dashboardData, setDashboardData] = useState<DashboardData>({
    patient_name: '',
    family_contacts: [],
    emergency_contacts: [],
    medical_history: '',
    medications: [],
    allergies: [],
  });

  const [callStatus, setCallStatus] = useState<CallStatus>({
    state: 'not_in_call',
  });

  const [showVideoConference, setShowVideoConference] = useState(false);

  const [newContact, setNewContact] = useState<Partial<FamilyContact>>({
    name: '',
    relationship: '',
    phone: '',
    email: '',
  });

  const [newMedication, setNewMedication] = useState('');
  const [newAllergy, setNewAllergy] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  // Load existing profile on mount
  useEffect(() => {
    const loadProfile = async () => {
      try {
        const response = await api.get('/api/user-profile');
        if (response.profile) {
          setDashboardData((prev) => ({ ...prev, ...response.profile }));
        }
      } catch (error) {
        console.error('Failed to load profile:', error);
      }
    };
    loadProfile();
  }, []);

  const handleSaveProfile = async () => {
    setIsLoading(true);
    try {
      await api.post('/api/user-profile', dashboardData as unknown as Record<string, unknown>);
      toast({
        title: 'Success',
        description: 'Family dashboard information saved successfully',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to save profile information',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const addContact = (type: 'family' | 'emergency') => {
    if (!newContact.name || !newContact.phone) {
      toast({
        title: 'Error',
        description: 'Please fill in name and phone number',
        variant: 'destructive',
      });
      return;
    }

    const contactWithId = {
      ...newContact,
      id: Date.now().toString(),
    } as FamilyContact;

    if (type === 'family') {
      setDashboardData((prev) => ({
        ...prev,
        family_contacts: [...prev.family_contacts, contactWithId],
      }));
    } else {
      setDashboardData((prev) => ({
        ...prev,
        emergency_contacts: [...prev.emergency_contacts, contactWithId],
      }));
    }

    setNewContact({ name: '', relationship: '', phone: '', email: '' });

    toast({
      title: 'Success',
      description: 'Contact added successfully',
    });
  };

  const removeContact = (type: 'family' | 'emergency', contactId: string) => {
    if (type === 'family') {
      setDashboardData((prev) => ({
        ...prev,
        family_contacts: prev.family_contacts.filter((c) => c.id !== contactId),
      }));
    } else {
      setDashboardData((prev) => ({
        ...prev,
        emergency_contacts: prev.emergency_contacts.filter((c) => c.id !== contactId),
      }));
    }
  };

  const addMedication = () => {
    if (!newMedication.trim()) return;
    setDashboardData((prev) => ({
      ...prev,
      medications: [...prev.medications, newMedication],
    }));
    setNewMedication('');
  };

  const removeMedication = (med: string) => {
    setDashboardData((prev) => ({
      ...prev,
      medications: prev.medications.filter((m) => m !== med),
    }));
  };

  const addAllergy = () => {
    if (!newAllergy.trim()) return;
    setDashboardData((prev) => ({
      ...prev,
      allergies: [...prev.allergies, newAllergy],
    }));
    setNewAllergy('');
  };

  const removeAllergy = (allergy: string) => {
    setDashboardData((prev) => ({
      ...prev,
      allergies: prev.allergies.filter((a) => a !== allergy),
    }));
  };

  return (
    <div className="w-full space-y-6 p-4 md:p-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-foreground flex items-center gap-2">
          <Users className="w-6 h-6 md:w-8 md:h-8" />
          Family & Medical Information
        </h1>
        <p className="text-sm md:text-base text-muted-foreground mt-1">
          Manage family contacts and medical information for {dashboardData.patient_name || 'the patient'}
        </p>
      </div>

      {/* Quick Call Panel */}
      {dashboardData.patient_name && (
        <QuickCallPanel
          patientId="patient-1"
          patientName={dashboardData.patient_name}
          guardianId={`guardian-${Math.random().toString(36).substring(7)}`}
          guardianName="Family Member"
          onCallInitiated={() => {
            toast({
              title: 'Call Initiated',
              description: 'Call sent to patient',
            });
          }}
          onCallEnded={() => {
            toast({
              title: 'Call Ended',
              description: 'The call has been disconnected.',
            });
          }}
        />
      )}

      {/* Patient Name Section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg md:text-xl">Patient Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Patient Name</label>
            <Input
              placeholder="Enter patient name"
              value={dashboardData.patient_name}
              onChange={(e) =>
                setDashboardData((prev) => ({ ...prev, patient_name: e.target.value }))
              }
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Medical History</label>
            <textarea
              className="w-full px-3 py-2 border border-input rounded-md text-sm bg-background"
              placeholder="Enter relevant medical history..."
              rows={4}
              value={dashboardData.medical_history || ''}
              onChange={(e) =>
                setDashboardData((prev) => ({ ...prev, medical_history: e.target.value }))
              }
            />
          </div>
        </CardContent>
      </Card>

      {/* Tabs for different sections */}
      <Tabs defaultValue="family" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="family">Family</TabsTrigger>
          <TabsTrigger value="emergency">Emergency</TabsTrigger>
          <TabsTrigger value="medical">Medical</TabsTrigger>
        </TabsList>

        {/* Family Contacts Tab */}
        <TabsContent value="family" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Family Contacts</CardTitle>
              <CardDescription>Add and manage family member contacts</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Add New Contact Form */}
              <div className="space-y-3 p-4 bg-muted rounded-lg">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Input
                    placeholder="Name"
                    value={newContact.name || ''}
                    onChange={(e) => setNewContact((prev) => ({ ...prev, name: e.target.value }))}
                  />
                  <Input
                    placeholder="Relationship (Parent, Child, etc.)"
                    value={newContact.relationship || ''}
                    onChange={(e) =>
                      setNewContact((prev) => ({ ...prev, relationship: e.target.value }))
                    }
                  />
                  <Input
                    placeholder="Phone Number"
                    value={newContact.phone || ''}
                    onChange={(e) => setNewContact((prev) => ({ ...prev, phone: e.target.value }))}
                  />
                  <Input
                    placeholder="Email (optional)"
                    value={newContact.email || ''}
                    onChange={(e) => setNewContact((prev) => ({ ...prev, email: e.target.value }))}
                  />
                </div>
                <Button
                  onClick={() => addContact('family')}
                  className="w-full"
                  variant="outline"
                >
                  <Plus className="w-4 h-4 mr-2" /> Add Family Contact
                </Button>
              </div>

              {/* List of Family Contacts */}
              <div className="space-y-2">
                {dashboardData.family_contacts.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic">No family contacts added yet</p>
                ) : (
                  dashboardData.family_contacts.map((contact) => (
                    <div
                      key={contact.id}
                      className="flex items-center justify-between p-3 bg-muted rounded-lg"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{contact.name}</p>
                        <p className="text-sm text-muted-foreground truncate">
                          {contact.relationship} • {contact.phone}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeContact('family', contact.id)}
                        className="ml-2 flex-shrink-0"
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Emergency Contacts Tab */}
        <TabsContent value="emergency" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <AlertCircle className="w-5 h-5" />
                Emergency Contacts
              </CardTitle>
              <CardDescription>Add emergency contact information</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Add New Emergency Contact Form */}
              <div className="space-y-3 p-4 bg-muted rounded-lg">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Input
                    placeholder="Name"
                    value={newContact.name || ''}
                    onChange={(e) => setNewContact((prev) => ({ ...prev, name: e.target.value }))}
                  />
                  <Input
                    placeholder="Relationship"
                    value={newContact.relationship || ''}
                    onChange={(e) =>
                      setNewContact((prev) => ({ ...prev, relationship: e.target.value }))
                    }
                  />
                  <Input
                    placeholder="Phone Number"
                    value={newContact.phone || ''}
                    onChange={(e) => setNewContact((prev) => ({ ...prev, phone: e.target.value }))}
                  />
                  <Input
                    placeholder="Email (optional)"
                    value={newContact.email || ''}
                    onChange={(e) => setNewContact((prev) => ({ ...prev, email: e.target.value }))}
                  />
                </div>
                <Button
                  onClick={() => addContact('emergency')}
                  className="w-full"
                  variant="outline"
                >
                  <Plus className="w-4 h-4 mr-2" /> Add Emergency Contact
                </Button>
              </div>

              {/* List of Emergency Contacts */}
              <div className="space-y-2">
                {dashboardData.emergency_contacts.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic">No emergency contacts added yet</p>
                ) : (
                  dashboardData.emergency_contacts.map((contact) => (
                    <div
                      key={contact.id}
                      className="flex items-center justify-between p-3 bg-muted rounded-lg border border-destructive/30"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{contact.name}</p>
                        <p className="text-sm text-muted-foreground truncate">
                          {contact.relationship} • <Phone className="w-3 h-3 inline" /> {contact.phone}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeContact('emergency', contact.id)}
                        className="ml-2 flex-shrink-0"
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Medical Information Tab */}
        <TabsContent value="medical" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Medications</CardTitle>
              <CardDescription>Current medications and dosages</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Input
                  placeholder="Add medication (e.g., Aspirin 100mg daily)"
                  value={newMedication}
                  onChange={(e) => setNewMedication(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && addMedication()}
                />
                <Button onClick={addMedication} variant="outline">
                  <Plus className="w-4 h-4" />
                </Button>
              </div>

              <div className="space-y-2">
                {dashboardData.medications.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic">No medications added</p>
                ) : (
                  dashboardData.medications.map((med) => (
                    <div
                      key={med}
                      className="flex items-center justify-between p-3 bg-muted rounded-lg"
                    >
                      <p className="text-sm">{med}</p>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeMedication(med)}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Allergies</CardTitle>
              <CardDescription>Known allergies and intolerances</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Input
                  placeholder="Add allergy (e.g., Penicillin)"
                  value={newAllergy}
                  onChange={(e) => setNewAllergy(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && addAllergy()}
                />
                <Button onClick={addAllergy} variant="outline">
                  <Plus className="w-4 h-4" />
                </Button>
              </div>

              <div className="space-y-2">
                {dashboardData.allergies.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic">No allergies recorded</p>
                ) : (
                  dashboardData.allergies.map((allergy) => (
                    <div
                      key={allergy}
                      className="flex items-center justify-between p-3 bg-red-50 dark:bg-red-950 rounded-lg border border-red-200 dark:border-red-800"
                    >
                      <p className="text-sm font-medium">{allergy}</p>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeAllergy(allergy)}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Save Button */}
      <div className="flex gap-2 justify-end">
        <Button variant="outline" onClick={() => window.history.back()}>
          Back
        </Button>
        <Button onClick={handleSaveProfile} disabled={isLoading} className="px-6">
          {isLoading ? 'Saving...' : 'Save All Information'}
        </Button>
      </div>
    </div>
  );
}
