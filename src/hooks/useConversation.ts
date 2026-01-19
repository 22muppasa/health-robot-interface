import { useState, useCallback, useRef } from 'react';
import { api } from '@/lib/api';

export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  intent?: string;
  isCommand?: boolean;
  audioUrl?: string;
}

export function useConversation() {
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [isWaiting, setIsWaiting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);

  const playAudio = useCallback(async (audioUrl: string) => {
    try {
      if (!audioRef.current) {
        audioRef.current = new Audio();
        audioRef.current.onended = () => {
          setIsPlayingAudio(false);
        };
      }
      
      setIsPlayingAudio(true);
      audioRef.current.src = audioUrl;
      
      // Add timeout to prevent infinite loading (60 seconds for long responses)
      const playPromise = audioRef.current.play();
      if (playPromise !== undefined) {
        await Promise.race([
          playPromise,
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Audio playback timeout')), 60000)
          )
        ]);
      }
    } catch (err) {
      console.error('Error playing audio:', err);
      setIsPlayingAudio(false);
    }
  }, []);

  const sendMessage = useCallback(
    async (userText: string) => {
      if (!userText.trim()) return;

      // Add user message
      const userMessage: ConversationMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: userText,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, userMessage]);
      setIsWaiting(true);
      setError(null);

      // Create abort controller for cancellation
      abortControllerRef.current = new AbortController();

      try {
        // Stream the response
        const response = await fetch('/api/stream-response', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ text: userText }),
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) {
          throw new Error(`Server error: ${response.statusText}`);
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error('No response body');

        const decoder = new TextDecoder();
        let buffer = '';
        let assistantContent = '';
        let audioUrl: string | null = null;

        const assistantMessage: ConversationMessage = {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: '',
          timestamp: new Date(),
        };

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines[lines.length - 1];

          for (let i = 0; i < lines.length - 1; i++) {
            const line = lines[i];
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                
                if (data.token) {
                  assistantContent += data.token;
                  assistantMessage.content = assistantContent;
                  setMessages((prev) => {
                    const updated = [...prev];
                    const lastMsg = updated[updated.length - 1];
                    if (lastMsg?.id === assistantMessage.id) {
                      updated[updated.length - 1] = { ...assistantMessage };
                    } else {
                      updated.push({ ...assistantMessage });
                    }
                    return updated;
                  });
                }
                
                if (data.type === 'audio_ready' && data.audio_url) {
                  audioUrl = data.audio_url;
                  console.log('Audio ready at:', audioUrl);
                }
                
                if (data.type === 'audio_failed') {
                  console.warn('Audio generation failed');
                }
                
                if (data.error) {
                  throw new Error(data.error);
                }
              } catch (e) {
                console.error('Error parsing stream data:', e);
              }
            }
          }
        }

        // After response is complete, play audio if available
        if (audioUrl) {
          try {
            console.log('Playing audio from:', audioUrl);
            await playAudio(audioUrl);
          } catch (err) {
            console.error('Failed to play audio:', err);
          }
        }
      } catch (err) {
        if (err instanceof Error && err.name !== 'AbortError') {
          setError(err.message);
          console.error('Error streaming response:', err);
        }
      } finally {
        setIsWaiting(false);
        setIsPlayingAudio(false);
        abortControllerRef.current = null;
      }
    },
    [playAudio]
  );

  const cancelMessage = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsWaiting(false);
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setIsPlayingAudio(false);
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
    if (audioRef.current) {
      audioRef.current.pause();
    }
  }, []);

  return {
    messages,
    isWaiting,
    error,
    sendMessage,
    cancelMessage,
    clearMessages,
    isPlayingAudio,
  };
}
