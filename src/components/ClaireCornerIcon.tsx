import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Volume2 } from 'lucide-react';

interface ClaireCornerIconProps {
  isListening?: boolean;
  isVisible?: boolean;
  onClick?: () => void;
}

export function ClaireCornerIcon({ isListening = false, isVisible = true, onClick }: ClaireCornerIconProps) {
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    if (isListening) {
      setIsAnimating(true);
    } else {
      setIsAnimating(false);
    }
  }, [isListening]);

  if (!isVisible) return null;

  return (
    <button
      onClick={onClick}
      className={cn(
        'fixed bottom-4 right-4 z-40 transition-all duration-300 cursor-pointer',
        'w-16 h-16 rounded-full',
        'bg-gradient-to-br from-primary to-primary/70',
        'shadow-lg hover:shadow-xl',
        'flex items-center justify-center',
        'border-2 border-white',
        isListening && 'ring-4 ring-green-400'
      )}
      title={isListening ? 'Claire is listening' : 'Click to speak to Claire'}
    >
      {/* Claire's face - simple smiley */}
      <div className="relative w-full h-full flex items-center justify-center">
        {/* Background circle */}
        <div className="absolute inset-0 rounded-full bg-gradient-to-br from-amber-100 to-amber-50 flex items-center justify-center">
          {/* Eyes */}
          <div className="absolute top-5 left-4 w-2 h-2 bg-gray-800 rounded-full"></div>
          <div className="absolute top-5 right-4 w-2 h-2 bg-gray-800 rounded-full"></div>

          {/* Mouth */}
          <div className="absolute bottom-5 left-6 right-6">
            {isListening ? (
              <Volume2 className="w-4 h-4 text-gray-800 mx-auto animate-pulse" />
            ) : (
              <div className="text-center text-lg">😊</div>
            )}
          </div>
        </div>

        {/* Listening indicator rings */}
        {isListening && (
          <>
            <div className="absolute inset-0 rounded-full border-2 border-green-400 animate-ping opacity-75"></div>
            <div className="absolute inset-1 rounded-full border border-green-300 animate-pulse"></div>
          </>
        )}
      </div>
    </button>
  );
}
