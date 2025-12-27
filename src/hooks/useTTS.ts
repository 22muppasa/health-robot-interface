import { useEffect, useRef } from 'react';
import { api } from '@/lib/api';
import { playAudio } from '@/lib/audioUtils';

interface UseTTSOptions {
  onSpeakingStart?: () => void;
  onSpeakingEnd?: () => void;
  onError?: (error: string) => void;
}

/**
 * Hook for handling text-to-speech responses
 * Automatically fetches and plays audio when needed
 */
export function useTTS(options: UseTTSOptions = {}) {
  const { onSpeakingStart, onSpeakingEnd, onError } = options;
  const isSpeakingRef = useRef(false);

  const speak = async (text: string): Promise<void> => {
    if (!text || !text.trim()) {
      return;
    }

    if (isSpeakingRef.current) {
      console.log('Already speaking, skipping TTS');
      return;
    }

    try {
      isSpeakingRef.current = true;
      onSpeakingStart?.();

      console.log('Requesting TTS for:', text);
      const audioBlob = await api.getTTS(text);
      
      console.log('Playing TTS audio');
      await playAudio(audioBlob, () => {
        isSpeakingRef.current = false;
        onSpeakingEnd?.();
      });
    } catch (error) {
      isSpeakingRef.current = false;
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('TTS error:', errorMessage);
      onError?.(errorMessage);
      onSpeakingEnd?.();
    }
  };

  const stopSpeaking = (): void => {
    // Cancel any ongoing speech synthesis
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    isSpeakingRef.current = false;
    onSpeakingEnd?.();
  };

  return {
    speak,
    stopSpeaking,
    isSpeaking: isSpeakingRef.current,
  };
}
