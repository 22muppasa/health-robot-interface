import { useState } from 'react';
import { Video, Phone, PhoneOff, Mic, MicOff, VideoOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatusIndicator } from '@/components/StatusIndicator';
import { CallStatus, api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface VideoConferenceProps {
  callStatus: CallStatus;
  onStatusChange?: (status: CallStatus) => void;
}

const callStateLabels: Record<CallStatus['state'], string> = {
  not_in_call: 'Not in Call',
  connecting: 'Connecting...',
  in_call: 'In Call',
};

const callStateStatus: Record<CallStatus['state'], 'muted' | 'warning' | 'success'> = {
  not_in_call: 'muted',
  connecting: 'warning',
  in_call: 'success',
};

export function VideoConference({ callStatus, onStatusChange }: VideoConferenceProps) {
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleJoinCall = async () => {
    setIsLoading(true);
    try {
      onStatusChange?.({ state: 'connecting' });
      await api.joinCall('default-room');
      onStatusChange?.({ state: 'in_call', roomId: 'default-room' });
    } catch (error) {
      console.error('Failed to join call:', error);
      onStatusChange?.({ state: 'not_in_call' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleEndCall = async () => {
    setIsLoading(true);
    try {
      await api.endCall();
      onStatusChange?.({ state: 'not_in_call' });
      setIsMuted(false);
      setIsVideoOff(false);
    } catch (error) {
      console.error('Failed to end call:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const isInCall = callStatus.state === 'in_call';
  const isConnecting = callStatus.state === 'connecting';

  return (
    <div className="dashboard-card flex flex-col h-full">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Video className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">Video Conference</h2>
        </div>
        <StatusIndicator
          status={callStateStatus[callStatus.state]}
          label={callStateLabels[callStatus.state]}
          pulse={isConnecting}
        />
      </div>

      {/* Video Area */}
      <div
        className={cn(
          'flex-1 min-h-[280px] rounded-xl flex items-center justify-center mb-4 transition-colors',
          isInCall ? 'bg-foreground/5' : 'bg-muted'
        )}
      >
        {isInCall ? (
          <div className="text-center">
            <div className="w-24 h-24 rounded-full bg-primary/20 flex items-center justify-center mx-auto mb-3">
              <Video className="w-10 h-10 text-primary" />
            </div>
            <p className="text-muted-foreground">Video feed active</p>
            {callStatus.participantCount && (
              <p className="text-sm text-muted-foreground mt-1">
                {callStatus.participantCount} participant{callStatus.participantCount !== 1 ? 's' : ''}
              </p>
            )}
          </div>
        ) : (
          <div className="text-center">
            <VideoOff className="w-16 h-16 text-muted-foreground/50 mx-auto mb-3" />
            <p className="text-muted-foreground">No active call</p>
          </div>
        )}
      </div>

      {/* Call Controls */}
      <div className="flex items-center justify-center gap-4">
        {!isInCall ? (
          <Button
            variant="action"
            size="touch"
            onClick={handleJoinCall}
            disabled={isLoading || isConnecting}
            className="flex-1 max-w-[200px]"
          >
            <Phone className="w-5 h-5" />
            {isConnecting ? 'Connecting...' : 'Join Call'}
          </Button>
        ) : (
          <>
            <Button
              variant={isMuted ? 'destructive' : 'secondary'}
              size="icon-lg"
              onClick={() => setIsMuted(!isMuted)}
            >
              {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
            </Button>

            <Button
              variant="destructive"
              size="touch"
              onClick={handleEndCall}
              disabled={isLoading}
            >
              <PhoneOff className="w-5 h-5" />
              End Call
            </Button>

            <Button
              variant={isVideoOff ? 'destructive' : 'secondary'}
              size="icon-lg"
              onClick={() => setIsVideoOff(!isVideoOff)}
            >
              {isVideoOff ? <VideoOff className="w-6 h-6" /> : <Video className="w-6 h-6" />}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
