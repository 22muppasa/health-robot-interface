import { Mic, MicOff, Camera, CameraOff, Wifi, WifiOff, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SystemStatus } from '@/lib/api';

interface StatusPanelProps {
  status: SystemStatus;
}

const assistantStateLabels: Record<SystemStatus['assistantState'], string> = {
  idle: 'Idle',
  listening: 'Listening',
  processing: 'Processing',
  speaking: 'Speaking',
};

const assistantStateColors: Record<SystemStatus['assistantState'], string> = {
  idle: 'bg-muted text-muted-foreground',
  listening: 'bg-info/15 text-info',
  processing: 'bg-warning/15 text-warning',
  speaking: 'bg-success/15 text-success',
};

export function StatusPanel({ status }: StatusPanelProps) {
  return (
    <div className="dashboard-card">
      <div className="flex items-center gap-3 mb-4">
        <Activity className="w-5 h-5 text-primary" />
        <h2 className="text-lg font-semibold text-foreground">System Status</h2>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Assistant State */}
        <StatusItem
          icon={
            <div
              className={cn(
                'w-3 h-3 rounded-full',
                status.assistantState === 'idle' ? 'bg-muted-foreground' : 'bg-current'
              )}
            />
          }
          label="Assistant"
          value={assistantStateLabels[status.assistantState]}
          className={assistantStateColors[status.assistantState]}
          pulse={status.assistantState === 'listening' || status.assistantState === 'processing'}
        />

        {/* Microphone Status */}
        <StatusItem
          icon={status.microphoneEnabled ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
          label="Microphone"
          value={status.microphoneEnabled ? 'Active' : 'Off'}
          className={status.microphoneEnabled ? 'bg-success/15 text-success' : 'bg-muted text-muted-foreground'}
        />

        {/* Camera Status */}
        <StatusItem
          icon={status.cameraEnabled ? <Camera className="w-5 h-5" /> : <CameraOff className="w-5 h-5" />}
          label="Camera"
          value={status.cameraEnabled ? 'Active' : 'Off'}
          className={status.cameraEnabled ? 'bg-success/15 text-success' : 'bg-muted text-muted-foreground'}
        />

        {/* Network Status */}
        <StatusItem
          icon={status.networkConnected ? <Wifi className="w-5 h-5" /> : <WifiOff className="w-5 h-5" />}
          label="Network"
          value={status.networkConnected ? 'Connected' : 'Disconnected'}
          className={status.networkConnected ? 'bg-success/15 text-success' : 'bg-destructive/15 text-destructive'}
        />
      </div>
    </div>
  );
}

interface StatusItemProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  className?: string;
  pulse?: boolean;
}

function StatusItem({ icon, label, value, className, pulse }: StatusItemProps) {
  return (
    <div className={cn('flex items-center gap-3 p-4 rounded-xl transition-colors', className)}>
      <div className="relative">
        {pulse && (
          <span className="absolute inset-0 rounded-full animate-ping opacity-40 bg-current" />
        )}
        {icon}
      </div>
      <div className="flex flex-col">
        <span className="text-xs uppercase tracking-wide opacity-70">{label}</span>
        <span className="font-semibold">{value}</span>
      </div>
    </div>
  );
}
