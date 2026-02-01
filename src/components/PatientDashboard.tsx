import { useState, useEffect } from 'react';
import { Bell, User, Heart, Pill, AlertTriangle, Phone, Calendar, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { useToast } from '@/components/ui/use-toast';

interface Reminder {
  id: string;
  title: string;
  description: string;
  reminder_type: string;
  scheduled_time: string;
  frequency: string;
  status: string;
  metadata?: Record<string, unknown>;
}

interface Contact {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  relationship: string;
  type: string;  // family, emergency, etc
  is_video_capable: boolean;
}

interface Guardian {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: string;
}

interface UserProfile {
  patient_name?: string;
  family_contacts?: { name: string; phone: string; relationship?: string }[];
  medical_history?: string;
  emergency_contacts?: { name: string; phone: string; relationship?: string }[];
  medications?: string[];
  allergies?: string[];
  [key: string]: unknown;
}

export function PatientDashboard() {
  const [activeTab, setActiveTab] = useState('profile');
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [profile, setProfile] = useState<UserProfile>({});
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [guardians, setGuardians] = useState<Guardian[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [currentPatientId] = useState<string | null>(() => {
    return localStorage.getItem('patientId') || null;
  });
  const { toast } = useToast();

  // Reminder form state
  const [reminderForm, setReminderForm] = useState({
    title: '',
    description: '',
    reminder_type: 'medication',
    scheduled_time: '',
    frequency: 'once'
  });

  // Profile form state
  const [profileForm, setProfileForm] = useState<UserProfile>({});

  useEffect(() => {
    loadReminders();
    loadProfile();
    loadContacts();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPatientId]);

  const loadReminders = async () => {
    try {
      const response = await api.get('/api/reminders');
      setReminders(response.reminders || []);
    } catch (error) {
      console.error('Failed to load reminders:', error);
    }
  };

  const loadProfile = async () => {
    try {
      const response = await api.get('/api/user-profile');
      setProfile(response.profile || {});
      setProfileForm(response.profile || {});
    } catch (error) {
      console.error('Failed to load profile:', error);
    }
  };

  const loadContacts = async () => {
    try {
      // Try to load contacts from the backend if patient ID is available
      if (currentPatientId) {
        const response = await api.get(`/api/patient/${currentPatientId}/contacts`);
        const contactsInfo = response;
        
        // Combine all contacts
        const allContacts = [
          ...(contactsInfo.all_contacts || []),
          ...(contactsInfo.family_contacts || []),
          ...(contactsInfo.emergency_contacts || [])
        ];
        
        setContacts(allContacts);
        setGuardians(contactsInfo.guardians_as_contacts || []);
      } else if (profile.family_contacts && profile.family_contacts.length > 0) {
        // Fallback: use contacts from profile
        const formattedContacts = profile.family_contacts.map((c) => ({
          id: `family-${c.name}`,
          name: c.name,
          phone: c.phone,
          relationship: 'family',
          type: 'family',
          is_video_capable: true
        }));
        setContacts(formattedContacts);
      }
    } catch (error) {
      console.error('Failed to load contacts:', error);
    }
  };

  const createReminder = async () => {
    if (!reminderForm.title || !reminderForm.scheduled_time) {
      toast({
        title: 'Missing Information',
        description: 'Please fill in title and scheduled time.',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    try {
      await api.post('/api/reminders', reminderForm);
      toast({
        title: 'Reminder Created',
        description: 'The reminder has been scheduled successfully.',
      });
      setReminderForm({
        title: '',
        description: '',
        reminder_type: 'medication',
        scheduled_time: '',
        frequency: 'once'
      });
      loadReminders();
    } catch (error) {
      toast({
        title: 'Failed to Create Reminder',
        description: 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const updateProfile = async () => {
    setIsLoading(true);
    try {
      await api.post('/api/user-profile', profileForm);
      toast({
        title: 'Profile Updated',
        description: 'Patient information has been saved.',
      });
      loadProfile();
    } catch (error) {
      toast({
        title: 'Failed to Update Profile',
        description: 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const callFamilyMember = async (contact: { name: string; phone?: string }) => {
    try {
      // Send call_family command to backend - Index.tsx handles the actual call state
      await api.sendCommand({
        intent: 'call_family',
        slots: { contact_name: contact.name, contact_phone: contact.phone }
      });
      
      toast({
        title: 'Calling Family',
        description: `Starting video call with ${contact.name}...`,
      });
    } catch (error) {
      console.error('Call error:', error);
      toast({
        title: 'Call Failed',
        description: 'Unable to initiate call with family member.',
        variant: 'destructive',
      });
    }
  };

  const callContact = async (contact: Contact) => {
    try {
      // Send call_contact command to backend
      await api.sendCommand({
        intent: 'call_contact',
        slots: { 
          contact_name: contact.name,
          contact_phone: contact.phone,
          video_call: contact.is_video_capable
        }
      });
      
      toast({
        title: 'Calling Contact',
        description: `Starting call with ${contact.name}...`,
      });
    } catch (error) {
      console.error('Call error:', error);
      toast({
        title: 'Call Failed',
        description: `Unable to initiate call with ${contact.name}.`,
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="w-full h-full flex flex-col">
      <div className="flex items-center gap-2 sm:gap-3 px-2 sm:px-3 py-1 sm:py-2 min-w-0 flex-shrink-0 border-b border-border">
        <Heart className="w-4 h-4 sm:w-5 sm:h-5 text-primary flex-shrink-0" />
        <h2 className="text-sm sm:text-base font-semibold text-foreground truncate">Patient Dashboard</h2>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <TabsList className="grid w-full grid-cols-3 flex-shrink-0 rounded-none border-b border-border">
          <TabsTrigger value="profile" className="text-xs sm:text-sm rounded-none">Profile</TabsTrigger>
          <TabsTrigger value="reminders" className="text-xs sm:text-sm rounded-none">Reminders</TabsTrigger>
          <TabsTrigger value="emergency" className="text-xs sm:text-sm rounded-none">Emergency</TabsTrigger>
        </TabsList>

        {/* Profile Tab */}
        <TabsContent value="profile" className="flex-1 min-h-0 m-0 p-2 sm:p-3 overflow-y-auto data-[state=active]:flex data-[state=active]:flex-col">
          <div className="space-y-3 sm:space-y-4">
            <Card className="border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm sm:text-base">Patient Information</CardTitle>
                <CardDescription className="text-xs">Basic patient details and medical history</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium">Patient Name</label>
                    <Input
                      value={profileForm.patient_name || ''}
                      onChange={(e) => setProfileForm({...profileForm, patient_name: e.target.value})}
                      placeholder="Enter patient name"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Medical History</label>
                    <Textarea
                      value={profileForm.medical_history || ''}
                      onChange={(e) => setProfileForm({...profileForm, medical_history: e.target.value})}
                      placeholder="Enter medical history"
                      rows={3}
                    />
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium">Medications</label>
                  <Textarea
                    value={profileForm.medications?.join(', ') || ''}
                    onChange={(e) => setProfileForm({
                      ...profileForm,
                      medications: e.target.value.split(',').map(m => m.trim()).filter(m => m)
                    })}
                    placeholder="Enter medications separated by commas"
                    rows={2}
                  />
                </div>

                <div>
                  <label className="text-sm font-medium">Allergies</label>
                  <Textarea
                    value={profileForm.allergies?.join(', ') || ''}
                    onChange={(e) => setProfileForm({
                      ...profileForm,
                      allergies: e.target.value.split(',').map(a => a.trim()).filter(a => a)
                    })}
                    placeholder="Enter allergies separated by commas"
                    rows={2}
                  />
                </div>

                <Button onClick={updateProfile} disabled={isLoading} className="w-full">
                  {isLoading ? 'Saving...' : 'Save Profile'}
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm sm:text-base">Emergency Contacts</CardTitle>
                <CardDescription>Important contacts for emergencies</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium">Emergency Contacts</label>
                  <Textarea
                    value={profileForm.emergency_contacts?.map(c => `${c.name}: ${c.phone}`).join('\n') || ''}
                    onChange={(e) => {
                      const contacts = e.target.value.split('\n').map(line => {
                        const [name, phone] = line.split(':').map(s => s.trim());
                        return { name, phone };
                      }).filter(c => c.name && c.phone);
                      setProfileForm({...profileForm, emergency_contacts: contacts});
                    }}
                    placeholder="Name: Phone Number (one per line)"
                    rows={3}
                  />
                </div>

                <div>
                  <label className="text-sm font-medium">Family Contacts</label>
                  <Textarea
                    value={profileForm.family_contacts?.map(c => `${c.name}: ${c.phone}`).join('\n') || ''}
                    onChange={(e) => {
                      const contacts = e.target.value.split('\n').map(line => {
                        const [name, phone] = line.split(':').map(s => s.trim());
                        return { name, phone };
                      }).filter(c => c.name && c.phone);
                      setProfileForm({...profileForm, family_contacts: contacts});
                    }}
                    placeholder="Name: Phone Number (one per line)"
                    rows={3}
                  />
                </div>

                <Button onClick={updateProfile} disabled={isLoading} className="w-full">
                  {isLoading ? 'Saving...' : 'Save Contacts'}
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Reminders Tab */}
        <TabsContent value="reminders" className="flex-1 min-h-0 overflow-y-auto m-0 p-3 sm:p-4">
          <div className="space-y-3 sm:space-y-4">
            <Card className="border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm sm:text-base">Create Reminder</CardTitle>
                <CardDescription className="text-xs">Schedule medication, appointment, or other reminders</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 sm:space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium">Title</label>
                    <Input
                      value={reminderForm.title}
                      onChange={(e) => setReminderForm({...reminderForm, title: e.target.value})}
                      placeholder="Reminder title"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Type</label>
                    <Select value={reminderForm.reminder_type} onValueChange={(value) => setReminderForm({...reminderForm, reminder_type: value})}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="medication">Medication</SelectItem>
                        <SelectItem value="appointment">Appointment</SelectItem>
                        <SelectItem value="exercise">Exercise</SelectItem>
                        <SelectItem value="meal">Meal</SelectItem>
                        <SelectItem value="checkup">Check-up</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium">Description</label>
                  <Textarea
                    value={reminderForm.description}
                    onChange={(e) => setReminderForm({...reminderForm, description: e.target.value})}
                    placeholder="Additional details"
                    rows={2}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium">Scheduled Time</label>
                    <Input
                      type="datetime-local"
                      value={reminderForm.scheduled_time}
                      onChange={(e) => setReminderForm({...reminderForm, scheduled_time: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Frequency</label>
                    <Select value={reminderForm.frequency} onValueChange={(value) => setReminderForm({...reminderForm, frequency: value})}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="once">Once</SelectItem>
                        <SelectItem value="daily">Daily</SelectItem>
                        <SelectItem value="weekly">Weekly</SelectItem>
                        <SelectItem value="monthly">Monthly</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Button onClick={createReminder} disabled={isLoading} className="w-full">
                  {isLoading ? 'Creating...' : 'Create Reminder'}
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm sm:text-base">Active Reminders</CardTitle>
                <CardDescription>Scheduled reminders and notifications</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {reminders.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">No reminders scheduled</p>
                  ) : (
                    reminders.map((reminder) => (
                      <div key={reminder.id} className="flex items-center justify-between p-3 border rounded-lg">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <Bell className="w-4 h-4 text-primary" />
                            <span className="font-medium text-sm">{reminder.title}</span>
                            <Badge variant="outline" className="text-xs">
                              {reminder.reminder_type}
                            </Badge>
                          </div>
                          {reminder.description && (
                            <p className="text-xs text-muted-foreground mt-1">{reminder.description}</p>
                          )}
                          <div className="flex items-center gap-2 mt-1">
                            <Clock className="w-3 h-3 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">
                              {new Date(reminder.scheduled_time).toLocaleString()}
                            </span>
                            <Badge variant="secondary" className="text-xs">
                              {reminder.frequency}
                            </Badge>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Emergency Tab */}
        <TabsContent value="emergency" className="flex-1 min-h-0 overflow-y-auto m-0 p-3 sm:p-4">
          <div className="space-y-3 sm:space-y-4">
            {/* All Contacts - From Backend or Profile */}
            {contacts.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm sm:text-base flex items-center gap-2">
                    <Phone className="w-4 h-4" /> All Contacts
                  </CardTitle>
                  <CardDescription>People you can call</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-3">
                    {contacts.map((contact, index) => (
                      <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                        <div>
                          <p className="font-medium text-sm">{contact.name}</p>
                          <p className="text-xs text-muted-foreground">{contact.phone || contact.email}</p>
                          <Badge variant="outline" className="text-xs mt-1">{contact.relationship}</Badge>
                        </div>
                        <Button
                          variant="default"
                          size="sm"
                          onClick={() => callContact(contact)}
                          className="flex items-center gap-2"
                        >
                          <Phone className="w-4 h-4" />
                          {contact.is_video_capable ? 'Video' : 'Call'}
                        </Button>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Guardians */}
            {guardians.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm sm:text-base">Guardians</CardTitle>
                  <CardDescription>Your care team supervisors</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-3">
                    {guardians.map((guardian, index) => (
                      <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                        <div>
                          <p className="font-medium text-sm">{guardian.name}</p>
                          <p className="text-xs text-muted-foreground">{guardian.phone || guardian.email}</p>
                          <Badge variant="secondary" className="text-xs mt-1">{guardian.role}</Badge>
                        </div>
                        <Button
                          variant="default"
                          size="sm"
                          onClick={() => callFamilyMember(guardian)}
                          className="flex items-center gap-2"
                        >
                          <Phone className="w-4 h-4" />
                          Call
                        </Button>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            <Card className="border-destructive/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm sm:text-base text-destructive flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5" />
                  Emergency Contacts
                </CardTitle>
                <CardDescription className="text-xs">Quick access to emergency contacts and services</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 sm:space-y-4">
                <div className="grid gap-3">
                  {profile.emergency_contacts?.map((contact, index) => (
                    <div key={index} className="flex items-center justify-between p-3 border border-destructive/20 rounded-lg">
                      <div>
                        <p className="font-medium text-sm">{contact.name}</p>
                        <p className="text-xs text-muted-foreground">{contact.phone}</p>
                      </div>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => callFamilyMember(contact)}
                        className="flex items-center gap-2"
                      >
                        <Phone className="w-4 h-4" />
                        Call
                      </Button>
                    </div>
                  )) || (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No emergency contacts configured
                    </p>
                  )}
                </div>

                <div className="pt-4 border-t">
                  <Button
                    variant="destructive"
                    className="w-full"
                    size="lg"
                    onClick={() => callFamilyMember({ name: 'Emergency Services', phone: '911' })}
                  >
                    <AlertTriangle className="w-5 h-5 mr-2" />
                    Call Emergency Services (911)
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm sm:text-base">Family Contacts</CardTitle>
                <CardDescription>Regular family and caregiver contacts</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3">
                  {profile.family_contacts?.map((contact, index) => (
                    <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <p className="font-medium text-sm">{contact.name}</p>
                        <p className="text-xs text-muted-foreground">{contact.phone}</p>
                      </div>
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => callFamilyMember(contact)}
                        className="flex items-center gap-2 bg-primary hover:bg-primary/90"
                      >
                        <Phone className="w-4 h-4" />
                        Video Call
                      </Button>
                    </div>
                  )) || (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No family contacts configured
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}