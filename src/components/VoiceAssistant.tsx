// src/components/VoiceAssistant.tsx
import { useState, useCallback, useRef, useEffect } from 'react';
import { MessageSquare, Mic } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/use-toast';
import { useSimpleWakeWord } from '@/hooks/useSimpleWakeWord';

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
  const [wakeWordMode, setWakeWordMode] = useState(false);
  const [wakeWordDetected, setWakeWordDetected] = useState(false);
  const [isProcessingCommand, setIsProcessingCommand] = useState(false);

  // This ref is used for the *command* recognizer (wake-word command + PTT)
  const commandRecognitionRef = useRef<any>(null);

  const { toast } = useToast();

  /**
   * Auto command recognition (used after wake word)
   */
  const handleAutoSpeechRecognition = useCallback(async () => {
    if (!isEnabled) return;

    if (!('webkitSpeechRecognition' in window)) {
      toast({
        title: 'Browser Not Supported',
        description: 'Web Speech API is not available in this browser.',
        variant: 'destructive',
      });
      return;
    }

    // Stop any prior command recognition instance
    try {
      commandRecognitionRef.current?.abort?.();
    } catch {
      // ignore
    }
    commandRecognitionRef.current = null;

    try {
      await api.sendCommand({ intent: 'assistant_ptt_start' });
    } catch (error) {
      console.error('Failed to start speech recognition:', error);
    }

    const recognition = new window.webkitSpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onresult = async (event: any) => {
      const transcript = event.results?.[0]?.[0]?.transcript ?? '';
      console.log('Command transcript:', transcript);

      if (transcript) {
        try {
          await api.post('/api/text-command', { text: transcript });
          console.log('Command sent successfully:', transcript);
        } catch (error) {
          console.error('Failed to send text command:', error);
          toast({
            title: 'Command Failed',
            description: 'Could not process voice command.',
            variant: 'destructive',
          });
        }
      }
    };

    recognition.onerror = (event: any) => {
      console.error('Command speech recognition error:', event.error);

      // Don't show error for "no-speech" or "aborted" (common in transitions)
      if (event.error !== 'no-speech' && event.error !== 'aborted') {
        toast({
          title: 'Microphone Error',
          description: `Speech recognition failed: ${event.error}`,
          variant: 'destructive',
        });
      }

      api.sendCommand({ intent: 'assistant_ptt_stop' });
      setWakeWordDetected(false);
      setIsProcessingCommand(false);
    };

    recognition.onend = () => {
      console.log('Command recognition ended');
      api.sendCommand({ intent: 'assistant_ptt_stop' });

      // ✅ Re-enable wake-word listening only after command recognition ends
      setWakeWordDetected(false);
      setIsProcessingCommand(false);
    };

    commandRecognitionRef.current = recognition;

    try {
      recognition.start();
    } catch (e) {
      console.error('Failed to start command recognition:', e);
      setWakeWordDetected(false);
      setIsProcessingCommand(false);
    }
  }, [isEnabled, toast]);

  // Handle wake word detection
  const handleWakeWordDetected = useCallback(async () => {
    console.log('Wake word "Claire" detected!');
    setWakeWordDetected(true);
    setIsProcessingCommand(true);

    toast({
      title: 'Wake Word Detected',
      description: 'Listening for your command...',
      duration: 2000,
    });

    // Give Chrome a moment to fully release audio capture from wake-word recognizer
    await new Promise((resolve) => setTimeout(resolve, 250));

    await handleAutoSpeechRecognition();
  }, [toast, handleAutoSpeechRecognition]);

  // Initialize wake word detection
  const {
    isListening: isWakeWordListening,
    error: wakeWordError,
    lastTranscript: wakeWordTranscript,
  } = useSimpleWakeWord({
    isEnabled: isEnabled && wakeWordMode && !isProcessingCommand,
    wakeWord: 'claire',
    onWakeWordDetected: handleWakeWordDetected, // ✅ IMPORTANT: no abortWakeWord wrapper here
  });

  // Show error toast if wake word detection fails
  useEffect(() => {
    if (wakeWordError) {
      toast({
        title: 'Wake Word Error',
        description: wakeWordError,
        variant: 'destructive',
      });
    }
  }, [wakeWordError, toast]);

  const handleToggle = async (checked: boolean) => {
    try {
      const intent = checked ? 'assistant_enable' : 'assistant_disable';
      await api.sendCommand({ intent });
      onToggle(checked);

      if (!checked) {
        // Stop any command recognition instance if disabling
        try {
          commandRecognitionRef.current?.abort?.();
        } catch {
          // ignore
        }
        commandRecognitionRef.current = null;
        setIsProcessingCommand(false);
        setWakeWordDetected(false);
      }
    } catch (error) {
      console.error('Failed to toggle voice assistant:', error);
    }
  };

  const handlePushToTalkStart = useCallback(async () => {
    if (!isEnabled) return;
    setIsPushToTalkActive(true);

    if (!('webkitSpeechRecognition' in window)) {
      toast({
        title: 'Browser Not Supported',
        description: 'Web Speech API is not available in this browser.',
        variant: 'destructive',
      });
      setIsPushToTalkActive(false);
      return;
    }

    // Stop any prior command recognition instance
    try {
      commandRecognitionRef.current?.abort?.();
    } catch {
      // ignore
    }
    commandRecognitionRef.current = null;

    try {
      await api.sendCommand({ intent: 'assistant_ptt_start' });
    } catch (error) {
      console.error('Failed to start push-to-talk:', error);
    }

    const recognition = new window.webkitSpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onresult = async (event: any) => {
      const transcript = event.results?.[0]?.[0]?.transcript ?? '';
      if (transcript) {
        try {
          await api.post('/api/text-command', { text: transcript });
        } catch (error) {
          console.error('Failed to send text command:', error);
          toast({
            title: 'Command Failed',
            description: 'Could not process voice command.',
            variant: 'destructive',
          });
        }
      }
    };

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      toast({
        title: 'Microphone Error',
        description: `Speech recognition failed: ${event.error}`,
        variant: 'destructive',
      });
      setIsPushToTalkActive(false);
      api.sendCommand({ intent: 'assistant_ptt_stop' });
    };

    recognition.onend = () => {
      setIsPushToTalkActive(false);
      api.sendCommand({ intent: 'assistant_ptt_stop' });
    };

    commandRecognitionRef.current = recognition;

    try {
      recognition.start();
    } catch (e) {
      console.error('Failed to start PTT recognition:', e);
      setIsPushToTalkActive(false);
    }
  }, [isEnabled, toast]);

  const handlePushToTalkEnd = useCallback(async () => {
    try {
      commandRecognitionRef.current?.stop?.();
    } catch {
      // ignore
    }
  }, []);

  return (
    <div className="dashboard-card">
      <div className="flex items-center justify-between mb-4 sm:mb-6 gap-3 min-w-0">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <MessageSquare className="w-4 h-4 sm:w-5 sm:h-5 text-primary flex-shrink-0" />
          <h2 className="text-base sm:text-lg font-semibold text-foreground truncate">
            Voice Assistant
          </h2>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
          <span
            className={cn(
              'text-xs sm:text-sm font-medium',
              isEnabled ? 'text-success' : 'text-muted-foreground'
            )}
          >
            {isEnabled ? 'Enabled' : 'Disabled'}
          </span>
          <Switch checked={isEnabled} onCheckedChange={handleToggle} />
        </div>
      </div>

      {/* Wake Word Mode Toggle */}
      <div className="flex items-center justify-between mb-4 p-2 sm:p-3 bg-muted rounded-lg">
        <div className="flex items-center gap-2">
          <span className="text-xs sm:text-sm font-medium">Wake Word Mode</span>

          {isWakeWordListening && !isProcessingCommand && (
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75" />
              <span className="relative inline-flex rounded-full h-full w-full bg-green-500" />
            </span>
          )}

          {isProcessingCommand && (
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-500 opacity-75" />
              <span className="relative inline-flex rounded-full h-full w-full bg-blue-500" />
            </span>
          )}
        </div>

        <Switch checked={wakeWordMode} onCheckedChange={setWakeWordMode} disabled={!isEnabled} />
      </div>

      {/* Wake Word Status */}
      {wakeWordMode && isEnabled && (
        <div className="mb-4 p-2 sm:p-3 bg-primary/10 rounded-lg border border-primary/20">
          <p className="text-xs sm:text-sm text-center">
            {isProcessingCommand ? (
              <span className="font-semibold text-blue-500 animate-pulse">
                🎤 Listening for command...
              </span>
            ) : wakeWordDetected ? (
              <span className="font-semibold text-primary animate-pulse">✓ Wake word detected!</span>
            ) : (
              <span className="text-muted-foreground">
                Say <span className="font-semibold text-primary">"Claire"</span> to activate
              </span>
            )}
          </p>

          {/* Debug: Show what's being heard */}
          {wakeWordTranscript && !isProcessingCommand && (
            <p className="text-xs text-center mt-1 text-muted-foreground">
              Heard: "{wakeWordTranscript}"
            </p>
          )}
        </div>
      )}

      {/* Push-to-Talk Button (shown when wake word mode is off) */}
      {!wakeWordMode && (
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
      )}

      {/* Transcript Display */}
      <div className="bg-muted rounded-lg sm:rounded-xl p-2 sm:p-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1 sm:mb-2">
          Last Command
        </p>
        <p
          className={cn(
            'text-xs sm:text-sm md:text-base min-h-[40px] sm:min-h-[48px] break-words',
            !lastTranscript && 'text-muted-foreground italic'
          )}
        >
          {lastTranscript || 'No commands yet...'}
        </p>
      </div>
    </div>
  );
}
