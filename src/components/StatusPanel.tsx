import { Mic, MicOff, Camera, CameraOff, Wifi, WifiOff, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SystemStatus } from '@/lib/api';

interface StatusPanelProps {
  status: SystemStatus;
}

const assistantStateLabels: Record<SystemStatus['assistant_state'], string> = {
  idle: 'Idle',
  listening: 'Listening',
  processing: 'Processing',
  speaking: 'Speaking',
};

const assistantStateColors: Record<SystemStatus['assistant_state'], string> = {
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
                status.assistant_state === 'idle' ? 'bg-muted-foreground' : 'bg-current'
              )}
            />
          }
          label="Assistant"
          value={assistantStateLabels[status.assistant_state]}
          className={assistantStateColors[status.assistant_state]}
          pulse={status.assistant_state === 'listening' || status.assistant_state === 'processing'}
        />

        {/* Microphone Status */}
        <StatusItem
          icon={status.assistant_enabled ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
          label="Microphone"
          value={status.assistant_enabled ? 'Active' : 'Off'}
          className={status.assistant_enabled ? 'bg-success/15 text-success' : 'bg-muted text-muted-foreground'}
        />

        {/* Camera Status - Placeholder */}
        <StatusItem
          icon={<CameraOff className="w-5 h-5" />}
          label="Camera"
          value="Off"
          className="bg-muted text-muted-foreground"
        />

        {/* Network Status */}
        <StatusItem
          icon={<Wifi className="w-5 h-5" />}
          label="Network"
          value="Connected"
          className="bg-success/15 text-success"
        />
      </div>

      {/* Last Intent */}
      {status.last_intent && (
        <div className="mt-4 p-3 bg-muted rounded-lg">
          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Last Intent</p>
          <p className="text-sm font-medium">{status.last_intent}</p>
        </div>
      )}

      {/* Last Error */}
      {status.last_error && (
        <div className="mt-4 p-3 bg-destructive/10 rounded-lg">
          <p className="text-xs uppercase tracking-wide text-destructive mb-1">Last Error</p>
          <p className="text-sm text-destructive">{status.last_error}</p>
        </div>
      )}
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
