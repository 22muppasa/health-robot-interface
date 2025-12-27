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
      await api.sendCommand({ intent: 'join_call', slots: { room: 'nurse-station' } });
      onStatusChange?.({ state: 'in_call', roomId: 'nurse-station' });
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
      await api.sendCommand({ intent: 'end_call' });
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
      <div className="flex items-center justify-between mb-3 sm:mb-4 gap-2 min-w-0">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <Video className="w-4 h-4 sm:w-5 sm:h-5 text-primary flex-shrink-0" />
          <h2 className="text-base sm:text-lg font-semibold text-foreground truncate">Video Conference</h2>
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
          'flex-1 min-h-[200px] sm:min-h-[280px] rounded-lg sm:rounded-xl flex items-center justify-center mb-3 sm:mb-4 transition-colors',
          isInCall ? 'bg-foreground/5' : 'bg-muted'
        )}
      >
        {isInCall ? (
          <div className="text-center px-4">
            <div className="w-16 h-16 sm:w-24 sm:h-24 rounded-full bg-primary/20 flex items-center justify-center mx-auto mb-2 sm:mb-3">
              <Video className="w-8 h-8 sm:w-10 sm:h-10 text-primary" />
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground">Video feed active</p>
            {callStatus.participantCount && (
              <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                {callStatus.participantCount} participant{callStatus.participantCount !== 1 ? 's' : ''}
              </p>
            )}
          </div>
        ) : (
          <div className="text-center px-4">
            <VideoOff className="w-10 h-10 sm:w-16 sm:h-16 text-muted-foreground/50 mx-auto mb-2 sm:mb-3" />
            <p className="text-xs sm:text-sm text-muted-foreground">No active call</p>
          </div>
        )}
      </div>

      {/* Call Controls */}
      <div className="flex items-center justify-center gap-2 sm:gap-3 md:gap-4 flex-wrap">
        {!isInCall ? (
          <Button
            variant="action"
            size="touch"
            onClick={handleJoinCall}
            disabled={isLoading || isConnecting}
            className="flex-1 min-w-[120px] max-w-[200px] text-xs sm:text-sm"
          >
            <Phone className="w-4 h-4 sm:w-5 sm:h-5" />
            {isConnecting ? 'Connecting...' : 'Join Call'}
          </Button>
        ) : (
          <>
            <Button
              variant={isMuted ? 'destructive' : 'secondary'}
              size="icon-lg"
              onClick={async () => {
                const intent = isMuted ? 'unmute_call' : 'mute_call';
                try {
                  await api.sendCommand({ intent });
                  setIsMuted(!isMuted);
                } catch (error) {
                  console.error('Failed to toggle mute:', error);
                }
              }}
              className="flex-shrink-0"
            >
              {isMuted ? <MicOff className="w-4 h-4 sm:w-5 sm:h-5" /> : <Mic className="w-4 h-4 sm:w-5 sm:h-5" />}
            </Button>

            <Button
              variant="destructive"
              size="touch"
              onClick={handleEndCall}
              disabled={isLoading}
              className="flex-1 min-w-[100px] text-xs sm:text-sm"
            >
              <PhoneOff className="w-4 h-4 sm:w-5 sm:h-5" />
              End Call
            </Button>

            <Button
              variant={isVideoOff ? 'destructive' : 'secondary'}
              size="icon-lg"
              onClick={() => setIsVideoOff(!isVideoOff)}
              className="flex-shrink-0"
            >
              {isVideoOff ? <VideoOff className="w-4 h-4 sm:w-5 sm:h-5" /> : <Video className="w-4 h-4 sm:w-5 sm:h-5" />}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
