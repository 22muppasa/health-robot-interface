import { useEffect, useRef, useState, useCallback } from 'react';
import {
  createContinuousSpeechRecognition,
  isSpeechRecognitionSupported,
  detectWakeWord,
  extractCommandAfterWakeWord,
  SpeechRecognitionInstance,
} from '@/lib/audioUtils';

interface UseWakeWordDetectionOptions {
  enabled?: boolean;
  wakeWord?: string;
  onWakeWordDetected?: (command: string) => void;
  onTranscript?: (transcript: string, isFinal: boolean) => void;
  onError?: (error: string) => void;
}

/**
 * Hook for always-listening wake word detection
 * Continuously listens for a wake word and triggers callbacks when detected
 */
export function useWakeWordDetection(
  options: UseWakeWordDetectionOptions = {}
) {
  const {
    enabled = false,
    wakeWord = 'claire',
    onWakeWordDetected,
    onTranscript,
    onError,
  } = options;

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const isListeningRef = useRef(false);
  const [isListening, setIsListening] = useState(false);
  const [lastTranscript, setLastTranscript] = useState('');
  const restartTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const startListening = useCallback(() => {
    if (!isSpeechRecognitionSupported()) {
      const error = 'Web Speech API not supported';
      console.error('❌ ' + error);
      onError?.(error);
      return;
    }

    if (isListeningRef.current) {
      console.log('Already listening, skipping start');
      return;
    }

    try {
      const recognition = createContinuousSpeechRecognition();
      recognitionRef.current = recognition;

      recognition.onstart = () => {
        isListeningRef.current = true;
        setIsListening(true);
        console.log('🎧 Wake word detection started - listening for "' + wakeWord + '"');
      };

      recognition.onresult = (event: any) => {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;

          if (event.results[i].isFinal) {
            finalTranscript += transcript + ' ';
          } else {
            interimTranscript += transcript;
          }
        }

        const currentTranscript = finalTranscript || interimTranscript;
        
        if (currentTranscript) {
          setLastTranscript(currentTranscript);
          console.log('Detected:', currentTranscript, '(final:', !!finalTranscript, ')');

          if (onTranscript) {
            onTranscript(currentTranscript, !!finalTranscript);
          }

          // Check for wake word only in final results
          if (finalTranscript && detectWakeWord(finalTranscript, wakeWord)) {
            console.log('🎤 Wake word detected:', finalTranscript);
            const command = extractCommandAfterWakeWord(finalTranscript, wakeWord);
            console.log('📝 Extracted command:', command);
            
            // Trigger callback
            if (onWakeWordDetected) {
              onWakeWordDetected(command);
            }
          }
        }
      };

      recognition.onerror = (event: any) => {
        console.error('🔴 Wake word detection error:', event.error);
        
        // Don't immediately stop listening on all errors
        // Many errors are temporary and will be handled by onend
        if (event.error === 'no-speech') {
          console.log('No speech detected, continuing to listen...');
          // Don't report this as an error, just continue
        } else if (event.error === 'audio-capture') {
          console.error('❌ Audio capture failed - microphone not accessible');
          isListeningRef.current = false;
          setIsListening(false);
          recognitionRef.current = null;
          onError?.('Microphone not accessible. Check browser permissions.');
        } else if (event.error === 'aborted') {
          console.log('Recognition aborted, will restart');
          recognitionRef.current = null;
        } else if (event.error === 'network') {
          console.log('Network error during recognition');
        } else {
          console.log('Recognition error, will retry:', event.error);
        }
      };

      recognition.onend = () => {
        isListeningRef.current = false;
        setIsListening(false);
        console.log('⏹️ Wake word detection ended');
        
        // Auto-restart if still enabled - continuous mode stops after silence
        if (enabled) {
          console.log('Restarting recognition in 200ms...');
          restartTimeoutRef.current = setTimeout(() => {
            if (enabled && !isListeningRef.current) {
              try {
                console.log('🔄 Restarting recognition...');
                startListening();
              } catch (error) {
                console.error('Failed to restart recognition:', error);
              }
            }
          }, 200);
        }
      };

      recognition.start();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('Failed to start wake word detection:', errorMessage);
      onError?.(errorMessage);
    }
  }, [wakeWord, enabled, onWakeWordDetected, onTranscript, onError]);

  const stopListening = useCallback(() => {
    if (restartTimeoutRef.current) {
      clearTimeout(restartTimeoutRef.current);
      restartTimeoutRef.current = null;
    }

    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort(); // Use abort instead of stop for cleaner shutdown
      } catch (error) {
        console.error('Error stopping recognition:', error);
      }
      recognitionRef.current = null;
    }

    isListeningRef.current = false;
    setIsListening(false);
    setLastTranscript('');
  }, []);

  const restartListening = useCallback(() => {
    stopListening();
    setTimeout(() => {
      if (enabled) {
        startListening();
      }
    }, 500);
  }, [enabled, startListening, stopListening]);

  // Effect to handle enabled/disabled state
  useEffect(() => {
    if (enabled) {
      startListening();
    } else {
      stopListening();
    }

    return () => {
      stopListening();
    };
  }, [enabled, startListening, stopListening]);

  return {
    isListening,
    lastTranscript,
    startListening,
    stopListening,
    restartListening,
  };
}
