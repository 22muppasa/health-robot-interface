import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { AnimatedClaireFace } from '@/components/AnimatedClaireFace';

interface ClaireFullScreenProps {
  isOpen: boolean;
  isListening: boolean;
  isSpeaking: boolean;
  lastTranscript: string;
  lastResponse: string;
  onClose: () => void;
}

/**
 * Full-screen modal for Claire face that shows when "Claire" is called
 */
export function ClaireFullScreen({
  isOpen,
  isListening,
  isSpeaking,
  lastTranscript,
  lastResponse,
  onClose,
}: ClaireFullScreenProps) {
  const [displayText, setDisplayText] = useState('');

  // Show current transcript while listening, or latest response while speaking
  useEffect(() => {
    if (isListening && lastTranscript) {
      setDisplayText(`You said: "${lastTranscript}"`);
    } else if (isSpeaking && lastResponse) {
      setDisplayText(`Claire: ${lastResponse}`);
    } else if (!isListening && !isSpeaking) {
      setDisplayText('');
    }
  }, [isListening, isSpeaking, lastTranscript, lastResponse]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 flex flex-col items-center justify-center overflow-hidden">
      {/* Close Button */}
      <button
        onClick={onClose}
        className="absolute top-4 sm:top-6 right-4 sm:right-6 p-2 hover:bg-white/50 rounded-full transition-colors"
        aria-label="Close Claire"
      >
        <X className="w-6 h-6 sm:w-8 sm:h-8 text-muted-foreground" />
      </button>

      {/* Main Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 w-full">
        {/* Animated Claire Face - Consistent across all views */}
        <div className="w-full max-w-md flex-1 flex items-center justify-center">
          <AnimatedClaireFace 
            isActive={true}
            isListening={isListening} 
            isSpeaking={isSpeaking}
            className="scale-110"
          />
        </div>

        {/* Transcript/Response Display */}
        {displayText && (
          <div className="mt-4 text-center max-w-lg px-4">
            <p className={`text-sm sm:text-base ${isListening ? 'text-muted-foreground' : 'text-foreground'}`}>
              {displayText}
            </p>
          </div>
        )}
      </div>

      {/* Bottom Info */}
      <div className="pb-6 sm:pb-8 text-center text-xs sm:text-sm text-muted-foreground">
        <p>Press ESC or click X to close</p>
      </div>
    </div>
  );
}
