// Claire Chat Panel - Full conversation interface with voice integration
import { useRef, useEffect, useState, useCallback } from 'react';
import { ConversationMessage } from '@/hooks/useConversation';
import { Button } from '@/components/ui/button';
import { Loader2, Send, Volume2, Mic, MicOff } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ClaireChatPanelProps {
  messages: ConversationMessage[];
  isWaiting: boolean;
  onSend: (message: string) => void;
  onCancel: () => void;
  disabled?: boolean;
  isPlayingAudio?: boolean;
  claireState: 'idle' | 'listening' | 'thinking' | 'speaking';
  lastVoiceTranscript?: string;
  isWakeWordListening?: boolean;
}

export function ClaireChatPanel({
  messages,
  isWaiting,
  onSend,
  onCancel,
  disabled = false,
  isPlayingAudio = false,
  claireState,
  lastVoiceTranscript,
  isWakeWordListening = false,
}: ClaireChatPanelProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [inputValue, setInputValue] = useState('');

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, lastVoiceTranscript]);

  const handleSend = useCallback(() => {
    const text = inputValue.trim();
    if (text) {
      onSend(text);
      setInputValue('');
    }
  }, [inputValue, onSend]);

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Status indicator component
  const StatusIndicator = () => {
    if (claireState === 'listening') {
      return (
        <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
          <div className="relative">
            <Mic className="w-4 h-4 text-blue-500" />
            <span className="absolute -top-1 -right-1 flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
            </span>
          </div>
          <span className="text-sm text-blue-700 dark:text-blue-300 font-medium">
            Listening...
          </span>
          {lastVoiceTranscript && (
            <span className="text-sm text-blue-600 dark:text-blue-400 italic ml-2 truncate max-w-[200px]">
              "{lastVoiceTranscript}"
            </span>
          )}
        </div>
      );
    }

    if (claireState === 'thinking' || isWaiting) {
      return (
        <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
          <Loader2 className="w-4 h-4 text-amber-500 animate-spin" />
          <span className="text-sm text-amber-700 dark:text-amber-300 font-medium">
            Claire is thinking...
          </span>
        </div>
      );
    }

    if (claireState === 'speaking' || isPlayingAudio) {
      return (
        <div className="flex items-center gap-2 px-3 py-2 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
          <Volume2 className="w-4 h-4 text-green-500 animate-pulse" />
          <span className="text-sm text-green-700 dark:text-green-300 font-medium">
            Claire is speaking...
          </span>
        </div>
      );
    }

    // Idle state - show wake word listening status
    if (isWakeWordListening) {
      return (
        <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="relative">
            <Mic className="w-4 h-4 text-gray-500" />
            <span className="absolute -top-1 -right-1 flex h-2 w-2">
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
            </span>
          </div>
          <span className="text-sm text-gray-600 dark:text-gray-400">
            Say <span className="font-semibold text-primary">"Hey Claire"</span> to talk
          </span>
        </div>
      );
    }

    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
        <MicOff className="w-4 h-4 text-gray-400" />
        <span className="text-sm text-gray-500">Voice inactive</span>
      </div>
    );
  };

  // Format timestamp
  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };

  return (
    <div className="flex flex-col h-full bg-card rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/80 to-primary flex items-center justify-center">
            <span className="text-lg">👩‍⚕️</span>
          </div>
          <div>
            <h2 className="text-base font-semibold text-foreground">Claire</h2>
            <p className="text-xs text-muted-foreground">Your Healthcare Assistant</p>
          </div>
        </div>
        <StatusIndicator />
      </div>

      {/* Messages Container */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <span className="text-3xl">💬</span>
            </div>
            <h3 className="text-lg font-medium text-foreground mb-2">
              Hi! I'm Claire
            </h3>
            <p className="text-sm text-muted-foreground max-w-sm">
              Your personal healthcare assistant. You can talk to me by saying "Hey Claire" or type a message below.
            </p>
            <div className="mt-4 flex flex-wrap gap-2 justify-center">
              <button
                onClick={() => onSend("How are you feeling today?")}
                className="px-3 py-1.5 text-xs bg-primary/10 hover:bg-primary/20 text-primary rounded-full transition-colors"
              >
                "How am I doing?"
              </button>
              <button
                onClick={() => onSend("What's the weather like?")}
                className="px-3 py-1.5 text-xs bg-primary/10 hover:bg-primary/20 text-primary rounded-full transition-colors"
              >
                "What's the weather?"
              </button>
              <button
                onClick={() => onSend("Call my family")}
                className="px-3 py-1.5 text-xs bg-primary/10 hover:bg-primary/20 text-primary rounded-full transition-colors"
              >
                "Call my family"
              </button>
            </div>
          </div>
        ) : (
          <>
            {messages.map((msg, idx) => (
              <div
                key={msg.id}
                className={cn(
                  'flex gap-3 animate-in slide-in-from-bottom-2 duration-200',
                  msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'
                )}
              >
                {/* Avatar */}
                <div
                  className={cn(
                    'flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm',
                    msg.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-gradient-to-br from-primary/60 to-primary'
                  )}
                >
                  {msg.role === 'user' ? '👤' : '👩‍⚕️'}
                </div>

                {/* Message Bubble */}
                <div className={cn('flex flex-col max-w-[75%]', msg.role === 'user' ? 'items-end' : 'items-start')}>
                  <div
                    className={cn(
                      'px-4 py-2.5 rounded-2xl text-sm',
                      msg.role === 'user'
                        ? 'bg-primary text-primary-foreground rounded-br-md'
                        : 'bg-muted text-foreground rounded-bl-md'
                    )}
                  >
                    {msg.content}
                  </div>
                  <span className="text-xs text-muted-foreground mt-1 px-1">
                    {formatTime(msg.timestamp)}
                  </span>
                  
                  {/* Audio indicator for Claire's messages */}
                  {msg.role === 'assistant' && idx === messages.length - 1 && isPlayingAudio && (
                    <div className="flex items-center gap-1 mt-1 px-1">
                      <Volume2 className="w-3 h-3 text-green-500 animate-pulse" />
                      <span className="text-xs text-green-600 dark:text-green-400">Speaking...</span>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* Typing indicator when waiting */}
            {isWaiting && messages[messages.length - 1]?.role === 'user' && (
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary/60 to-primary flex items-center justify-center text-sm">
                  👩‍⚕️
                </div>
                <div className="bg-muted rounded-2xl rounded-bl-md px-4 py-3">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce [animation-delay:-0.3s]" />
                    <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce [animation-delay:-0.15s]" />
                    <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" />
                  </div>
                </div>
              </div>
            )}
          </>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-3 border-t border-border bg-muted/30">
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Type a message to Claire..."
            className="flex-1 px-4 py-2.5 rounded-full border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            disabled={disabled || isWaiting}
            onKeyPress={handleKeyPress}
          />
          {isWaiting ? (
            <Button
              variant="destructive"
              size="icon"
              onClick={onCancel}
              className="flex-shrink-0 rounded-full w-10 h-10"
            >
              <span className="sr-only">Cancel</span>
              ✕
            </Button>
          ) : (
            <Button
              variant="default"
              size="icon"
              onClick={handleSend}
              disabled={disabled || isWaiting || !inputValue.trim()}
              className="flex-shrink-0 rounded-full w-10 h-10"
            >
              <Send className="w-4 h-4" />
              <span className="sr-only">Send</span>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
