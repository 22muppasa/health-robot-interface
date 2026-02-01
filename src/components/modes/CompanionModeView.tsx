import { useState, useEffect, useCallback } from 'react';
import { AnimatedClaireFace } from '@/components/AnimatedClaireFace';
import { MessageCircle, Sparkles, Home } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';

interface CompanionModeViewProps {
  claireState: 'idle' | 'listening' | 'thinking' | 'speaking';
  isWakeWordActive?: boolean;
  onSendMessage?: (message: string) => void;
  onBackToDashboard?: () => void;
}

const CONVERSATION_STARTERS = [
  "How are you feeling today?",
  "Would you like me to tell you a story?",
  "Let's do a quick wellness check!",
  "Want to hear an interesting fact?",
  "Should we do some light exercises together?",
  "Tell me about your day so far.",
  "Would you like to hear about the weather?",
  "Let's chat! What's on your mind?",
];

const PROACTIVE_PROMPTS = [
  "💡 Ask me about the weather",
  "📰 I can tell you the latest news",
  "⏰ Want me to set a reminder?",
  "😊 Let's have a conversation",
  "🎵 I can help you relax",
];

export function CompanionModeView({ claireState, isWakeWordActive = true, onSendMessage, onBackToDashboard }: CompanionModeViewProps) {
  const [currentPrompt, setCurrentPrompt] = useState(0);
  const [lastInteraction, setLastInteraction] = useState<Date>(new Date());
  const [showBubble, setShowBubble] = useState(false);
  const [bubbleMessage, setBubbleMessage] = useState('');

  // Rotate prompts
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentPrompt((prev) => (prev + 1) % PROACTIVE_PROMPTS.length);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  // Proactive check-in after idle period
  useEffect(() => {
    const checkIdleTime = () => {
      const idleMinutes = (Date.now() - lastInteraction.getTime()) / 1000 / 60;
      
      // After 10 minutes of idle, show a proactive bubble
      if (idleMinutes > 10 && claireState === 'idle' && !showBubble) {
        const starter = CONVERSATION_STARTERS[Math.floor(Math.random() * CONVERSATION_STARTERS.length)];
        setBubbleMessage(starter);
        setShowBubble(true);
      }
    };

    const interval = setInterval(checkIdleTime, 60000); // Check every minute
    return () => clearInterval(interval);
  }, [lastInteraction, claireState, showBubble]);

  // Reset idle timer when Claire becomes active
  useEffect(() => {
    if (claireState !== 'idle') {
      setLastInteraction(new Date());
      setShowBubble(false);
    }
  }, [claireState]);

  const handleBubbleClick = useCallback(() => {
    if (onSendMessage && bubbleMessage) {
      // Strip emoji from beginning of message
      const cleanMessage = bubbleMessage.replace(/^[^\w]+/, '').trim();
      onSendMessage(cleanMessage);
    }
    setShowBubble(false);
    setLastInteraction(new Date());
  }, [bubbleMessage, onSendMessage]);

  const handleSuggestionClick = useCallback((suggestion: string) => {
    if (onSendMessage) {
      // Strip emoji from beginning of suggestion
      const cleanSuggestion = suggestion.replace(/^[^\w]+/, '').trim();
      onSendMessage(cleanSuggestion);
    }
    setLastInteraction(new Date());
  }, [onSendMessage]);

  return (
    <div className="w-full h-full bg-gradient-to-b from-purple-50 to-pink-50 dark:from-purple-950 dark:to-gray-900 flex flex-col items-center justify-center p-6">
      {/* Back to Dashboard button */}
      <Button
        onClick={onBackToDashboard}
        variant="ghost"
        size="sm"
        className="absolute top-6 left-6 text-muted-foreground hover:text-foreground hover:bg-white/50 dark:hover:bg-white/10 z-10"
      >
        <Home className="w-5 h-5 mr-2" />
        Dashboard
      </Button>

      {/* Speech bubble */}
      {showBubble && (
        <div 
          className="absolute top-1/4 max-w-sm bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-4 cursor-pointer hover:scale-105 transition-transform"
          onClick={handleBubbleClick}
        >
          <div className="flex items-start gap-3">
            <Sparkles className="w-5 h-5 text-purple-500 flex-shrink-0 mt-0.5" />
            <p className="text-foreground">{bubbleMessage}</p>
          </div>
          <p className="text-xs text-muted-foreground mt-2 text-right">Tap to respond</p>
          
          {/* Speech bubble tail */}
          <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-0 h-0 border-l-8 border-r-8 border-t-12 border-l-transparent border-r-transparent border-t-white dark:border-t-gray-800" />
        </div>
      )}

      {/* Claire's face - larger in companion mode */}
      <div className="flex-1 flex items-center justify-center">
        <AnimatedClaireFace
          isActive={true}
          isListening={claireState === 'listening'}
          isSpeaking={claireState === 'speaking'}
        />
      </div>

      {/* Companion mode badge */}
      <div className="flex items-center gap-2 px-4 py-2 bg-purple-100 dark:bg-purple-900/30 rounded-full text-purple-700 dark:text-purple-300 mb-4">
        <MessageCircle className="w-4 h-4" />
        <span className="text-sm font-medium">Companion Mode</span>
      </div>

      {/* Rotating suggestions */}
      <div className="flex flex-wrap justify-center gap-2 max-w-md">
        {PROACTIVE_PROMPTS.slice(0, 3).map((prompt, idx) => (
          <button
            key={idx}
            onClick={() => handleSuggestionClick(prompt)}
            className="px-4 py-2 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-full text-sm text-foreground hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors shadow-sm"
          >
            {prompt}
          </button>
        ))}
      </div>

      {/* Status indicator */}
      {claireState !== 'idle' && (
        <div className="absolute bottom-4 left-0 right-0 flex justify-center">
          <div className="flex items-center gap-2 px-4 py-2 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-full">
            <div className={`w-2 h-2 rounded-full ${
              claireState === 'listening' ? 'bg-blue-500 animate-pulse' : 
              claireState === 'speaking' ? 'bg-green-500 animate-pulse' : 'bg-yellow-500'
            }`} />
            <span className="text-sm text-muted-foreground">
              {claireState === 'listening' ? 'Listening...' : 
               claireState === 'speaking' ? 'Speaking...' : 'Thinking...'}
            </span>
          </div>
        </div>
      )}

      {/* Voice hint */}
      {claireState === 'idle' && !showBubble && (
        <div className="absolute bottom-4 flex items-center gap-2 text-muted-foreground text-sm">
          <div className={`w-2 h-2 rounded-full ${isWakeWordActive ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
          <span>{isWakeWordActive ? 'Say "Claire" or tap a suggestion to chat' : 'Voice inactive'}</span>
        </div>
      )}
    </div>
  );
}
