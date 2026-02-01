import { type ClaireMode } from '@/hooks/useMode';
import { FaceModeView } from './modes/FaceModeView';
import { AmbientModeView } from './modes/AmbientModeView';
import { SleepModeView } from './modes/SleepModeView';
import { EmergencyModeView } from './modes/EmergencyModeView';
import { CompanionModeView } from './modes/CompanionModeView';
import { PhotoFrameModeView } from './modes/PhotoFrameModeView';

export interface ModeRendererProps {
  mode: ClaireMode;
  claireState: 'idle' | 'listening' | 'thinking' | 'speaking';
  isWakeWordActive?: boolean;
  onSendMessage?: (message: string) => void;
  onCallContact?: (name: string) => void;
  onQuickAction?: (action: string) => void;
  onBackToDashboard?: () => void;
  lastUserMessage?: string;
  lastClaireMessage?: string;
  children?: React.ReactNode; // For rendering custom chat mode content
}

export function ModeRenderer({
  mode,
  claireState,
  isWakeWordActive = true,
  onSendMessage,
  onCallContact,
  onQuickAction,
  onBackToDashboard,
  lastUserMessage,
  lastClaireMessage,
  children,
}: ModeRendererProps) {
  // Transition wrapper for smooth mode switches
  const transitionClass = "transition-opacity duration-300 ease-in-out";

  switch (mode) {
    case 'face':
      return (
        <div className={`w-full h-full ${transitionClass}`}>
          <FaceModeView 
            claireState={claireState} 
            isWakeWordActive={isWakeWordActive}
            lastUserMessage={lastUserMessage}
            lastClaireMessage={lastClaireMessage}
            onQuickAction={onQuickAction}
            onBackToDashboard={onBackToDashboard}
          />
        </div>
      );

    case 'ambient':
      return (
        <div className={`w-full h-full ${transitionClass}`}>
          <AmbientModeView 
            claireState={claireState} 
            isWakeWordActive={isWakeWordActive}
            onBackToDashboard={onBackToDashboard}
          />
        </div>
      );

    case 'sleep':
      return (
        <div className={`w-full h-full ${transitionClass}`}>
          <SleepModeView 
            claireState={claireState} 
            isWakeWordActive={isWakeWordActive}
            lastClaireMessage={lastClaireMessage}
            onBackToDashboard={onBackToDashboard}
          />
        </div>
      );

    case 'emergency':
      return (
        <div className={`w-full h-full ${transitionClass}`}>
          <EmergencyModeView 
            claireState={claireState} 
            isWakeWordActive={isWakeWordActive}
            onCallContact={onCallContact}
            onBackToDashboard={onBackToDashboard}
          />
        </div>
      );

    case 'companion':
      return (
        <div className={`w-full h-full ${transitionClass}`}>
          <CompanionModeView 
            claireState={claireState} 
            isWakeWordActive={isWakeWordActive}
            onSendMessage={onSendMessage}
            onBackToDashboard={onBackToDashboard}
          />
        </div>
      );

    case 'photo':
      return (
        <div className={`w-full h-full ${transitionClass}`}>
          <PhotoFrameModeView 
            claireState={claireState} 
            isWakeWordActive={isWakeWordActive}
            onBackToDashboard={onBackToDashboard}
          />
        </div>
      );

    case 'chat':
    default:
      // Chat mode renders the children (default dashboard layout)
      return (
        <div className={`w-full h-full ${transitionClass}`}>
          {children}
        </div>
      );
  }
}

// Helper to determine if a mode should hide the header/footer
export function isImmersiveMode(mode: ClaireMode): boolean {
  return mode === 'face' || mode === 'sleep' || mode === 'photo' || mode === 'ambient';
}

// Helper to get mode-specific background class
export function getModeBackgroundClass(mode: ClaireMode): string {
  switch (mode) {
    case 'sleep':
      return 'bg-black';
    case 'emergency':
      return 'bg-gradient-to-b from-red-950 to-gray-900';
    case 'ambient':
      return 'bg-gradient-to-br from-slate-900 to-slate-800';
    case 'photo':
      return 'bg-black';
    default:
      return '';
  }
}
