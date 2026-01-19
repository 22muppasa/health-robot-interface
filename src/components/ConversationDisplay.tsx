import { useRef, useEffect } from 'react';
import { ConversationMessage } from '@/hooks/useConversation';
import { Button } from '@/components/ui/button';
import { Loader2, Send, Volume2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ConversationDisplayProps {
  messages: ConversationMessage[];
  isWaiting: boolean;
  onSend: (message: string) => void;
  onCancel: () => void;
  disabled?: boolean;
  isPlayingAudio?: boolean;
}

export function ConversationDisplay({
  messages,
  isWaiting,
  onSend,
  onCancel,
  disabled = false,
  isPlayingAudio = false,
}: ConversationDisplayProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    const text = inputRef.current?.value?.trim();
    if (text) {
      onSend(text);
      if (inputRef.current) {
        inputRef.current.value = '';
      }
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="dashboard-card flex flex-col h-full">
      <h2 className="text-lg font-semibold text-foreground mb-4">Chat with Claire</h2>

      {/* Messages Container */}
      <div className="flex-1 overflow-y-auto mb-4 space-y-3 min-h-[200px] max-h-[400px] rounded-lg bg-muted/30 p-3">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-center text-muted-foreground text-sm">
              Start a conversation with Claire. Ask for help, check vitals, or just chat!
              <br />
              <span className="text-xs mt-2 block">🔊 Claire will speak her responses</span>
            </p>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={cn(
                'flex gap-2 animate-in slide-in-from-bottom-2',
                msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'
              )}
            >
              <div
                className={cn(
                  'flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold',
                  msg.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary text-secondary-foreground'
                )}
              >
                {msg.role === 'user' ? 'You' : 'Claire'}
              </div>
              <div className="flex-1">
                <div
                  className={cn(
                    'max-w-xs px-3 py-2 rounded-lg text-sm break-words inline-block',
                    msg.role === 'user'
                      ? 'bg-primary text-primary-foreground rounded-br-none'
                      : 'bg-secondary text-secondary-foreground rounded-bl-none'
                  )}
                >
                  {msg.content}
                </div>
                {msg.role === 'assistant' && isPlayingAudio && (
                  <div className="mt-1 flex items-center gap-1">
                    <Volume2 className="w-3 h-3 text-muted-foreground animate-pulse" />
                    <span className="text-xs text-muted-foreground">Speaking...</span>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="flex gap-2">
        <input
          ref={inputRef}
          type="text"
          placeholder="Type your message..."
          className="flex-1 px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          disabled={disabled || isWaiting}
          onKeyPress={handleKeyPress}
        />
        {isWaiting ? (
          <Button
            variant="destructive"
            size="icon"
            onClick={onCancel}
            className="flex-shrink-0"
          >
            <span className="text-xs">Cancel</span>
          </Button>
        ) : (
          <Button
            variant="default"
            size="icon"
            onClick={handleSend}
            disabled={disabled || isWaiting}
            className="flex-shrink-0"
          >
            {isWaiting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
