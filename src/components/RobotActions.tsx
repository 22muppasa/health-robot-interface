import { useState } from 'react';
import { Stethoscope, Bell, StopCircle, CheckCircle2, Loader2, Bot } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api, RobotCommand } from '@/lib/api';
import { cn } from '@/lib/utils';

interface ActionButton {
  id: string;
  label: string;
  icon: React.ReactNode;
  intent: string;
  variant: 'default' | 'action' | 'emergency' | 'warning';
  slots?: Record<string, string | number | boolean>;
}

const actions: ActionButton[] = [
  {
    id: 'check-vitals',
    label: 'Check Vitals',
    icon: <Stethoscope className="w-6 h-6" />,
    intent: 'check_vitals',
    variant: 'action',
    slots: { type: 'full' },
  },
  {
    id: 'call-nurse',
    label: 'Call Nurse',
    icon: <Bell className="w-6 h-6" />,
    intent: 'call_nurse',
    variant: 'warning',
    slots: { priority: 'normal' },
  },
  {
    id: 'stop-robot',
    label: 'Stop Robot',
    icon: <StopCircle className="w-6 h-6" />,
    intent: 'emergency_stop',
    variant: 'emergency',
    slots: { immediate: true },
  },
];

type ActionState = 'idle' | 'loading' | 'success' | 'error';

export function RobotActions() {
  const [actionStates, setActionStates] = useState<Record<string, ActionState>>(
    Object.fromEntries(actions.map((a) => [a.id, 'idle']))
  );

  const handleAction = async (action: ActionButton) => {
    setActionStates((prev) => ({ ...prev, [action.id]: 'loading' }));

    const command: RobotCommand = {
      intent: action.intent,
      slots: action.slots || {},
    };

    try {
      await api.sendCommand(command);
      setActionStates((prev) => ({ ...prev, [action.id]: 'success' }));

      // Reset to idle after showing success
      setTimeout(() => {
        setActionStates((prev) => ({ ...prev, [action.id]: 'idle' }));
      }, 2000);
    } catch (error) {
      console.error(`Failed to execute ${action.intent}:`, error);
      setActionStates((prev) => ({ ...prev, [action.id]: 'error' }));

      // Reset to idle after showing error
      setTimeout(() => {
        setActionStates((prev) => ({ ...prev, [action.id]: 'idle' }));
      }, 2000);
    }
  };

  return (
    <div className="dashboard-card">
      <div className="flex items-center gap-3 mb-6">
        <Bot className="w-5 h-5 text-primary" />
        <h2 className="text-lg font-semibold text-foreground">Robot Actions</h2>
      </div>

      <div className="grid gap-4">
        {actions.map((action) => {
          const state = actionStates[action.id];
          const isLoading = state === 'loading';
          const isSuccess = state === 'success';

          return (
            <Button
              key={action.id}
              variant={isSuccess ? 'success' : action.variant}
              size="touch-lg"
              className={cn(
                'w-full justify-start gap-4 text-left',
                action.variant === 'emergency' && !isSuccess && 'animate-none'
              )}
              onClick={() => handleAction(action)}
              disabled={isLoading}
            >
              <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-background/20">
                {isLoading ? (
                  <Loader2 className="w-6 h-6 animate-spin" />
                ) : isSuccess ? (
                  <CheckCircle2 className="w-6 h-6" />
                ) : (
                  action.icon
                )}
              </div>
              <div className="flex flex-col">
                <span className="font-semibold text-lg">{action.label}</span>
                <span className="text-sm opacity-80">
                  {isLoading ? 'Processing...' : isSuccess ? 'Command sent!' : `Execute ${action.intent}`}
                </span>
              </div>
            </Button>
          );
        })}
      </div>
    </div>
  );
}
