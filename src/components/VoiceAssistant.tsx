import { useState, useCallback, useRef } from 'react';
import { MessageSquare, Mic } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/use-toast';

// Define the SpeechRecognition interface for TypeScript
declare global {
  interface Window {
    webkitSpeechRecognition: any;
  }
}

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
  const recognitionRef = useRef<any>(null);
  const { toast } = useToast();

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

    if (!('webkitSpeechRecognition' in window)) {
      toast({
        title: "Browser Not Supported",
        description: "Web Speech API is not available in this browser.",
        variant: "destructive",
      });
      setIsPushToTalkActive(false);
      return;
    }

    // 1. Send PTT Start Command to Backend (to update UI status)
    try {
      await api.sendCommand({ intent: 'assistant_ptt_start' });
    } catch (error) {
      console.error('Failed to start push-to-talk:', error);
    }

    // 2. Start Web Speech Recognition
    const recognition = new window.webkitSpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onresult = async (event: any) => {
      const transcript = event.results[0][0].transcript;
      if (transcript) {
        // 3. Send Transcribed Text to New Backend Endpoint
        try {
          await api.post('/api/text-command', { text: transcript });
        } catch (error) {
          console.error('Failed to send text command:', error);
          toast({
            title: "Command Failed",
            description: "Could not process voice command.",
            variant: "destructive",
          });
        }
      }
    };

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      toast({
        title: "Microphone Error",
        description: `Speech recognition failed: ${event.error}`,
        variant: "destructive",
      });
      setIsPushToTalkActive(false);
      // Send PTT Stop Command to Backend on error
      api.sendCommand({ intent: 'assistant_ptt_stop' });
    };

    recognition.onend = () => {
      setIsPushToTalkActive(false);
      // Send PTT Stop Command to Backend on end
      api.sendCommand({ intent: 'assistant_ptt_stop' });
    };

    recognitionRef.current = recognition;
    recognition.start();

  }, [isEnabled, toast]);

  const handlePushToTalkEnd = useCallback(async () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    // The onend handler will take care of sending the PTT stop command
  }, []);

  return (
    <div className="dashboard-card">
      <div className="flex items-center justify-between mb-4 sm:mb-6 gap-3 min-w-0">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <MessageSquare className="w-4 h-4 sm:w-5 sm:h-5 text-primary flex-shrink-0" />
          <h2 className="text-base sm:text-lg font-semibold text-foreground truncate">Voice Assistant</h2>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
          <span className={cn('text-xs sm:text-sm font-medium', isEnabled ? 'text-success' : 'text-muted-foreground')}>
            {isEnabled ? 'Enabled' : 'Disabled'}
          </span>
          <Switch checked={isEnabled} onCheckedChange={handleToggle} />
        </div>
      </div>

      {/* Push-to-Talk Button */}
      <div className="flex flex-col items-center mb-4 sm:mb-6">
        <Button
          variant={isPushToTalkActive ? 'default' : 'outline'}
          size="touch-lg"
          className={cn(
            'w-24 h-24 sm:w-32 sm:h-32 rounded-full flex flex-col gap-1 sm:gap-2 transition-all text-xs sm:text-sm',
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
          <Mic className={cn('w-6 h-6 sm:w-10 sm:h-10', isPushToTalkActive && 'animate-pulse')} />
          <span className="text-xs sm:text-sm leading-tight">Hold to Talk</span>
        </Button>

        {isListening && (
          <div className="mt-3 sm:mt-4 flex items-center gap-2 text-info">
            <span className="relative flex h-2 w-2 sm:h-3 sm:w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-info opacity-75" />
              <span className="relative inline-flex rounded-full h-full w-full bg-info" />
            </span>
            <span className="text-xs sm:text-sm font-medium">Listening...</span>
          </div>
        )}
      </div>

      {/* Transcript Display */}
      <div className="bg-muted rounded-lg sm:rounded-xl p-2 sm:p-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1 sm:mb-2">Last Command</p>
        <p className={cn('text-xs sm:text-sm md:text-base min-h-[40px] sm:min-h-[48px] break-words', !lastTranscript && 'text-muted-foreground italic')}>
          {lastTranscript || 'No commands yet...'}
        </p>
      </div>
    </div>
  );
}
