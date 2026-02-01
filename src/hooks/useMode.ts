import { useState, useEffect, useCallback } from 'react';

// Available modes for Claire's interface
export type ClaireMode = 
  | 'chat'      // Default dashboard with chat panel
  | 'face'      // Full-screen Claire face only
  | 'ambient'   // Smart display with clock, weather, reminders
  | 'sleep'     // Minimal night mode with dim clock
  | 'emergency' // Large emergency call buttons
  | 'companion' // Proactive conversation mode
  | 'photo';    // Photo frame slideshow

export const MODE_INFO: Record<ClaireMode, { label: string; description: string; icon: string }> = {
  chat: { 
    label: 'Chat', 
    description: 'Dashboard with chat panel',
    icon: '💬'
  },
  face: { 
    label: 'Face', 
    description: "Claire's face only",
    icon: '😊'
  },
  ambient: { 
    label: 'Ambient', 
    description: 'Clock, weather, reminders',
    icon: '🕐'
  },
  sleep: { 
    label: 'Sleep', 
    description: 'Minimal night display',
    icon: '🌙'
  },
  emergency: { 
    label: 'Emergency', 
    description: 'Quick call buttons',
    icon: '🚨'
  },
  companion: { 
    label: 'Companion', 
    description: 'Proactive chat mode',
    icon: '🤗'
  },
  photo: { 
    label: 'Photo', 
    description: 'Family photo slideshow',
    icon: '🖼️'
  },
};

export const MODE_LIST = Object.keys(MODE_INFO) as ClaireMode[];

// Alias map for natural language mode switching
export const MODE_ALIASES: Record<string, ClaireMode> = {
  'chat': 'chat',
  'normal': 'chat',
  'dashboard': 'chat',
  'home': 'chat',
  'main': 'chat',
  'default': 'chat',
  'face': 'face',
  'claire': 'face',
  'ambient': 'ambient',
  'clock': 'ambient',
  'display': 'ambient',
  'sleep': 'sleep',
  'night': 'sleep',
  'dark': 'sleep',
  'emergency': 'emergency',
  'help': 'emergency',
  'sos': 'emergency',
  'companion': 'companion',
  'talk': 'companion',
  'friend': 'companion',
  'photo': 'photo',
  'photos': 'photo',
  'pictures': 'photo',
  'frame': 'photo',
};

/**
 * Resolve a mode alias to the actual ClaireMode
 */
export function resolveModeAlias(alias: string): ClaireMode | null {
  const normalized = alias.toLowerCase().trim();
  return MODE_ALIASES[normalized] || (MODE_LIST.includes(normalized as ClaireMode) ? normalized as ClaireMode : null);
}

const STORAGE_KEY = 'claireMode';
const DEFAULT_MODE: ClaireMode = 'chat';

export function useMode() {
  const [currentMode, setCurrentMode] = useState<ClaireMode>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored && MODE_LIST.includes(stored as ClaireMode)) {
        return stored as ClaireMode;
      }
    } catch {
      // localStorage not available
    }
    return DEFAULT_MODE;
  });

  // Persist mode to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, currentMode);
    } catch {
      // localStorage not available
    }
  }, [currentMode]);

  const setMode = useCallback((mode: ClaireMode) => {
    if (MODE_LIST.includes(mode)) {
      setCurrentMode(mode);
    } else {
      console.warn(`Invalid mode: ${mode}`);
    }
  }, []);

  const getModeInfo = useCallback(() => {
    return MODE_INFO[currentMode];
  }, [currentMode]);

  const isImmersiveMode = currentMode === 'face' || currentMode === 'sleep' || currentMode === 'photo';

  return {
    currentMode,
    setMode,
    getModeInfo,
    isImmersiveMode,
    MODE_LIST,
    MODE_INFO,
  };
}
