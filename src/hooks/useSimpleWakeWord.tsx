// src/hooks/useSimpleWakeWord.ts
import { useCallback, useEffect, useRef, useState } from 'react';

export interface UseSimpleWakeWordOptions {
  isEnabled: boolean;
  wakeWord: string; // e.g., "claire"
  onWakeWordDetected: () => void;
}

/**
 * Simple wake word detection using Web Speech API
 *
 * Pros: No model files, no extra dependencies
 * Cons: Requires internet, privacy concerns, battery usage
 */
export function useSimpleWakeWord({
  isEnabled,
  wakeWord,
  onWakeWordDetected,
}: UseSimpleWakeWordOptions) {
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastTranscript, setLastTranscript] = useState('');
  const [audioLevel, setAudioLevel] = useState(0);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const cooldownRef = useRef(false);
  const isRestartingRef = useRef(false);

  // Avoid stale closure issues for restart logic
  const enabledRef = useRef(isEnabled);
  const fatalErrorRef = useRef(false);

  useEffect(() => {
    enabledRef.current = isEnabled;
  }, [isEnabled]);

  const stop = useCallback(() => {
    const r = recognitionRef.current;
    if (!r) return;
    try {
      r.stop?.();
    } catch {
      // ignore
    }
  }, []);

  const abort = useCallback(() => {
    const r = recognitionRef.current;
    if (!r) return;
    try {
      r.abort?.();
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    // Cleanup on disable
    if (!isEnabled) {
      abort();
      recognitionRef.current = null;
      setIsListening(false);
      setAudioLevel(0);
      return;
    }

    // Check browser support - try both webkit and standard
    const SpeechRecognitionConstructor = window.webkitSpeechRecognition || window.SpeechRecognition;
    if (!SpeechRecognitionConstructor) {
      setError('Web Speech API not supported in this browser. Please use Chrome, Edge, or Safari.');
      return;
    }

    fatalErrorRef.current = false;
    isRestartingRef.current = false;
    setError(null);

    // Create recognition instance using the detected API
    const recognition = new SpeechRecognitionConstructor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.maxAlternatives = 3; // Get more alternatives for better wake word matching

    recognition.onstart = () => {
      console.log('Wake word detection started');
      setIsListening(true);
      setError(null);
      // Simple audio level simulation when listening
      setAudioLevel(30);
    };

    recognition.onaudiostart = () => {
      console.log('Audio capture started');
      setAudioLevel(50);
    };

    recognition.onsoundstart = () => {
      console.log('Sound detected');
      setAudioLevel(70);
    };

    recognition.onsoundend = () => {
      setAudioLevel(30);
    };

    recognition.onaudioend = () => {
      setAudioLevel(0);
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      // Show activity when receiving results
      setAudioLevel(80);
      
      // Combine the last few chunks because Web Speech often splits phrases
      const startIdx = Math.max(0, event.results.length - 4);
      let combined = '';

      for (let i = startIdx; i < event.results.length; i++) {
        const chunk = (event.results[i]?.[0]?.transcript ?? '').toLowerCase();
        combined += ` ${chunk}`;
      }

      const transcript = combined.trim();
      if (!transcript) return;

      setLastTranscript(transcript);

      // Wake word matching with common misrecognitions
      const ww = wakeWord.toLowerCase();
      // Include common speech recognition misheard versions
      const wakeWordVariants = [
        ww,
        `hey ${ww}`,
        `ok ${ww}`,
        `hi ${ww}`,
        `a ${ww}`,
        // Common misrecognitions of "claire"
        'clear',
        'clair',
        'clare',
        'player',
        'prayer',
        'flare',
        'hey clear',
        'hey clair',
        'hey clare',
        'ok clear',
        'hi clear',
      ];
      const hasWakeWord = wakeWordVariants.some(variant => transcript.includes(variant));

      if (hasWakeWord && !cooldownRef.current) {
        console.log(`✓ Wake word "${wakeWord}" detected in: "${transcript}"`);
        cooldownRef.current = true;

        // ✅ CRITICAL: abort wake-word recognition BEFORE calling callback
        // This frees the mic so command recognition can start cleanly.
        try {
          recognition.abort?.();
        } catch {
          // ignore
        }

        onWakeWordDetected();

        // Reset cooldown after 2 seconds
        setTimeout(() => {
          cooldownRef.current = false;
        }, 2000);
      }
      
      // Reset audio level after processing
      setTimeout(() => setAudioLevel(30), 500);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      const err = event?.error;
      console.error('Wake word recognition error:', err);

      // These are often expected during transitions; don't treat as fatal.
      if (err === 'no-speech' || err === 'aborted') {
        // For no-speech, just let it restart silently
        return;
      }

      if (err === 'not-allowed' || err === 'service-not-allowed') {
        fatalErrorRef.current = true;
        setError('Microphone access denied. Please grant permission in your browser settings.');
      } else if (err === 'network') {
        // Network errors are often transient - don't mark as fatal
        console.warn('Network error in speech recognition - will retry');
        setError('Network error. Retrying...');
        // Clear error after a moment so it can retry
        setTimeout(() => setError(null), 2000);
      } else if (err === 'audio-capture') {
        // Audio capture errors often mean mic is busy - retry after delay
        console.warn('Audio capture error - mic may be busy, will retry');
        setError('Microphone busy. Waiting...');
        setTimeout(() => setError(null), 1000);
      } else {
        setError(`Speech recognition error: ${err}`);
      }
    };

    recognition.onend = () => {
      console.log('Wake word recognition ended');
      setIsListening(false);
      setAudioLevel(0);

      // Auto-restart if still enabled and not fatal error and instance matches
      // Guard against overlapping restarts
      if (enabledRef.current && !fatalErrorRef.current && recognitionRef.current === recognition && !isRestartingRef.current) {
        isRestartingRef.current = true;
        setTimeout(() => {
          try {
            // Double-check we should still restart
            if (enabledRef.current && !fatalErrorRef.current && recognitionRef.current === recognition) {
              recognition.start();
              console.log('Wake word recognition restarted');
            }
          } catch (e) {
            console.error('Failed to restart wake word recognition:', e);
          } finally {
            isRestartingRef.current = false;
          }
        }, 300);
      }
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
    } catch (e) {
      console.error('Failed to start wake word detection:', e);
      setError('Failed to start wake word detection');
    }

    return () => {
      if (recognitionRef.current === recognition) {
        try {
          recognition.abort?.();
        } catch {
          // ignore
        }
        recognitionRef.current = null;
      }
      setAudioLevel(0);
    };
    // IMPORTANT: do NOT include `error` in deps (prevents re-creation loops)
  }, [isEnabled, wakeWord, onWakeWordDetected, abort]);

  return {
    isListening,
    error,
    lastTranscript,
    audioLevel,
    stop,
    abort,
  };
}
