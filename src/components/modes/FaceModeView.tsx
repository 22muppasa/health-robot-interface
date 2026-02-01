import { useState, useEffect, useCallback } from 'react';
import { AnimatedClaireFace } from '@/components/AnimatedClaireFace';
import { Mic, Phone, Calendar, Bell, HelpCircle, X, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface FaceModeViewProps {
  claireState: 'idle' | 'listening' | 'thinking' | 'speaking';
  isWakeWordActive?: boolean;
  lastUserMessage?: string;
  lastClaireMessage?: string;
  onQuickAction?: (action: string) => void;
  onBackToDashboard?: () => void;
}

export function FaceModeView({ 
  claireState, 
  isWakeWordActive = true,
  lastUserMessage,
  lastClaireMessage,
  onQuickAction,
  onBackToDashboard
}: FaceModeViewProps) {
  const [time, setTime] = useState(new Date());
  const [showQuickActions, setShowQuickActions] = useState(false);
  const [showConversation, setShowConversation] = useState(false);

  // Update time every second
  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Show conversation bubbles when there's recent messages
  useEffect(() => {
    if (lastUserMessage || lastClaireMessage) {
      setShowConversation(true);
      // Auto-hide after 8 seconds of idle
      const timeout = setTimeout(() => {
        if (claireState === 'idle') {
          setShowConversation(false);
        }
      }, 8000);
      return () => clearTimeout(timeout);
    }
  }, [lastUserMessage, lastClaireMessage, claireState]);

  // Hide quick actions after inactivity
  useEffect(() => {
    if (showQuickActions) {
      const timeout = setTimeout(() => setShowQuickActions(false), 5000);
      return () => clearTimeout(timeout);
    }
  }, [showQuickActions]);

  const handleScreenTap = useCallback(() => {
    if (claireState === 'idle') {
      setShowQuickActions(prev => !prev);
    }
  }, [claireState]);

  const handleQuickAction = useCallback((action: string) => {
    onQuickAction?.(action);
    setShowQuickActions(false);
  }, [onQuickAction]);

  const getGlowColor = () => {
    switch (claireState) {
      case 'listening':
        return 'rgba(59, 130, 246, 0.4)'; // Blue glow
      case 'thinking':
        return 'rgba(234, 179, 8, 0.3)'; // Yellow glow
      case 'speaking':
        return 'rgba(34, 197, 94, 0.4)'; // Green glow
      default:
        return 'rgba(236, 72, 153, 0.15)'; // Soft pink glow
    }
  };

  const getGlowSize = () => {
    return claireState === 'idle' ? '200px' : '300px';
  };

  return (
    <div 
      className="w-full h-full bg-gray-950 flex flex-col items-center justify-center relative overflow-hidden cursor-pointer"
      onClick={handleScreenTap}
    >
      {/* Reactive ambient glow behind Claire */}
      <div 
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl transition-all duration-700 pointer-events-none"
        style={{
          width: getGlowSize(),
          height: getGlowSize(),
          background: `radial-gradient(circle, ${getGlowColor()} 0%, transparent 70%)`,
        }}
      />

      {/* Secondary ambient particles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {claireState === 'listening' && (
          <>
            <div className="absolute top-1/4 left-1/4 w-32 h-32 bg-blue-500/10 rounded-full blur-2xl animate-pulse" />
            <div className="absolute bottom-1/4 right-1/4 w-24 h-24 bg-blue-400/10 rounded-full blur-2xl animate-pulse" style={{ animationDelay: '500ms' }} />
          </>
        )}
        {claireState === 'speaking' && (
          <>
            <div className="absolute top-1/3 right-1/4 w-28 h-28 bg-green-500/15 rounded-full blur-2xl animate-pulse" />
            <div className="absolute bottom-1/3 left-1/4 w-20 h-20 bg-green-400/10 rounded-full blur-2xl animate-pulse" style={{ animationDelay: '300ms' }} />
          </>
        )}
      </div>
      
      {/* Time display in corner */}
      <div className="absolute top-6 right-6 text-white/50 text-lg font-light z-10">
        {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </div>

      {/* Back to Dashboard button */}
      <Button
        onClick={onBackToDashboard}
        variant="ghost"
        size="sm"
        className="absolute top-6 left-6 text-white/50 hover:text-white hover:bg-white/10 z-10"
      >
        <Home className="w-5 h-5 mr-2" />
        Dashboard
      </Button>

      {/* Conversation bubbles */}
      {showConversation && (lastUserMessage || lastClaireMessage) && (
        <div className="absolute top-8 left-8 right-8 flex flex-col gap-3 z-20 max-w-lg">
          {lastUserMessage && (
            <div className="self-end bg-blue-600/80 backdrop-blur-sm text-white px-4 py-2 rounded-2xl rounded-br-sm text-sm max-w-[80%] animate-in fade-in slide-in-from-right-2 duration-300">
              {lastUserMessage}
            </div>
          )}
          {lastClaireMessage && (
            <div className="self-start bg-white/10 backdrop-blur-sm text-white px-4 py-2 rounded-2xl rounded-bl-sm text-sm max-w-[80%] animate-in fade-in slide-in-from-left-2 duration-300">
              {lastClaireMessage}
            </div>
          )}
        </div>
      )}

      {/* Claire's animated face - centered and prominent */}
      <div className="flex-1 flex items-center justify-center z-10">
        <div className="transform scale-125">
          <AnimatedClaireFace
            isActive={true}
            isListening={claireState === 'listening'}
            isSpeaking={claireState === 'speaking'}
          />
        </div>
      </div>

      {/* Quick action buttons - appear on tap */}
      {showQuickActions && claireState === 'idle' && (
        <div className="absolute inset-0 bg-black/40 flex items-center justify-center z-30 animate-in fade-in duration-200" onClick={(e) => e.stopPropagation()}>
          <button 
            className="absolute top-4 right-4 text-white/60 hover:text-white p-2"
            onClick={() => setShowQuickActions(false)}
          >
            <X className="w-6 h-6" />
          </button>
          <div className="grid grid-cols-2 gap-4 max-w-xs">
            <Button
              onClick={() => handleQuickAction('Call family')}
              className="h-20 bg-white/10 hover:bg-white/20 border border-white/20 text-white flex flex-col gap-2 rounded-xl"
              variant="ghost"
            >
              <Phone className="w-6 h-6" />
              <span className="text-xs">Call Family</span>
            </Button>
            <Button
              onClick={() => handleQuickAction('Show my reminders')}
              className="h-20 bg-white/10 hover:bg-white/20 border border-white/20 text-white flex flex-col gap-2 rounded-xl"
              variant="ghost"
            >
              <Bell className="w-6 h-6" />
              <span className="text-xs">Reminders</span>
            </Button>
            <Button
              onClick={() => handleQuickAction("What's on my schedule today")}
              className="h-20 bg-white/10 hover:bg-white/20 border border-white/20 text-white flex flex-col gap-2 rounded-xl"
              variant="ghost"
            >
              <Calendar className="w-6 h-6" />
              <span className="text-xs">Schedule</span>
            </Button>
            <Button
              onClick={() => handleQuickAction('I need help')}
              className="h-20 bg-red-500/30 hover:bg-red-500/40 border border-red-500/40 text-white flex flex-col gap-2 rounded-xl"
              variant="ghost"
            >
              <HelpCircle className="w-6 h-6" />
              <span className="text-xs">Need Help</span>
            </Button>
          </div>
        </div>
      )}
      
      {/* Status bar at bottom */}
      <div className="absolute bottom-6 left-0 right-0 flex flex-col items-center gap-3 z-10">
        {/* Claire status */}
        <div className={`flex items-center gap-2 transition-all duration-300 ${
          claireState === 'listening' ? 'text-blue-400' :
          claireState === 'thinking' ? 'text-yellow-400' :
          claireState === 'speaking' ? 'text-green-400' : 'text-white/50'
        }`}>
          {claireState === 'listening' && (
            <div className="flex items-center gap-2">
              <Mic className="w-5 h-5 animate-pulse" />
              <div className="flex gap-1">
                <div className="w-1.5 h-4 bg-blue-400 rounded-full animate-pulse" />
                <div className="w-1.5 h-6 bg-blue-400 rounded-full animate-pulse" style={{ animationDelay: '100ms' }} />
                <div className="w-1.5 h-3 bg-blue-400 rounded-full animate-pulse" style={{ animationDelay: '200ms' }} />
                <div className="w-1.5 h-5 bg-blue-400 rounded-full animate-pulse" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          )}
          {claireState === 'speaking' && (
            <div className="flex gap-1">
              <div className="w-1.5 h-5 bg-green-400 rounded-full animate-pulse" />
              <div className="w-1.5 h-3 bg-green-400 rounded-full animate-pulse" style={{ animationDelay: '100ms' }} />
              <div className="w-1.5 h-7 bg-green-400 rounded-full animate-pulse" style={{ animationDelay: '200ms' }} />
              <div className="w-1.5 h-4 bg-green-400 rounded-full animate-pulse" style={{ animationDelay: '300ms' }} />
            </div>
          )}
          {claireState === 'thinking' && (
            <div className="flex gap-1">
              <div className="w-2 h-2 bg-yellow-400 rounded-full animate-bounce" />
              <div className="w-2 h-2 bg-yellow-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <div className="w-2 h-2 bg-yellow-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          )}
          <span className="text-sm font-medium ml-2">
            {claireState === 'listening' ? "I'm listening..." :
             claireState === 'thinking' ? "Let me think..." :
             claireState === 'speaking' ? "" :
             'Tap screen for quick actions'}
          </span>
        </div>
        
        {/* Voice status indicator */}
        <div className="flex items-center gap-3 px-5 py-2 bg-white/5 backdrop-blur-sm rounded-full text-sm">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full transition-colors ${isWakeWordActive ? 'bg-green-500 animate-pulse' : 'bg-gray-500'}`} />
            <span className="text-white/50 text-xs">
              {isWakeWordActive ? 'Say "Claire" to talk' : 'Voice Off'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
