import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, Phone, AlertCircle, Plus, Trash2, Home, Pill, AlertTriangle } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { api } from '@/lib/api';
import { QuickCallPanel } from './QuickCallPanel';
import { ResponsiveLayout } from './ResponsiveLayout';
import { cn } from '@/lib/utils';

interface FamilyContact {
  id: string;
  name: string;
  relationship: string;
  phone: string;
  email?: string;
}

interface DashboardData {
  patient_name: string;
  family_contacts: FamilyContact[];
  emergency_contacts: FamilyContact[];
  medical_history?: string;
  medications: string[];
  allergies: string[];
}

export function UnifiedDashboard() {
  const [dashboardData, setDashboardData] = useState<DashboardData>({
    patient_name: '',
    family_contacts: [],
    emergency_contacts: [],
    medical_history: '',
    medications: [],
    allergies: [],
  });

  const [newContact, setNewContact] = useState<Partial<FamilyContact>>({
    name: '',
    relationship: '',
    phone: '',
    email: '',
  });

  const [newMedication, setNewMedication] = useState('');
  const [newAllergy, setNewAllergy] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const { toast } = useToast();

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
      await api.post('/api/user-profile', dashboardData);
      toast({
        title: 'Success',
        description: 'Information saved successfully',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to save information',
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
        description: 'Please fill in name and phone',
        variant: 'destructive',
      });
      return;
    }

    const contact = {
      ...newContact,
      id: Date.now().toString(),
    } as FamilyContact;

    if (type === 'family') {
      setDashboardData((prev) => ({
        ...prev,
        family_contacts: [...prev.family_contacts, contact],
      }));
    } else {
      setDashboardData((prev) => ({
        ...prev,
        emergency_contacts: [...prev.emergency_contacts, contact],
      }));
    }

    setNewContact({ name: '', relationship: '', phone: '', email: '' });
    toast({ title: 'Success', description: 'Contact added' });
  };

  const removeContact = (type: 'family' | 'emergency', id: string) => {
    if (type === 'family') {
      setDashboardData((prev) => ({
        ...prev,
        family_contacts: prev.family_contacts.filter((c) => c.id !== id),
      }));
    } else {
      setDashboardData((prev) => ({
        ...prev,
        emergency_contacts: prev.emergency_contacts.filter((c) => c.id !== id),
      }));
    }
  };

  const addMedication = () => {
    if (newMedication.trim()) {
      setDashboardData((prev) => ({
        ...prev,
        medications: [...prev.medications, newMedication],
      }));
      setNewMedication('');
    }
  };

  const removeMedication = (med: string) => {
    setDashboardData((prev) => ({
      ...prev,
      medications: prev.medications.filter((m) => m !== med),
    }));
  };

  const addAllergy = () => {
    if (newAllergy.trim()) {
      setDashboardData((prev) => ({
        ...prev,
        allergies: [...prev.allergies, newAllergy],
      }));
      setNewAllergy('');
    }
  };

  const removeAllergy = (allergy: string) => {
    setDashboardData((prev) => ({
      ...prev,
      allergies: prev.allergies.filter((a) => a !== allergy),
    }));
  };

  return (
    <ResponsiveLayout
      headerTitle={dashboardData.patient_name ? `${dashboardData.patient_name}'s Dashboard` : 'Dashboard'}
      isFullScreen={false}
    >
      <div className="w-full h-full overflow-hidden flex flex-col">
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="w-full h-full flex flex-col"
        >
          {/* Tab Navigation - Fixed at top */}
          <TabsList className="w-full rounded-none border-b border-border flex gap-1 overflow-x-auto no-scrollbar flex-shrink-0 bg-muted/50 p-2">
            <TabsTrigger value="overview" className="flex items-center text-xs sm:text-sm px-2 py-1 rounded-md whitespace-nowrap">
              <Home className="w-4 h-4 mr-2" />
              <span>Overview</span>
            </TabsTrigger>
            <TabsTrigger value="family" className="flex items-center text-xs sm:text-sm px-2 py-1 rounded-md whitespace-nowrap">
              <Users className="w-4 h-4 mr-2" />
              <span>Family</span>
            </TabsTrigger>
            <TabsTrigger value="emergency" className="flex items-center text-xs sm:text-sm px-2 py-1 rounded-md whitespace-nowrap">
              <AlertTriangle className="w-4 h-4 mr-2" />
              <span>Emergency</span>
            </TabsTrigger>
            <TabsTrigger value="medical" className="flex items-center text-xs sm:text-sm px-2 py-1 rounded-md whitespace-nowrap">
              <Pill className="w-4 h-4 mr-2" />
              <span>Medical</span>
            </TabsTrigger>
            <TabsTrigger value="actions" className="flex items-center text-xs sm:text-sm px-2 py-1 rounded-md whitespace-nowrap">
              <Phone className="w-4 h-4 mr-2" />
              <span>Actions</span>
            </TabsTrigger>
          </TabsList>

          {/* Content Area - Scrollable */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            {/* Overview Tab */}
            <TabsContent value="overview" className="m-0 p-3 sm:p-4 h-full">
              <div className="space-y-4 max-w-4xl mx-auto w-full">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg">Patient Information</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <label className="text-xs sm:text-sm font-medium">Patient Name</label>
                      <Input
                        placeholder="Enter name"
                        value={dashboardData.patient_name}
                        onChange={(e) =>
                          setDashboardData((p) => ({ ...p, patient_name: e.target.value }))
                        }
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <label className="text-xs sm:text-sm font-medium">Medical History</label>
                      <textarea
                        className="w-full px-3 py-2 border border-input rounded-md text-xs sm:text-sm bg-background mt-1"
                        placeholder="Enter medical history..."
                        rows={3}
                        value={dashboardData.medical_history || ''}
                        onChange={(e) =>
                          setDashboardData((p) => ({ ...p, medical_history: e.target.value }))
                        }
                      />
                    </div>
                  </CardContent>
                </Card>

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
                        description: 'Call disconnected',
                      });
                    }}
                  />
                )}

                <Button
                  onClick={handleSaveProfile}
                  disabled={isLoading}
                  className="w-full"
                >
                  Save Information
                </Button>
              </div>
            </TabsContent>

            {/* Family Contacts Tab */}
            <TabsContent value="family" className="m-0 p-3 sm:p-4 h-full">
              <div className="space-y-3 max-w-4xl mx-auto w-full">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg">Family Contacts</CardTitle>
                    <CardDescription className="text-xs">Add and manage family members</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {/* Add Contact Form */}
                    <div className="space-y-2 p-3 bg-muted rounded-lg">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <Input
                          placeholder="Name"
                          value={newContact.name || ''}
                          onChange={(e) =>
                            setNewContact((p) => ({ ...p, name: e.target.value }))
                          }
                          size={1}
                          className="text-xs"
                        />
                        <Input
                          placeholder="Relationship"
                          value={newContact.relationship || ''}
                          onChange={(e) =>
                            setNewContact((p) => ({ ...p, relationship: e.target.value }))
                          }
                          size={1}
                          className="text-xs"
                        />
                        <Input
                          placeholder="Phone"
                          value={newContact.phone || ''}
                          onChange={(e) =>
                            setNewContact((p) => ({ ...p, phone: e.target.value }))
                          }
                          size={1}
                          className="text-xs"
                        />
                        <Input
                          placeholder="Email (optional)"
                          value={newContact.email || ''}
                          onChange={(e) =>
                            setNewContact((p) => ({ ...p, email: e.target.value }))
                          }
                          size={1}
                          className="text-xs"
                        />
                      </div>
                      <Button
                        onClick={() => addContact('family')}
                        size="sm"
                        className="w-full text-xs"
                      >
                        <Plus className="w-3 h-3 mr-1" /> Add Contact
                      </Button>
                    </div>

                    {/* Contacts List */}
                    <div className="space-y-2">
                      {dashboardData.family_contacts.map((contact) => (
                        <div
                          key={contact.id}
                          className="p-2 bg-muted rounded-lg flex items-center justify-between text-xs sm:text-sm"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="font-medium truncate">{contact.name}</p>
                            <p className="text-muted-foreground text-xs truncate">
                              {contact.relationship} • {contact.phone}
                            </p>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeContact('family', contact.id)}
                            className="flex-shrink-0"
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* Emergency Contacts Tab */}
            <TabsContent value="emergency" className="m-0 p-3 sm:p-4 h-full">
              <div className="space-y-3 max-w-4xl mx-auto w-full">
                <Card className="border-red-200 bg-red-50/50 dark:bg-red-950/20 dark:border-red-900">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <AlertCircle className="w-5 h-5 text-red-600" />
                      Emergency Contacts
                    </CardTitle>
                    <CardDescription className="text-xs">Critical contacts to reach</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {/* Add Contact Form */}
                    <div className="space-y-2 p-3 bg-muted rounded-lg">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <Input
                          placeholder="Name"
                          value={newContact.name || ''}
                          onChange={(e) =>
                            setNewContact((p) => ({ ...p, name: e.target.value }))
                          }
                          className="text-xs"
                        />
                        <Input
                          placeholder="Relationship"
                          value={newContact.relationship || ''}
                          onChange={(e) =>
                            setNewContact((p) => ({ ...p, relationship: e.target.value }))
                          }
                          className="text-xs"
                        />
                        <Input
                          placeholder="Phone"
                          value={newContact.phone || ''}
                          onChange={(e) =>
                            setNewContact((p) => ({ ...p, phone: e.target.value }))
                          }
                          className="text-xs"
                        />
                      </div>
                      <Button
                        onClick={() => addContact('emergency')}
                        size="sm"
                        className="w-full text-xs bg-red-600 hover:bg-red-700"
                      >
                        <Plus className="w-3 h-3 mr-1" /> Add Emergency Contact
                      </Button>
                    </div>

                    {/* Contacts List */}
                    <div className="space-y-2">
                      {dashboardData.emergency_contacts.map((contact) => (
                        <div
                          key={contact.id}
                          className="p-2 bg-red-100/50 dark:bg-red-900/30 rounded-lg flex items-center justify-between text-xs sm:text-sm border border-red-200 dark:border-red-900"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="font-medium truncate">{contact.name}</p>
                            <p className="text-muted-foreground text-xs truncate">
                              {contact.relationship} • {contact.phone}
                            </p>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeContact('emergency', contact.id)}
                            className="flex-shrink-0"
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* Medical Tab */}
            <TabsContent value="medical" className="m-0 p-3 sm:p-4 h-full">
              <div className="space-y-3 max-w-4xl mx-auto w-full">
                {/* Medications */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg">Medications</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <Input
                          placeholder="Add medication..."
                          value={newMedication}
                          onChange={(e) => setNewMedication(e.target.value)}
                          onKeyPress={(e) => e.key === 'Enter' && addMedication()}
                          className="text-xs"
                        />
                        <Button onClick={addMedication} size="sm">
                          <Plus className="w-3 h-3" />
                        </Button>
                      </div>
                      <div className="space-y-1">
                        {dashboardData.medications.map((med) => (
                          <div
                            key={med}
                            className="p-2 bg-muted rounded text-xs sm:text-sm flex items-center justify-between"
                          >
                            <span>{med}</span>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => removeMedication(med)}
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Allergies */}
                <Card className="border-amber-200 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-900">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg">Allergies</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <Input
                          placeholder="Add allergy..."
                          value={newAllergy}
                          onChange={(e) => setNewAllergy(e.target.value)}
                          onKeyPress={(e) => e.key === 'Enter' && addAllergy()}
                          className="text-xs"
                        />
                        <Button onClick={addAllergy} size="sm" className="bg-amber-600 hover:bg-amber-700">
                          <Plus className="w-3 h-3" />
                        </Button>
                      </div>
                      <div className="space-y-1">
                        {dashboardData.allergies.map((allergy) => (
                          <div
                            key={allergy}
                            className="p-2 bg-amber-100/50 dark:bg-amber-900/30 rounded text-xs sm:text-sm flex items-center justify-between border border-amber-200 dark:border-amber-900"
                          >
                            <span>{allergy}</span>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => removeAllergy(allergy)}
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* Actions Tab */}
            <TabsContent value="actions" className="m-0 p-3 sm:p-4 h-full">
              <div className="space-y-3 max-w-4xl mx-auto w-full">
                {dashboardData.patient_name && (
                  <QuickCallPanel
                    patientId="patient-1"
                    patientName={dashboardData.patient_name}
                    guardianId={`guardian-${Math.random().toString(36).substring(7)}`}
                    guardianName="Family Member"
                  />
                )}
              </div>
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </ResponsiveLayout>
  );
}
