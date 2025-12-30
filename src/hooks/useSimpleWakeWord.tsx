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

  const recognitionRef = useRef<any>(null);
  const cooldownRef = useRef(false);

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
      return;
    }

    // Check browser support
    if (!('webkitSpeechRecognition' in window)) {
      setError('Web Speech API not supported in this browser. Please use Chrome, Edge, or Safari.');
      return;
    }

    fatalErrorRef.current = false;
    setError(null);

    // Create recognition instance
    const recognition = new (window as any).webkitSpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      console.log('Wake word detection started');
      setIsListening(true);
      setError(null);
    };

    recognition.onresult = (event: any) => {
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

      // Wake word matching
      const ww = wakeWord.toLowerCase();
      const hasWakeWord =
        transcript.includes(ww) ||
        transcript.includes(`hey ${ww}`) ||
        transcript.includes(`ok ${ww}`) ||
        transcript.includes(`hi ${ww}`);

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
    };

    recognition.onerror = (event: any) => {
      const err = event?.error;
      console.error('Wake word recognition error:', err);

      // These are often expected during transitions; don't treat as fatal.
      if (err === 'no-speech' || err === 'aborted') return;

      if (err === 'not-allowed' || err === 'service-not-allowed') {
        fatalErrorRef.current = true;
        setError('Microphone access denied. Please grant permission.');
      } else if (err === 'network') {
        setError('Network error. Speech recognition requires internet connection.');
      } else if (err === 'audio-capture') {
        setError('Microphone is busy or unavailable (audio-capture).');
      } else {
        setError(`Speech recognition error: ${err}`);
      }
    };

    recognition.onend = () => {
      console.log('Wake word recognition ended');
      setIsListening(false);

      // Auto-restart if still enabled and not fatal error and instance matches
      if (enabledRef.current && !fatalErrorRef.current && recognitionRef.current === recognition) {
        setTimeout(() => {
          try {
            recognition.start();
          } catch (e) {
            console.error('Failed to restart wake word recognition:', e);
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
    };
    // IMPORTANT: do NOT include `error` in deps (prevents re-creation loops)
  }, [isEnabled, wakeWord, onWakeWordDetected, abort]);

  return {
    isListening,
    error,
    lastTranscript,
    stop,
    abort,
  };
}
