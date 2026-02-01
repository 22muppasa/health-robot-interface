import { useState, useEffect, useRef } from 'react';
import { Moon, Mic, Home } from 'lucide-react';
import { AnimatedClaireFace } from '@/components/AnimatedClaireFace';
import { Button } from '@/components/ui/button';

interface SleepModeViewProps {
  claireState: 'idle' | 'listening' | 'thinking' | 'speaking';
  isWakeWordActive?: boolean;
  lastClaireMessage?: string;
  onBackToDashboard?: () => void;
}

export function SleepModeView({ claireState, isWakeWordActive = true, lastClaireMessage, onBackToDashboard }: SleepModeViewProps) {
  const [time, setTime] = useState(new Date());
  const [showClaireMessage, setShowClaireMessage] = useState(false);
  const lastActiveTime = useRef<Date>(new Date());

  // Update time every minute (power saving)
  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 60000);
    return () => clearInterval(interval);
  }, []);

  // Track activity for dimming
  useEffect(() => {
    if (claireState !== 'idle') {
      lastActiveTime.current = new Date();
    }
  }, [claireState]);

  // Show message briefly when Claire speaks
  useEffect(() => {
    if (lastClaireMessage && claireState === 'speaking') {
      setShowClaireMessage(true);
      const timeout = setTimeout(() => setShowClaireMessage(false), 6000);
      return () => clearTimeout(timeout);
    }
  }, [lastClaireMessage, claireState]);

  const isActive = claireState !== 'idle';
  const dimOpacity = isActive ? 0.8 : 0.12;
  const clockOpacity = isActive ? 0.6 : 0.15;

  return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-black relative overflow-hidden">
      {/* Deep ambient gradient - very subtle */}
      <div 
        className="absolute inset-0 transition-opacity duration-2000"
        style={{
          background: 'radial-gradient(ellipse at 50% 50%, rgba(30, 30, 50, 0.3) 0%, rgba(0, 0, 0, 1) 70%)',
          opacity: isActive ? 0.5 : 0.2,
        }}
      />

      {/* Ambient glow when active */}
      {isActive && (
        <div 
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 rounded-full blur-3xl transition-all duration-1000"
          style={{
            background: claireState === 'listening' 
              ? 'radial-gradient(circle, rgba(59, 130, 246, 0.15) 0%, transparent 70%)'
              : claireState === 'speaking'
              ? 'radial-gradient(circle, rgba(34, 197, 94, 0.15) 0%, transparent 70%)'
              : 'radial-gradient(circle, rgba(234, 179, 8, 0.15) 0%, transparent 70%)',
          }}
        />
      )}

      {/* Very dim clock - becomes slightly brighter when active */}
      <div 
        className="text-center transition-all duration-1000 z-10"
        style={{ opacity: clockOpacity }}
      >
        <div className="text-7xl sm:text-9xl font-extralight text-gray-300 tracking-[0.2em] transition-all duration-1000">
          {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
        <div className="text-lg text-gray-500 mt-4 font-light tracking-wider">
          {time.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })}
        </div>
      </div>

      {/* Moon icon - fades when Claire is active */}
      <Moon 
        className={`w-6 h-6 text-gray-600 mt-16 transition-all duration-1000 ${isActive ? 'opacity-0 scale-50' : 'opacity-20'}`}
      />

      {/* Claire appears gracefully when active */}
      {isActive && (
        <div className="absolute bottom-1/4 flex flex-col items-center gap-6 animate-in fade-in zoom-in-95 duration-700">
          {/* Claire's face - smaller and subtle in sleep mode */}
          <div className="transform scale-75 opacity-90">
            <AnimatedClaireFace
              isActive={true}
              isListening={claireState === 'listening'}
              isSpeaking={claireState === 'speaking'}
            />
          </div>
          
          {/* Listening indicator */}
          {claireState === 'listening' && (
            <div className="flex items-center gap-3 text-blue-400/70">
              <Mic className="w-4 h-4 animate-pulse" />
              <div className="flex gap-1">
                <div className="w-1 h-3 bg-blue-400/60 rounded-full animate-pulse" />
                <div className="w-1 h-5 bg-blue-400/60 rounded-full animate-pulse" style={{ animationDelay: '100ms' }} />
                <div className="w-1 h-2 bg-blue-400/60 rounded-full animate-pulse" style={{ animationDelay: '200ms' }} />
              </div>
              <span className="text-sm">Listening...</span>
            </div>
          )}
          
          {/* Thinking indicator */}
          {claireState === 'thinking' && (
            <div className="flex items-center gap-2 text-yellow-400/60">
              <div className="flex gap-1">
                <div className="w-2 h-2 bg-yellow-400/60 rounded-full animate-bounce" />
                <div className="w-2 h-2 bg-yellow-400/60 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 bg-yellow-400/60 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          )}
          
          {/* Speaking indicator with message */}
          {claireState === 'speaking' && (
            <div className="flex flex-col items-center gap-3 max-w-md px-4">
              {showClaireMessage && lastClaireMessage && (
                <div className="text-gray-400 text-sm text-center leading-relaxed animate-in fade-in duration-500">
                  "{lastClaireMessage}"
                </div>
              )}
              <div className="flex gap-1">
                <div className="w-1 h-4 bg-green-400/50 rounded-full animate-pulse" />
                <div className="w-1 h-2 bg-green-400/50 rounded-full animate-pulse" style={{ animationDelay: '100ms' }} />
                <div className="w-1 h-5 bg-green-400/50 rounded-full animate-pulse" style={{ animationDelay: '200ms' }} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Ultra-dim wake hint when idle */}
      {!isActive && (
        <div 
          className="absolute bottom-8 flex items-center gap-2 transition-opacity duration-1000"
          style={{ opacity: 0.08 }}
        >
          <div className={`w-1 h-1 rounded-full ${isWakeWordActive ? 'bg-green-500' : 'bg-gray-600'}`} />
          <span className="text-gray-500 text-xs font-light tracking-wide">
            {isWakeWordActive ? 'Say "Claire" if you need me' : ''}
          </span>
        </div>
      )}

      {/* Very subtle back button - shows on tap */}
      <Button
        onClick={onBackToDashboard}
        variant="ghost"
        size="sm"
        className="absolute top-6 left-6 text-white/20 hover:text-white/60 hover:bg-white/5 z-10"
      >
        <Home className="w-5 h-5 mr-2" />
        Dashboard
      </Button>
    </div>
  );
}
