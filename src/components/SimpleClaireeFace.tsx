import { useState, useEffect } from 'react';

interface SimpleClaireeFaceProps {
  isListening?: boolean;
  isSpeaking?: boolean;
}

/**
 * Minimal Claire face - two blue circle eyes with animated smile
 * Shows different states: idle (gray), listening (blue pulsing), speaking (green)
 */
export function SimpleClaireeFace({
  isListening = false,
  isSpeaking = false,
}: SimpleClaireeFaceProps) {
  const [eyeAnimation, setEyeAnimation] = useState(0);
  const [smileOpen, setSmileOpen] = useState(false);

  // Animate eyes and smile when speaking
  useEffect(() => {
    if (isSpeaking) {
      const interval = setInterval(() => {
        setEyeAnimation((prev) => (prev + 1) % 2);
        setSmileOpen((prev) => !prev);
      }, 400);
      return () => clearInterval(interval);
    } else {
      setEyeAnimation(0);
      setSmileOpen(false);
    }
  }, [isSpeaking]);

  // Determine eye color based on state
  const getEyeColor = () => {
    if (isSpeaking) return 'from-green-400 to-green-500';
    if (isListening) return 'from-blue-400 to-blue-500';
    return 'from-gray-300 to-gray-400';
  };

  const eyeColor = getEyeColor();

  return (
    <div className="flex flex-col items-center justify-center gap-8 sm:gap-12">
      {/* Eyes Container */}
      <div className="flex items-center justify-center gap-8 sm:gap-12">
        {/* Left Eye */}
        <div
          className={`w-12 h-12 sm:w-16 sm:h-16 md:w-20 md:h-20 rounded-full transition-all duration-300 ${
            isSpeaking
              ? eyeAnimation === 1
                ? 'h-2 rounded-full scale-x-125 bg-green-300'
                : 'scale-90 opacity-70'
              : isListening
                ? 'animate-pulse scale-110'
                : 'scale-100 opacity-100'
          } bg-gradient-to-b ${eyeColor} shadow-lg`}
        />

        {/* Right Eye */}
        <div
          className={`w-12 h-12 sm:w-16 sm:h-16 md:w-20 md:h-20 rounded-full transition-all duration-300 ${
            isSpeaking
              ? eyeAnimation === 1
                ? 'h-2 rounded-full scale-x-125 bg-green-300'
                : 'scale-90 opacity-70'
              : isListening
                ? 'animate-pulse scale-110'
                : 'scale-100 opacity-100'
          } bg-gradient-to-b ${eyeColor} shadow-lg`}
        />
      </div>

      {/* Smile */}
      <svg
        width={smileOpen ? '160' : '120'}
        height={smileOpen ? '80' : '40'}
        viewBox="0 0 160 80"
        className="transition-all duration-200"
      >
        {/* Upper lip line */}
        <path
          d="M 20 30 Q 80 60 140 30"
          stroke={isSpeaking ? '#22C55E' : isListening ? '#3B82F6' : '#9CA3AF'}
          strokeWidth="4"
          fill="none"
          strokeLinecap="round"
        />
        {/* Lower lip line */}
        <path
          d={smileOpen ? 'M 30 50 Q 80 70 130 50' : 'M 40 40 Q 80 50 120 40'}
          stroke={isSpeaking ? '#22C55E' : isListening ? '#3B82F6' : '#9CA3AF'}
          strokeWidth="4"
          fill="none"
          strokeLinecap="round"
        />
        {/* Inner mouth fill when smiling */}
        {smileOpen && (
          <ellipse cx="80" cy="55" rx="45" ry="20" fill={isSpeaking ? '#86EFAC' : '#93C5FD'} opacity="0.4" />
        )}
      </svg>
    </div>
  );
}
