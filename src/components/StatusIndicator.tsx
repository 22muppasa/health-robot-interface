import { cn } from '@/lib/utils';

type StatusType = 'success' | 'warning' | 'error' | 'info' | 'muted';

interface StatusIndicatorProps {
  status: StatusType;
  label: string;
  pulse?: boolean;
  className?: string;
}

const statusColors: Record<StatusType, { bg: string; dot: string }> = {
  success: { bg: 'bg-success/15', dot: 'bg-success' },
  warning: { bg: 'bg-warning/15', dot: 'bg-warning' },
  error: { bg: 'bg-destructive/15', dot: 'bg-destructive' },
  info: { bg: 'bg-info/15', dot: 'bg-info' },
  muted: { bg: 'bg-muted', dot: 'bg-muted-foreground' },
};

export function StatusIndicator({ status, label, pulse = false, className }: StatusIndicatorProps) {
  const colors = statusColors[status];

  return (
    <div
      className={cn(
        'inline-flex items-center gap-2.5 px-4 py-2 rounded-full text-sm font-medium',
        colors.bg,
        className
      )}
    >
      <span className="relative flex h-2.5 w-2.5">
        {pulse && (
          <span
            className={cn(
              'absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping',
              colors.dot
            )}
          />
        )}
        <span className={cn('relative inline-flex rounded-full h-2.5 w-2.5', colors.dot)} />
      </span>
      <span className="text-foreground">{label}</span>
    </div>
  );
}
