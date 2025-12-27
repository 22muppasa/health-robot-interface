import { useState, useCallback, useRef, useEffect } from 'react';
import { MessageSquare, Mic, Volume2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/use-toast';
import {
  createSpeechRecognition,
  isSpeechRecognitionSupported,
  speak,
  playAudio,
} from '@/lib/audioUtils';
import { useWakeWordDetection } from '@/hooks/useWakeWordDetection';
import { useTTS } from '@/hooks/useTTS';

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
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [lastResponse, setLastResponse] = useState('');
  const [wakeWordError, setWakeWordError] = useState('');
  const recognitionRef = useRef<any>(null);
  const { toast } = useToast();
  const lastIntentRef = useRef('');

  // TTS hook for speaking responses
  const { speak: speakText } = useTTS({
    onSpeakingStart: () => setIsSpeaking(true),
    onSpeakingEnd: () => setIsSpeaking(false),
    onError: (error) => {
      console.error('TTS error:', error);
      toast({
        title: 'Speech Error',
        description: 'Failed to play audio response.',
        variant: 'destructive',
      });
    },
  });

  // Wake word detection hook - always listening when enabled
  const {
    isListening: isWakeWordListening,
    lastTranscript: wakeWordTranscript,
  } = useWakeWordDetection({
    enabled: isEnabled && !isPushToTalkActive,
    wakeWord: 'claire',
    onWakeWordDetected: handleWakeWordDetected,
    onError: handleWakeWordError,
  });

  // Listen for assistant state changes and play TTS when assistant is speaking
  useEffect(() => {
    const checkForResponse = async () => {
      try {
        const status = await api.getStatus();
        
        // Check if assistant just spoke (state changed to speaking or back to idle after speaking)
        if (status.assistant_state === 'speaking' && status.last_intent !== lastIntentRef.current) {
          lastIntentRef.current = status.last_intent;
          
          // Generate and play TTS response
          // We'll use a generic response based on the intent
          const responseText = generateResponseText(status.last_intent);
          if (responseText) {
            setLastResponse(responseText);
            await speakText(responseText);
          }
        } else if (status.assistant_state === 'idle' && lastIntentRef.current) {
          // Reset intent tracking when back to idle
          lastIntentRef.current = '';
        }
      } catch (error) {
        console.error('Error checking for response:', error);
      }
    };

    // Poll for status changes every 500ms
    const interval = setInterval(checkForResponse, 500);
    return () => clearInterval(interval);
  }, [speakText]);

  function generateResponseText(intent: string): string {
    const responses: Record<string, string> = {
      check_vitals: 'I am checking your vital signs.',
      call_nurse: 'Calling the nurse now.',
      navigate: 'I will navigate to the requested location.',
      join_call: 'Joining the video call.',
      mute_call: 'Muting the call.',
      unmute_call: 'Unmuting the call.',
      end_call: 'Ending the call.',
      explain: 'Let me explain that for you.',
    };
    return responses[intent] || 'Command received.';
  }

  async function handleWakeWordDetected(command: string) {
    if (!command.trim()) return;

    console.log('Processing wake word command:', command);
    try {
      // Send the extracted command to the backend
      await api.post('/api/text-command', { text: command });
      toast({
        title: 'Command Sent',
        description: 'Processing your request...',
      });
    } catch (error) {
      console.error('Failed to send wake word command:', error);
      toast({
        title: 'Command Failed',
        description: 'Could not process voice command.',
        variant: 'destructive',
      });
    }
  }

  function handleWakeWordError(error: string) {
    console.error('Wake word detection error:', error);
    setWakeWordError(error);
    // Clear error after 5 seconds
    setTimeout(() => setWakeWordError(''), 5000);
  }

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

    if (!isSpeechRecognitionSupported()) {
      toast({
        title: 'Browser Not Supported',
        description: 'Web Speech API is not available in this browser.',
        variant: 'destructive',
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
    try {
      const recognition = createSpeechRecognition();

      recognition.onresult = async (event: any) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) {
            transcript += event.results[i][0].transcript;
          }
        }

        if (transcript) {
          // 3. Send Transcribed Text to Backend Endpoint
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
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('Failed to create speech recognition:', errorMessage);
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
      setIsPushToTalkActive(false);
    }
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

      {/* Wake Word Detection Status */}
      {isEnabled && (
        <div className="mb-4 p-3 rounded-lg bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800">
          <div className="flex items-center gap-2">
            <div className="relative flex h-2 w-2">
              <span className={cn(
                'animate-pulse absolute inline-flex h-full w-full rounded-full opacity-75',
                isWakeWordListening ? 'bg-blue-500' : 'bg-gray-400'
              )} />
              <span className={cn(
                'relative inline-flex rounded-full h-full w-full',
                isWakeWordListening ? 'bg-blue-500' : 'bg-gray-400'
              )} />
            </div>
            <span className="text-xs sm:text-sm font-medium text-blue-700 dark:text-blue-300">
              {isWakeWordListening ? 'Listening for "Claire"...' : 'Wake word detection active'}
            </span>
          </div>
        </div>
      )}

      {/* Error Display */}
      {wakeWordError && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800">
          <p className="text-xs sm:text-sm text-red-700 dark:text-red-300">
            ⚠️ {wakeWordError === 'audio-capture' ? 'Microphone access denied - check permissions' : wakeWordError}
          </p>
        </div>
      )}

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

        {(isListening || isPushToTalkActive) && (
          <div className="mt-3 sm:mt-4 flex items-center gap-2 text-info">
            <span className="relative flex h-2 w-2 sm:h-3 sm:w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-info opacity-75" />
              <span className="relative inline-flex rounded-full h-full w-full bg-info" />
            </span>
            <span className="text-xs sm:text-sm font-medium">{isPushToTalkActive ? 'Recording...' : 'Processing...'}</span>
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

      {/* Assistant Response Display */}
      {lastResponse && (
        <div className="mt-3 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg p-3">
          <div className="flex items-start gap-2">
            {isSpeaking && (
              <Volume2 className="w-4 h-4 mt-0.5 text-green-600 dark:text-green-400 animate-pulse flex-shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-xs uppercase tracking-wide text-green-700 dark:text-green-300 mb-1">Assistant</p>
              <p className="text-xs sm:text-sm break-words text-green-900 dark:text-green-100">
                {lastResponse}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Wake Word Transcript (for debugging) */}
      {wakeWordTranscript && isEnabled && (
        <div className="mt-3 bg-gray-100 dark:bg-gray-900 rounded-lg p-2">
          <p className="text-xs text-gray-600 dark:text-gray-400">Wake word detected: "{wakeWordTranscript}"</p>
        </div>
      )}
    </div>
  );
}
