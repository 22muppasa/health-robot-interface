import { useState, useEffect, useCallback } from 'react';
import { Phone, Video, User, PhoneOff, Loader2, Search, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface Contact {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  relationship: string;
  type: string;
  is_video_capable: boolean;
}

interface ContactCallPanelProps {
  onCallStarted?: (roomId: string, contactName: string) => void;
  onCallEnded?: () => void;
  className?: string;
}

export function ContactCallPanel({
  onCallStarted,
  onCallEnded,
  className,
}: ContactCallPanelProps) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [callingContactId, setCallingContactId] = useState<string | null>(null);
  const [activeCallId, setActiveCallId] = useState<string | null>(null);
  const { toast } = useToast();

  // Load contacts on mount
  useEffect(() => {
    loadContacts();
  }, []);

  const loadContacts = async () => {
    try {
      // Try to load contacts from user profile
      const profileResponse = await api.get('/api/user-profile');
      const profile = profileResponse.profile || {};
      
      const contactsList: Contact[] = [];
      
      // Add family contacts
      if (profile.family_contacts) {
        profile.family_contacts.forEach((c: { name: string; phone: string; relationship?: string }, index: number) => {
          contactsList.push({
            id: `family-${index}`,
            name: c.name,
            phone: c.phone,
            relationship: c.relationship || 'family',
            type: 'family',
            is_video_capable: true,
          });
        });
      }
      
      // Add emergency contacts
      if (profile.emergency_contacts) {
        profile.emergency_contacts.forEach((c: { name: string; phone: string; relationship?: string }, index: number) => {
          contactsList.push({
            id: `emergency-${index}`,
            name: c.name,
            phone: c.phone,
            relationship: c.relationship || 'emergency',
            type: 'emergency',
            is_video_capable: true,
          });
        });
      }

      // Also try to load from contacts API
      try {
        const contactsResponse = await api.get('/api/contacts');
        if (contactsResponse.contacts) {
          contactsResponse.contacts.forEach((c: { id: string; name: string; phone: string; email?: string; relationship?: string; type?: string; is_video_capable?: boolean }) => {
            // Avoid duplicates
            if (!contactsList.find(existing => existing.name === c.name)) {
              contactsList.push({
                id: c.id,
                name: c.name,
                phone: c.phone,
                email: c.email,
                relationship: c.relationship || 'other',
                type: c.type || 'family',
                is_video_capable: c.is_video_capable !== false,
              });
            }
          });
        }
      } catch (e) {
        // Contacts API might not have data, that's okay
      }
      
      setContacts(contactsList);
    } catch (error) {
      console.error('Failed to load contacts:', error);
    }
  };

  const initiateCall = async (contact: Contact) => {
    if (callingContactId) return; // Already calling someone
    
    setCallingContactId(contact.id);
    setIsLoading(true);
    
    try {
      // Generate a unique room ID for this call
      const roomId = `call-${Date.now()}-${contact.name.toLowerCase().replace(/\s+/g, '-')}`;
      
      // First, initiate the call via the calls API
      const callResponse = await fetch('/api/calls/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          initiator_id: 'patient-self',
          initiator_name: 'Patient',
          initiator_role: 'Patient',
          patient_id: contact.id, // The contact we're calling
          call_type: 'video',
        }),
      });

      if (!callResponse.ok) {
        throw new Error('Failed to initiate call');
      }

      const callData = await callResponse.json();
      setActiveCallId(callData.call_id);

      // Also send a voice command to trigger Claire's response
      await api.sendCommand({
        intent: 'call_contact',
        slots: { 
          contact_name: contact.name,
          video_call: contact.is_video_capable,
        },
      });

      toast({
        title: 'Calling...',
        description: `Video calling ${contact.name}`,
      });

      // Notify parent component
      onCallStarted?.(callData.room_id, contact.name);

    } catch (error) {
      console.error('Failed to initiate call:', error);
      toast({
        title: 'Call Failed',
        description: `Could not call ${contact.name}. Please try again.`,
        variant: 'destructive',
      });
      setCallingContactId(null);
    } finally {
      setIsLoading(false);
    }
  };

  const endCall = async () => {
    if (!activeCallId) return;

    try {
      await fetch('/api/calls/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          call_id: activeCallId,
          patient_id: 'patient-self',
        }),
      });

      toast({
        title: 'Call Ended',
        description: 'The call has been disconnected.',
      });

      onCallEnded?.();
    } catch (error) {
      console.error('Failed to end call:', error);
    } finally {
      setActiveCallId(null);
      setCallingContactId(null);
    }
  };

  // Filter contacts based on search query
  const filteredContacts = contacts.filter(contact =>
    contact.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    contact.relationship.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Group contacts by type
  const groupedContacts = {
    family: filteredContacts.filter(c => c.type === 'family'),
    emergency: filteredContacts.filter(c => c.type === 'emergency'),
    other: filteredContacts.filter(c => !['family', 'emergency'].includes(c.type)),
  };

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Search Bar */}
      <div className="flex-shrink-0 mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search contacts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Contacts List */}
      <div className="flex-1 overflow-y-auto space-y-4">
        {contacts.length === 0 ? (
          <div className="text-center py-8">
            <User className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No contacts added yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Add contacts in the Patient Dashboard
            </p>
          </div>
        ) : (
          <>
            {/* Family Contacts */}
            {groupedContacts.family.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
                  <User className="w-4 h-4" />
                  Family
                </h3>
                {groupedContacts.family.map((contact) => (
                  <ContactCard
                    key={contact.id}
                    contact={contact}
                    isCalling={callingContactId === contact.id}
                    onCall={() => initiateCall(contact)}
                    onEndCall={endCall}
                    disabled={callingContactId !== null && callingContactId !== contact.id}
                  />
                ))}
              </div>
            )}

            {/* Emergency Contacts */}
            {groupedContacts.emergency.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-red-600 flex items-center gap-2">
                  <Phone className="w-4 h-4" />
                  Emergency
                </h3>
                {groupedContacts.emergency.map((contact) => (
                  <ContactCard
                    key={contact.id}
                    contact={contact}
                    isCalling={callingContactId === contact.id}
                    onCall={() => initiateCall(contact)}
                    onEndCall={endCall}
                    disabled={callingContactId !== null && callingContactId !== contact.id}
                    isEmergency
                  />
                ))}
              </div>
            )}

            {/* Other Contacts */}
            {groupedContacts.other.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
                  <User className="w-4 h-4" />
                  Other Contacts
                </h3>
                {groupedContacts.other.map((contact) => (
                  <ContactCard
                    key={contact.id}
                    contact={contact}
                    isCalling={callingContactId === contact.id}
                    onCall={() => initiateCall(contact)}
                    onEndCall={endCall}
                    disabled={callingContactId !== null && callingContactId !== contact.id}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Voice Tip */}
      <div className="flex-shrink-0 mt-4 p-3 bg-primary/5 rounded-lg border border-primary/20">
        <p className="text-xs text-center text-muted-foreground">
          <span className="font-semibold text-primary">Tip:</span> Say "Claire, call [name]" to start a video call
        </p>
      </div>
    </div>
  );
}

// Contact Card Component
interface ContactCardProps {
  contact: Contact;
  isCalling: boolean;
  onCall: () => void;
  onEndCall: () => void;
  disabled?: boolean;
  isEmergency?: boolean;
}

function ContactCard({
  contact,
  isCalling,
  onCall,
  onEndCall,
  disabled,
  isEmergency,
}: ContactCardProps) {
  return (
    <div
      className={cn(
        'flex items-center justify-between p-3 rounded-lg border transition-all',
        isCalling
          ? 'bg-green-50 dark:bg-green-950 border-green-300 dark:border-green-700'
          : isEmergency
            ? 'bg-red-50/50 dark:bg-red-950/50 border-red-200 dark:border-red-800'
            : 'bg-card border-border hover:border-primary/50',
        disabled && !isCalling && 'opacity-50'
      )}
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className={cn(
          'w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0',
          isEmergency ? 'bg-red-100 dark:bg-red-900' : 'bg-primary/10'
        )}>
          <User className={cn(
            'w-5 h-5',
            isEmergency ? 'text-red-600 dark:text-red-400' : 'text-primary'
          )} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-medium text-sm truncate">{contact.name}</p>
          <p className="text-xs text-muted-foreground truncate">
            {contact.relationship}
            {contact.phone && ` • ${contact.phone}`}
          </p>
        </div>
      </div>

      <div className="flex-shrink-0 ml-2">
        {isCalling ? (
          <Button
            variant="destructive"
            size="sm"
            onClick={onEndCall}
            className="gap-1"
          >
            <PhoneOff className="w-4 h-4" />
            <span className="hidden sm:inline">End</span>
          </Button>
        ) : (
          <Button
            variant={isEmergency ? 'destructive' : 'default'}
            size="sm"
            onClick={onCall}
            disabled={disabled}
            className="gap-1"
          >
            {disabled ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : contact.is_video_capable ? (
              <Video className="w-4 h-4" />
            ) : (
              <Phone className="w-4 h-4" />
            )}
            <span className="hidden sm:inline">
              {contact.is_video_capable ? 'Video' : 'Call'}
            </span>
          </Button>
        )}
      </div>
    </div>
  );
}
