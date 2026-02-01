import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';

interface AnimatedClaireFaceProps {
  isActive?: boolean;
  isListening?: boolean;
  isSpeaking?: boolean;
  className?: string;
}

export function AnimatedClaireFace({
  isActive = true,
  isListening = false,
  isSpeaking = false,
  className,
}: AnimatedClaireFaceProps) {
  const [eyePosition, setEyePosition] = useState({ x: 0, y: 0 });
  const [mouthOpen, setMouthOpen] = useState(false);
  const [isBlinking, setIsBlinking] = useState(false);
  const [idleBreathing, setIdleBreathing] = useState(0);

  // Idle blinking animation
  useEffect(() => {
    if (!isListening && !isSpeaking) {
      const blinkInterval = setInterval(() => {
        setIsBlinking(true);
        setTimeout(() => setIsBlinking(false), 150);
      }, 3000 + Math.random() * 2000); // Blink every 3-5 seconds
      return () => clearInterval(blinkInterval);
    }
  }, [isListening, isSpeaking]);

  // Subtle idle breathing/floating animation
  useEffect(() => {
    if (!isListening && !isSpeaking) {
      const breatheInterval = setInterval(() => {
        setIdleBreathing((prev) => (prev + 1) % 360);
      }, 50);
      return () => clearInterval(breatheInterval);
    }
  }, [isListening, isSpeaking]);

  // Subtle idle eye movement (looking around gently)
  useEffect(() => {
    if (!isListening && !isSpeaking) {
      const idleLookInterval = setInterval(() => {
        // Gentle, small movements when idle
        setEyePosition({
          x: Math.random() * 3 - 1.5,
          y: Math.random() * 2 - 1,
        });
      }, 2500 + Math.random() * 1500);
      return () => clearInterval(idleLookInterval);
    }
  }, [isListening, isSpeaking]);

  // Animate mouth when speaking
  useEffect(() => {
    if (isSpeaking) {
      const interval = setInterval(() => {
        setMouthOpen((prev) => !prev);
      }, 150);
      return () => clearInterval(interval);
    }
  }, [isSpeaking]);

  // Animate eye movement based on listening state
  useEffect(() => {
    if (isListening) {
      const interval = setInterval(() => {
        setEyePosition({
          x: Math.random() * 6 - 3,
          y: Math.random() * 4 - 2,
        });
      }, 1000);
      return () => clearInterval(interval);
    } else {
      setEyePosition({ x: 0, y: 0 });
    }
  }, [isListening]);

  if (!isActive) {
    return null;
  }

  return (
    <div className={cn('flex flex-col items-center justify-center w-full h-full', className)}>
      {/* Face Container with subtle breathing animation */}
      <div 
        className="relative w-48 h-56 sm:w-64 sm:h-80 md:w-80 md:h-96 rounded-full bg-gradient-to-b from-white to-slate-50 shadow-2xl flex items-center justify-center border-4 border-blue-200 transition-transform duration-300"
        style={{
          transform: `translateY(${Math.sin(idleBreathing * Math.PI / 180) * 2}px)`,
        }}
      >
        {/* Left Eye */}
        <div className="absolute top-16 sm:top-20 md:top-28 left-12 sm:left-16 md:left-20 w-12 h-12 sm:w-16 sm:h-16 md:w-20 md:h-20 bg-white rounded-full border-2 border-blue-300 flex items-center justify-center shadow-inner overflow-hidden">
          {/* Eyelid for blinking */}
          <div 
            className="absolute inset-0 bg-slate-100 transition-transform duration-75 origin-top z-10"
            style={{
              transform: isBlinking ? 'scaleY(1)' : 'scaleY(0)',
            }}
          />
          <div
            className={cn(
              'w-6 h-6 sm:w-8 sm:h-8 md:w-10 md:h-10 bg-blue-500 rounded-full transition-transform duration-300',
              isListening && 'animate-pulse'
            )}
            style={{
              transform: `translate(${eyePosition.x}px, ${eyePosition.y}px)`,
            }}
          >
            {/* Eye shine/highlight */}
            <div className="absolute top-1.5 left-1.5 w-2 h-2 sm:w-3 sm:h-3 bg-white rounded-full opacity-80" />
          </div>
        </div>

        {/* Right Eye */}
        <div className="absolute top-16 sm:top-20 md:top-28 right-12 sm:right-16 md:right-20 w-12 h-12 sm:w-16 sm:h-16 md:w-20 md:h-20 bg-white rounded-full border-2 border-blue-300 flex items-center justify-center shadow-inner overflow-hidden">
          {/* Eyelid for blinking */}
          <div 
            className="absolute inset-0 bg-slate-100 transition-transform duration-75 origin-top z-10"
            style={{
              transform: isBlinking ? 'scaleY(1)' : 'scaleY(0)',
            }}
          />
          <div
            className={cn(
              'w-6 h-6 sm:w-8 sm:h-8 md:w-10 md:h-10 bg-blue-500 rounded-full transition-transform duration-300',
              isListening && 'animate-pulse'
            )}
            style={{
              transform: `translate(${eyePosition.x}px, ${eyePosition.y}px)`,
            }}
          >
            {/* Eye shine/highlight */}
            <div className="absolute top-1.5 left-1.5 w-2 h-2 sm:w-3 sm:h-3 bg-white rounded-full opacity-80" />
          </div>
        </div>

        {/* Smile Mouth */}
        <div className="absolute bottom-12 sm:bottom-16 md:bottom-20 flex flex-col items-center">
          {/* Mouth curve */}
          <svg
            width={mouthOpen ? '80' : '120'}
            height={mouthOpen ? '40' : '30'}
            viewBox="0 0 120 40"
            className="transition-all duration-200"
          >
            <path
              d={
                mouthOpen
                  ? 'M 10 10 Q 60 50 110 10' // Open smile
                  : 'M 10 25 Q 60 40 110 25' // Normal smile
              }
              stroke="#3b82f6"
              strokeWidth="3"
              fill="none"
              strokeLinecap="round"
            />
          </svg>

          {/* Tongue (when speaking) */}
          {isSpeaking && (
            <div className="w-6 h-3 sm:w-8 sm:h-4 bg-blue-300 rounded-b-full mt-1 opacity-70 animate-pulse" />
          )}
        </div>

        {/* Listening indicator - pulsing glow */}
        {isListening && (
          <div className="absolute inset-0 rounded-full border-2 border-blue-400 animate-pulse opacity-50" />
        )}

        {/* Speaking indicator - pulsing glow */}
        {isSpeaking && (
          <div className="absolute inset-0 rounded-full border-2 border-green-400 animate-pulse opacity-50" />
        )}
      </div>

      {/* Status Text */}
      <div className="mt-6 sm:mt-8 text-center">
        {isListening && (
          <div className="flex flex-col items-center gap-2">
            <p className="text-sm sm:text-base font-semibold text-blue-600 animate-pulse">
              Listening...
            </p>
            <div className="flex gap-1">
              <div className="w-1 h-3 sm:h-4 bg-blue-400 rounded-full animate-pulse" />
              <div className="w-1 h-3 sm:h-4 bg-blue-400 rounded-full animate-pulse" style={{ animationDelay: '150ms' }} />
              <div className="w-1 h-3 sm:h-4 bg-blue-400 rounded-full animate-pulse" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        )}

        {isSpeaking && (
          <div className="flex flex-col items-center gap-2">
            <p className="text-sm sm:text-base font-semibold text-green-600 animate-pulse">
              Speaking...
            </p>
            <div className="flex gap-1">
              <div className="w-1 h-3 sm:h-4 bg-green-400 rounded-full animate-pulse" />
              <div className="w-1 h-3 sm:h-4 bg-green-400 rounded-full animate-pulse" style={{ animationDelay: '150ms' }} />
              <div className="w-1 h-3 sm:h-4 bg-green-400 rounded-full animate-pulse" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        )}

        {!isListening && !isSpeaking && (
          <p className="text-sm sm:text-base text-muted-foreground">Claire is ready</p>
        )}
      </div>
    </div>
  );
}
