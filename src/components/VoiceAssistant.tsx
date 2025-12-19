import { useState, useCallback } from 'react';
import { MessageSquare, Power, Mic } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface VoiceAssistantProps {
  isEnabled: boolean;
  isListening: boolean;
  lastTranscript: string;
  onToggle: (enabled: boolean) => void;
}

export function VoiceAssistant({
  isEnabled,
  isListening,
  lastTranscript,
  onToggle,
}: VoiceAssistantProps) {
  const [isPushToTalkActive, setIsPushToTalkActive] = useState(false);

  const handleToggle = async (checked: boolean) => {
    try {
      const intent = checked ? 'assistant_enable' : 'assistant_disable';
      await api.sendCommand({ intent });
      onToggle(checked);
    } catch (error) {
      console.error('Failed to toggle voice assistant:', error);
    }
  };

  const handlePushToTalkStart = useCallback(async () => {
    if (!isEnabled) return;
    setIsPushToTalkActive(true);
    try {
      await api.sendCommand({ intent: 'assistant_ptt_start' });
    } catch (error) {
      console.error('Failed to start push-to-talk:', error);
    }
  }, [isEnabled]);

  const handlePushToTalkEnd = useCallback(async () => {
    setIsPushToTalkActive(false);
    try {
      await api.sendCommand({ intent: 'assistant_ptt_stop' });
    } catch (error) {
      console.error('Failed to end push-to-talk:', error);
    }
  }, []);

  return (
    <div className="dashboard-card">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <MessageSquare className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">Voice Assistant</h2>
        </div>

        <div className="flex items-center gap-3">
          <span className={cn('text-sm font-medium', isEnabled ? 'text-success' : 'text-muted-foreground')}>
            {isEnabled ? 'Enabled' : 'Disabled'}
          </span>
          <Switch checked={isEnabled} onCheckedChange={handleToggle} />
        </div>
      </div>

      {/* Push-to-Talk Button */}
      <div className="flex flex-col items-center mb-6">
        <Button
          variant={isPushToTalkActive ? 'default' : 'outline'}
          size="touch-lg"
          className={cn(
            'w-32 h-32 rounded-full flex flex-col gap-2 transition-all',
            isPushToTalkActive && 'ring-4 ring-primary/30 scale-105',
            !isEnabled && 'opacity-50 cursor-not-allowed'
          )}
          disabled={!isEnabled}
          onMouseDown={handlePushToTalkStart}
          onMouseUp={handlePushToTalkEnd}
          onMouseLeave={handlePushToTalkEnd}
          onTouchStart={handlePushToTalkStart}
          onTouchEnd={handlePushToTalkEnd}
        >
          <Mic className={cn('w-10 h-10', isPushToTalkActive && 'animate-pulse')} />
          <span className="text-sm">Hold to Talk</span>
        </Button>

        {isListening && (
          <div className="mt-4 flex items-center gap-2 text-info">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-info opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-info" />
            </span>
            <span className="text-sm font-medium">Listening...</span>
          </div>
        )}
      </div>

      {/* Transcript Display */}
      <div className="bg-muted rounded-xl p-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Last Command</p>
        <p className={cn('text-base min-h-[48px]', !lastTranscript && 'text-muted-foreground italic')}>
          {lastTranscript || 'No commands yet...'}
        </p>
      </div>
    </div>
  );
}
