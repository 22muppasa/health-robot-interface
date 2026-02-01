import { Mic, MicOff, Wifi, WifiOff, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SystemStatus } from '@/lib/api';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface NavStatusIconsProps {
  status: SystemStatus;
  className?: string;
}

const assistantStateConfig: Record<SystemStatus['assistant_state'], { color: string; label: string }> = {
  idle: { color: 'text-muted-foreground', label: 'Idle' },
  listening: { color: 'text-info animate-pulse', label: 'Listening...' },
  processing: { color: 'text-warning animate-pulse', label: 'Processing...' },
  speaking: { color: 'text-success animate-pulse', label: 'Speaking...' },
};

export function NavStatusIcons({ status, className }: NavStatusIconsProps) {
  const assistantConfig = assistantStateConfig[status.assistant_state];

  return (
    <div className={cn('flex items-center gap-1.5 sm:gap-2', className)}>
      {/* Assistant State */}
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={cn(
            'w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center cursor-default transition-colors',
            status.assistant_state !== 'idle' ? 'bg-primary/10' : 'bg-muted'
          )}>
            <Activity className={cn('w-3.5 h-3.5 sm:w-4 sm:h-4', assistantConfig.color)} />
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p>Assistant: {assistantConfig.label}</p>
        </TooltipContent>
      </Tooltip>

      {/* Microphone Status */}
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={cn(
            'w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center cursor-default transition-colors',
            status.assistant_enabled ? 'bg-success/10' : 'bg-muted'
          )}>
            {status.assistant_enabled ? (
              <Mic className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-success" />
            ) : (
              <MicOff className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-muted-foreground" />
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p>Microphone: {status.assistant_enabled ? 'Active' : 'Off'}</p>
        </TooltipContent>
      </Tooltip>

      {/* Network Status - Always show as connected for now */}
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center cursor-default bg-success/10">
            <Wifi className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-success" />
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p>Network: Connected</p>
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
