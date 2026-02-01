// src/components/NurseAssistant.tsx
/**
 * NurseAssistant Component
 * Enhanced nursing robot capabilities including:
 * - Vital signs checking
 * - Pain and mood assessment
 * - Medication reminders
 * - Room service requests
 * - Health tips and wellness advice
 * - Emergency assistance
 */

import { useState } from 'react';
import {
  Heart,
  Smile,
  AlertCircle,
  Pill,
  ThermometerSun,
  Coffee,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';
import { useToast } from '@/components/ui/use-toast';

interface NurseFeature {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  intent: string;
  urgent?: boolean;
  color: string;
}

const NURSE_FEATURES: NurseFeature[] = [
  {
    id: 'vitals',
    title: 'Check Vitals',
    description: 'Monitor heart rate, blood pressure, and temperature',
    icon: <Heart className="w-5 h-5" />,
    intent: 'check_vitals',
    color: 'from-red-900 to-red-700',
  },
  {
    id: 'pain',
    title: 'Pain Assessment',
    description: 'Report pain level and get assistance',
    icon: <AlertCircle className="w-5 h-5" />,
    intent: 'pain_assessment',
    color: 'from-orange-900 to-orange-700',
  },
  {
    id: 'mood',
    title: 'Mood Check',
    description: 'Share how you\'re feeling today',
    icon: <Smile className="w-5 h-5" />,
    intent: 'mood_check',
    color: 'from-yellow-900 to-yellow-700',
  },
  {
    id: 'medication',
    title: 'Medication Help',
    description: 'Reminders and medication tracking',
    icon: <Pill className="w-5 h-5" />,
    intent: 'medication_reminder',
    color: 'from-blue-900 to-blue-700',
  },
  {
    id: 'room_service',
    title: 'Room Service',
    description: 'Request water, towels, meals, or assistance',
    icon: <Coffee className="w-5 h-5" />,
    intent: 'room_service',
    color: 'from-green-900 to-green-700',
  },
  {
    id: 'health_tips',
    title: 'Health Tips',
    description: 'Get personalized wellness advice',
    icon: <TrendingUp className="w-5 h-5" />,
    intent: 'health_tips',
    color: 'from-purple-900 to-purple-700',
  },
  {
    id: 'nurse',
    title: 'Call Nurse',
    description: 'Get immediate nursing assistance',
    icon: <Zap className="w-5 h-5" />,
    intent: 'call_nurse',
    color: 'from-cyan-900 to-cyan-700',
  },
  {
    id: 'emergency',
    title: 'Emergency',
    description: 'Call emergency services immediately',
    icon: <AlertCircle className="w-5 h-5" />,
    intent: 'emergency',
    urgent: true,
    color: 'from-red-900 to-red-700',
  },
];

interface NurseAssistantProps {
  isEnabled: boolean;
  onFeatureExecuted?: (feature: string) => void;
}

export function NurseAssistant({
  isEnabled,
  onFeatureExecuted,
}: NurseAssistantProps) {
  const [isExecuting, setIsExecuting] = useState<string | null>(null);
  const [lastExecutedFeature, setLastExecutedFeature] = useState<string>('');
  const { toast } = useToast();

  const handleFeatureClick = async (feature: NurseFeature) => {
    if (!isEnabled) {
      toast({
        title: 'Assistant Disabled',
        description: 'Enable the voice assistant first',
        variant: 'destructive',
      });
      return;
    }

    if (isExecuting) {
      return; // Prevent multiple simultaneous executions
    }

    setIsExecuting(feature.id);

    try {
      // Send command to backend
      const payload: { intent: string; slots: Record<string, string> } = {
        intent: feature.intent,
        slots: {},
      };

      // Special handling for room service
      if (feature.intent === 'room_service') {
        payload.slots.service_type = 'general';
      }

      await api.sendCommand(payload);
      setLastExecutedFeature(feature.title);

      toast({
        title: 'Command Sent',
        description: `${feature.title} feature activated`,
      });

      if (onFeatureExecuted) {
        onFeatureExecuted(feature.id);
      }
    } catch (error) {
      console.error(`Failed to execute ${feature.intent}:`, error);
      toast({
        title: 'Command Failed',
        description: `Could not execute ${feature.title}`,
        variant: 'destructive',
      });
    } finally {
      setIsExecuting(null);
    }
  };

  return (
    <div className="dashboard-card flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 sm:mb-6 gap-3 min-w-0">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <Heart className="w-4 h-4 sm:w-5 sm:h-5 text-primary flex-shrink-0" />
          <h2 className="text-base sm:text-lg font-semibold text-foreground truncate">
            Nurse Features
          </h2>
        </div>

        <div className={cn(
          'px-2 py-1 rounded-full text-xs font-semibold',
          isEnabled ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
        )}>
          {isEnabled ? '✓ Active' : 'Disabled'}
        </div>
      </div>

      {/* Features Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3 flex-1 overflow-y-auto">
        {NURSE_FEATURES.map((feature) => (
          <button
            key={feature.id}
            onClick={() => handleFeatureClick(feature)}
            disabled={!isEnabled || (isExecuting !== null && isExecuting !== feature.id)}
            className={cn(
              'relative overflow-hidden rounded-lg p-3 sm:p-4 transition-all duration-200',
              'flex flex-col items-start gap-2 sm:gap-3',
              'border border-gray-200 hover:border-gray-300',
              'hover:shadow-md active:scale-95',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              'bg-gradient-to-br',
              feature.urgent
                ? 'from-red-50 to-red-100 hover:from-red-100 hover:to-red-200'
                : 'from-slate-50 to-slate-100 hover:from-slate-100 hover:to-slate-200'
            )}
          >
            {/* Background accent */}
            <div
              className={cn(
                'absolute inset-0 opacity-5',
                `bg-gradient-to-br ${feature.color}`
              )}
            />

            {/* Animated loading state */}
            {isExecuting === feature.id && (
              <div className="absolute inset-0 bg-white/20 animate-pulse" />
            )}

            {/* Content */}
            <div className="relative z-10 w-full text-left">
              {/* Icon */}
              <div
                className={cn(
                  'w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center mb-2',
                  feature.urgent ? 'bg-red-200 text-red-700' : 'bg-slate-200 text-slate-700'
                )}
              >
                {feature.icon}
              </div>

              {/* Title */}
              <h3 className="text-xs sm:text-sm font-semibold text-gray-900 line-clamp-2">
                {feature.title}
              </h3>

              {/* Description */}
              <p className="text-xs text-gray-600 mt-1 line-clamp-2">
                {feature.description}
              </p>
            </div>

            {/* Loading indicator */}
            {isExecuting === feature.id && (
              <div className="relative z-20 mt-2 flex items-center gap-1">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-500 opacity-75" />
                  <span className="relative inline-flex rounded-full h-full w-full bg-blue-500" />
                </span>
                <span className="text-xs text-blue-600 font-medium">
                  Executing...
                </span>
              </div>
            )}
          </button>
        ))}
      </div>

      {/* Status Footer */}
      {lastExecutedFeature && (
        <div className="mt-4 pt-3 border-t border-gray-200">
          <p className="text-xs text-gray-600">
            <span className="font-semibold">Last action:</span> {lastExecutedFeature}
          </p>
        </div>
      )}
    </div>
  );
}
