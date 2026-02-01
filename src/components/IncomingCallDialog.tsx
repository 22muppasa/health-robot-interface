import { useEffect, useState } from 'react';
import { Phone, PhoneOff, Volume2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface IncomingCallDialogProps {
  isVisible: boolean;
  callerName: string;
  callerRole?: string;
  onAnswer: () => void;
  onReject: () => void;
}

export function IncomingCallDialog({
  isVisible,
  callerName,
  callerRole = 'Guardian',
  onAnswer,
  onReject,
}: IncomingCallDialogProps) {
  const [isRinging, setIsRinging] = useState(false);

  // Ring animation
  useEffect(() => {
    if (!isVisible) return;
    
    const ringInterval = setInterval(() => {
      setIsRinging((prev) => !prev);
    }, 600);

    return () => clearInterval(ringInterval);
  }, [isVisible]);

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-card rounded-lg shadow-2xl p-8 max-w-sm w-full mx-4 border border-border">
        {/* Ringing animation */}
        <div className="flex justify-center mb-6">
          <div className={cn(
            'w-24 h-24 rounded-full bg-gradient-to-br from-primary to-primary/50 flex items-center justify-center transition-all duration-300',
            isRinging && 'scale-110 shadow-lg'
          )}>
            <Phone className="w-12 h-12 text-white" />
          </div>
        </div>

        {/* Call Info */}
        <div className="text-center mb-8">
          <p className="text-muted-foreground text-sm mb-2">Incoming call from</p>
          <h2 className="text-2xl font-bold text-foreground mb-1">{callerName}</h2>
          <p className="text-sm text-primary font-semibold">{callerRole}</p>
        </div>

        {/* Ringing indicator */}
        <div className="flex justify-center gap-2 mb-6">
          <div className="animate-bounce w-2 h-2 bg-primary rounded-full" style={{ animationDelay: '0ms' }}></div>
          <div className="animate-bounce w-2 h-2 bg-primary rounded-full" style={{ animationDelay: '150ms' }}></div>
          <div className="animate-bounce w-2 h-2 bg-primary rounded-full" style={{ animationDelay: '300ms' }}></div>
        </div>

        {/* Sound indicator */}
        <div className="flex justify-center mb-8 text-muted-foreground animate-pulse">
          <Volume2 className="w-4 h-4" />
        </div>

        {/* Action Buttons */}
        <div className="flex gap-4">
          <Button
            onClick={onReject}
            variant="destructive"
            className="flex-1 gap-2"
            size="lg"
          >
            <PhoneOff className="w-5 h-5" />
            Decline
          </Button>
          <Button
            onClick={onAnswer}
            variant="default"
            className="flex-1 gap-2"
            size="lg"
          >
            <Phone className="w-5 h-5" />
            Answer
          </Button>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-4">
          Tap Answer to accept the call
        </p>
      </div>
    </div>
  );
}
