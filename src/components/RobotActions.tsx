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
    intent: 'stop',
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
    <div className="dashboard-card flex flex-col h-full">
      <div className="flex items-center gap-2 sm:gap-3 mb-4 sm:mb-6 min-w-0">
        <Bot className="w-4 h-4 sm:w-5 sm:h-5 text-primary flex-shrink-0" />
        <h2 className="text-base sm:text-lg font-semibold text-foreground truncate">Robot Actions</h2>
      </div>

      <div className="grid gap-2 sm:gap-3 md:gap-4">
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
                'w-full justify-start gap-2 sm:gap-3 md:gap-4 text-left text-xs sm:text-sm',
                action.variant === 'emergency' && !isSuccess && 'animate-none'
              )}
              onClick={() => handleAction(action)}
              disabled={isLoading}
            >
              <div className="flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl bg-background/20 flex-shrink-0">
                {isLoading ? (
                  <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 animate-spin" />
                ) : isSuccess ? (
                  <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6" />
                ) : (
                  <div className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6">
                    {action.icon}
                  </div>
                )}
              </div>
              <div className="flex flex-col min-w-0">
                <span className="font-semibold text-xs sm:text-sm md:text-base truncate">{action.label}</span>
                <span className="text-xs opacity-80">
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
