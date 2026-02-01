import { useState, useEffect } from 'react';
import { Phone, PhoneOff, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';

interface QuickCallPanelProps {
  patientId: string;
  patientName: string;
  guardianId: string;
  guardianName: string;
  onCallInitiated?: (callId: string) => void;
  onCallEnded?: () => void;
  isConnected?: boolean;
}

export function QuickCallPanel({
  patientId,
  patientName,
  guardianId,
  guardianName,
  onCallInitiated,
  onCallEnded,
  isConnected = false,
}: QuickCallPanelProps) {
  const [isCallActive, setIsCallActive] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentCallId, setCurrentCallId] = useState<string | null>(null);
  const { toast } = useToast();

  const initiateCall = async () => {
    setIsLoading(true);
    try {
      // Step 1: Initiate call from guardian to patient
      const response = await fetch('/api/calls/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          initiator_id: guardianId,
          initiator_name: guardianName,
          initiator_role: 'Guardian',
          patient_id: patientId,
          call_type: 'video',
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to initiate call: ${response.status}`);
      }

      const data = await response.json();
      const callId = data.call_id;
      const roomId = data.room_id;

      setCurrentCallId(callId);
      setIsCallActive(true);

      // Step 2: Guardian joins the video room
      const joinResponse = await fetch('/api/video/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room_id: roomId }),
      });

      if (!joinResponse.ok) {
        throw new Error('Failed to join video room');
      }

      const joinData = await joinResponse.json();
      const participantId = joinData.participant_id;

      toast({
        title: 'Call Initiated',
        description: `Calling ${patientName}...`,
      });

      onCallInitiated?.(callId);
    } catch (error) {
      console.error('Failed to initiate call:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to initiate call',
        variant: 'destructive',
      });
      setIsCallActive(false);
      setCurrentCallId(null);
    } finally {
      setIsLoading(false);
    }
  };

  const endCall = async () => {
    setIsLoading(true);
    try {
      if (currentCallId) {
        // End call via API
        await fetch('/api/calls/reject', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            call_id: currentCallId,
            patient_id: patientId,
          }),
        });
      }

      setIsCallActive(false);
      setCurrentCallId(null);

      toast({
        title: 'Call Ended',
        description: 'The call has been disconnected.',
      });

      onCallEnded?.();
    } catch (error) {
      console.error('Failed to end call:', error);
      toast({
        title: 'Error',
        description: 'Failed to end call',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={cn(
      'p-4 rounded-lg border-2 transition-all',
      isCallActive
        ? 'bg-green-50 border-green-300 dark:bg-green-950 dark:border-green-700'
        : 'bg-card border-border'
    )}>
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="font-semibold text-lg">
            {isCallActive ? `In call with ${patientName}` : `Call ${patientName}`}
          </h3>
          <p className={cn(
            'text-sm',
            isCallActive ? 'text-green-700 dark:text-green-300' : 'text-muted-foreground'
          )}>
            {isCallActive ? 'Connected • Tap to end call' : 'Ready to call'}
          </p>
        </div>

        <Button
          onClick={isCallActive ? endCall : initiateCall}
          disabled={isLoading}
          size="lg"
          className={cn(
            'gap-2',
            isCallActive
              ? 'bg-red-600 hover:bg-red-700 text-white'
              : 'bg-green-600 hover:bg-green-700 text-white'
          )}
        >
          {isLoading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              {isCallActive ? 'Ending...' : 'Calling...'}
            </>
          ) : isCallActive ? (
            <>
              <PhoneOff className="w-5 h-5" />
              End Call
            </>
          ) : (
            <>
              <Phone className="w-5 h-5" />
              Call Now
            </>
          )}
        </Button>
      </div>

      {/* Call status indicator */}
      {isCallActive && (
        <div className="mt-3 pt-3 border-t border-green-200 dark:border-green-800">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-green-600 rounded-full animate-pulse"></div>
            <span className="text-sm text-green-700 dark:text-green-300">
              Call in progress
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
