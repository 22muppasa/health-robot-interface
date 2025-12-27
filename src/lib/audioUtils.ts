/**
 * Audio utilities for browser-based voice interaction
 * Includes Web Speech API wrappers and text-to-speech functionality
 */

declare global {
  interface Window {
    webkitSpeechRecognition: any;
    SpeechRecognition: any;
  }
}

export interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
}

export interface SpeechRecognitionResultList {
  [index: number]: SpeechRecognitionResult;
  length: number;
}

export interface SpeechRecognitionResult {
  [index: number]: SpeechRecognitionAlternative;
  isFinal: boolean;
  length: number;
}

export interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

export type SpeechRecognitionInstance = any;

/**
 * Get the appropriate SpeechRecognition constructor for the browser
 */
export function getSpeechRecognition(): typeof window.SpeechRecognition | null {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  return SpeechRecognition || null;
}

/**
 * Check if browser supports Web Speech API
 */
export function isSpeechRecognitionSupported(): boolean {
  return getSpeechRecognition() !== null;
}

/**
 * Create and configure a SpeechRecognition instance
 */
export function createSpeechRecognition(): SpeechRecognitionInstance {
  const SpeechRecognition = getSpeechRecognition();
  if (!SpeechRecognition) {
    throw new Error('Web Speech API not supported');
  }
  
  const recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang = 'en-US';
  
  return recognition;
}

/**
 * Create and configure a continuous SpeechRecognition instance for wake word detection
 */
export function createContinuousSpeechRecognition(): SpeechRecognitionInstance {
  const SpeechRecognition = getSpeechRecognition();
  if (!SpeechRecognition) {
    throw new Error('Web Speech API not supported');
  }
  
  const recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = 'en-US';
  // Add maxAlternatives for better recognition
  recognition.maxAlternatives = 1;
  
  return recognition;
}

/**
 * Play audio from a URL or audio data
 */
export async function playAudio(
  source: string | ArrayBuffer | Blob,
  onEnded?: () => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const audio = new Audio();
      
      if (typeof source === 'string') {
        audio.src = source;
      } else if (source instanceof Blob) {
        audio.src = URL.createObjectURL(source);
      } else if (source instanceof ArrayBuffer) {
        const blob = new Blob([source], { type: 'audio/mp3' });
        audio.src = URL.createObjectURL(blob);
      }
      
      audio.onended = () => {
        if (onEnded) onEnded();
        resolve();
      };
      
      audio.onerror = (error) => {
        reject(new Error(`Audio playback error: ${error}`));
      };
      
      audio.play().catch(reject);
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Text-to-speech using browser's SpeechSynthesis API
 */
export async function speak(text: string, voice?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!('speechSynthesis' in window)) {
      reject(new Error('Speech Synthesis API not supported'));
      return;
    }

    // Cancel any ongoing speech
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    
    // Set voice if available
    if (voice && window.speechSynthesis.getVoices().length > 0) {
      const voices = window.speechSynthesis.getVoices();
      const selectedVoice = voices.find(v => v.name.includes(voice));
      if (selectedVoice) {
        utterance.voice = selectedVoice;
      }
    }
    
    utterance.onend = () => resolve();
    utterance.onerror = (error) => reject(new Error(`Speech synthesis error: ${error}`));
    
    window.speechSynthesis.speak(utterance);
  });
}

/**
 * Get available voices from the Speech Synthesis API
 */
export function getAvailableVoices(): SpeechSynthesisVoice[] {
  if (!('speechSynthesis' in window)) {
    return [];
  }
  return window.speechSynthesis.getVoices();
}

/**
 * Detect wake word in transcript
 */
export function detectWakeWord(transcript: string, wakeWord: string = 'claire'): boolean {
  const normalizedTranscript = transcript.toLowerCase().trim();
  const normalizedWakeWord = wakeWord.toLowerCase().trim();
  
  // Check if transcript starts with or contains the wake word
  return (
    normalizedTranscript.startsWith(normalizedWakeWord) ||
    normalizedTranscript.includes(` ${normalizedWakeWord}`)
  );
}

/**
 * Extract command after wake word
 */
export function extractCommandAfterWakeWord(
  transcript: string,
  wakeWord: string = 'claire'
): string {
  const normalizedWakeWord = wakeWord.toLowerCase().trim();
  const lowerTranscript = transcript.toLowerCase();
  
  let commandStart = lowerTranscript.indexOf(normalizedWakeWord);
  if (commandStart === -1) {
    return transcript;
  }
  
  commandStart += normalizedWakeWord.length;
  let command = transcript.substring(commandStart).trim();
  
  // Remove leading punctuation
  command = command.replace(/^[\s,.\-:]+/, '');
  
  return command;
}
