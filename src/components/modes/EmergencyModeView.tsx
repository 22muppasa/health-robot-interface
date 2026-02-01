import { useState, useEffect } from 'react';
import { Phone, AlertTriangle, Heart, UserRound, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';

interface EmergencyModeViewProps {
  claireState: 'idle' | 'listening' | 'thinking' | 'speaking';
  isWakeWordActive?: boolean;
  onCallContact?: (name: string) => void;
  onBackToDashboard?: () => void;
}

interface Contact {
  id: string;
  name: string;
  relationship?: string;
  phone?: string;
  contact_type?: string;
}

export function EmergencyModeView({ claireState, isWakeWordActive = true, onCallContact, onBackToDashboard }: EmergencyModeViewProps) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [calling, setCalling] = useState<string | null>(null);

  // Fetch emergency contacts
  useEffect(() => {
    const fetchContacts = async () => {
      try {
        const res = await fetch('/api/contacts');
        if (res.ok) {
          const data = await res.json();
          // Filter to show emergency and key family contacts
          const emergencyContacts = (data.contacts || []).filter(
            (c: Contact) => c.contact_type === 'emergency' || 
                         c.relationship === 'nurse' || 
                         c.relationship === 'doctor'
          );
          const familyContacts = (data.contacts || []).filter(
            (c: Contact) => c.contact_type === 'family'
          ).slice(0, 2);
          setContacts([...emergencyContacts, ...familyContacts]);
        }
      } catch (e) {
        console.error('Failed to fetch contacts:', e);
      }
    };
    fetchContacts();
  }, []);

  const handleCall = async (contact: Contact) => {
    setCalling(contact.id);
    try {
      await api.post('/api/text-command', { text: `Call ${contact.name}` });
      onCallContact?.(contact.name);
    } catch (e) {
      console.error('Call failed:', e);
    } finally {
      setTimeout(() => setCalling(null), 3000);
    }
  };

  const handleEmergency = async () => {
    setCalling('emergency');
    try {
      await api.post('/api/text-command', { text: 'Emergency help' });
    } catch (e) {
      console.error('Emergency call failed:', e);
    } finally {
      setTimeout(() => setCalling(null), 3000);
    }
  };

  const handleCallNurse = async () => {
    setCalling('nurse');
    try {
      await api.post('/api/text-command', { text: 'Call nurse' });
      onCallContact?.('Nurse');
    } catch (e) {
      console.error('Nurse call failed:', e);
    } finally {
      setTimeout(() => setCalling(null), 3000);
    }
  };

  return (
    <div className="w-full h-full bg-gradient-to-b from-red-950 to-gray-900 flex flex-col items-center justify-center p-6 gap-6">
      {/* Back to Dashboard button */}
      <Button
        onClick={onBackToDashboard}
        variant="ghost"
        size="sm"
        className="absolute top-6 left-6 text-white/50 hover:text-white hover:bg-white/10 z-10"
      >
        <Home className="w-5 h-5 mr-2" />
        Dashboard
      </Button>

      {/* Header */}
      <div className="flex items-center gap-3 text-white">
        <AlertTriangle className="w-8 h-8 text-red-400" />
        <h1 className="text-2xl font-bold">Emergency Mode</h1>
      </div>

      {/* Main Emergency Button */}
      <Button
        onClick={handleEmergency}
        disabled={calling === 'emergency'}
        className="w-full max-w-md h-24 text-2xl bg-red-600 hover:bg-red-700 text-white rounded-2xl shadow-lg shadow-red-900/50 flex items-center justify-center gap-4"
      >
        {calling === 'emergency' ? (
          <>
            <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
            Calling Emergency...
          </>
        ) : (
          <>
            <AlertTriangle className="w-8 h-8" />
            EMERGENCY HELP
          </>
        )}
      </Button>

      {/* Call Nurse Button */}
      <Button
        onClick={handleCallNurse}
        disabled={calling === 'nurse'}
        className="w-full max-w-md h-20 text-xl bg-blue-600 hover:bg-blue-700 text-white rounded-2xl shadow-lg flex items-center justify-center gap-4"
      >
        {calling === 'nurse' ? (
          <>
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            Calling Nurse...
          </>
        ) : (
          <>
            <Heart className="w-7 h-7" />
            Call Nurse Station
          </>
        )}
      </Button>

      {/* Quick Contact Buttons */}
      {contacts.length > 0 && (
        <div className="w-full max-w-md space-y-3 mt-4">
          <p className="text-white/60 text-sm text-center">Quick Contacts</p>
          <div className="grid grid-cols-2 gap-3">
            {contacts.slice(0, 4).map((contact) => (
              <Button
                key={contact.id}
                onClick={() => handleCall(contact)}
                disabled={calling === contact.id}
                variant="outline"
                className="h-16 bg-white/10 border-white/20 text-white hover:bg-white/20 rounded-xl flex flex-col items-center justify-center gap-1"
              >
                {calling === contact.id ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <UserRound className="w-5 h-5" />
                    <span className="text-sm truncate w-full text-center">{contact.name}</span>
                  </>
                )}
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* Claire status indicator */}
      {claireState !== 'idle' && (
        <div className="absolute bottom-8 flex items-center gap-3 px-4 py-2 bg-white/10 backdrop-blur-sm rounded-full">
          <div className="w-8 h-8 bg-pink-200 rounded-full flex items-center justify-center text-lg">
            😊
          </div>
          <span className="text-white text-sm">
            {claireState === 'listening' ? 'Listening...' : claireState === 'speaking' ? 'Speaking...' : 'Thinking...'}
          </span>
        </div>
      )}

      {/* Voice hint */}
      {claireState === 'idle' && (
        <div className="absolute bottom-8 flex items-center gap-2 text-white/40 text-sm">
          <div className={`w-2 h-2 rounded-full ${isWakeWordActive ? 'bg-green-500 animate-pulse' : 'bg-gray-500'}`} />
          <span>{isWakeWordActive ? 'Say "Claire, call [name]" for hands-free calling' : 'Voice inactive'}</span>
        </div>
      )}
    </div>
  );
}
