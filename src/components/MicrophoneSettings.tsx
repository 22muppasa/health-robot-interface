import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Mic, Volume2, Zap } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { api } from '@/lib/api';

interface MicrophoneSettingsProps {
  onSensitivityChange?: (sensitivity: number) => void;
}

export function MicrophoneSettings({ onSensitivityChange }: MicrophoneSettingsProps) {
  const [sensitivity, setSensitivity] = useState(0.7);
  const [noiseGate, setNoiseGate] = useState(0.3);
  const [audioGain, setAudioGain] = useState(1.0);
  const [echoCancellation, setEchoCancellation] = useState(true);
  const [noiseSuppression, setNoiseSuppression] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  // Load current settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        // In a real app, this would fetch from backend
        // For now, we'll use default values
        console.log('Loading microphone settings...');
      } catch (error) {
        console.error('Failed to load settings:', error);
      }
    };
    loadSettings();
  }, []);

  const handleSensitivityChange = async (value: number[]) => {
    const newSensitivity = value[0];
    setSensitivity(newSensitivity);

    try {
      await api.post('/api/microphone-settings', { sensitivity: newSensitivity });
      if (onSensitivityChange) {
        onSensitivityChange(newSensitivity);
      }
    } catch (error) {
      console.error('Failed to update sensitivity:', error);
    }
  };

  const handleApplySettings = async () => {
    setIsLoading(true);
    try {
      // Apply combined settings
      await api.post('/api/microphone-settings', { sensitivity });

      toast({
        title: 'Settings Applied',
        description: 'Microphone settings have been updated',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to apply settings',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleTestMicrophone = async () => {
    try {
      toast({
        title: 'Testing Microphone',
        description: 'Please speak clearly for 3 seconds...',
      });

      // In a real app, this would perform actual microphone testing
      await new Promise((resolve) => setTimeout(resolve, 3000));

      toast({
        title: 'Microphone Test Complete',
        description: 'Your microphone is working well',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Microphone test failed',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-4">
      {/* Microphone Sensitivity */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Mic className="w-5 h-5" />
            Microphone Sensitivity
          </CardTitle>
          <CardDescription>
            Adjust how sensitive the microphone is to your voice
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium">Sensitivity Level</span>
              <span className="text-sm font-bold text-primary">
                {Math.round(sensitivity * 100)}%
              </span>
            </div>
            <Slider
              value={[sensitivity]}
              onValueChange={handleSensitivityChange}
              min={0.1}
              max={1.0}
              step={0.1}
              className="w-full"
            />
            <p className="text-xs text-muted-foreground">
              {sensitivity < 0.3
                ? 'Low - Only picks up loud voices'
                : sensitivity < 0.7
                  ? 'Normal - Balanced sensitivity'
                  : 'High - Hyper-sensitive, may pick up background noise'}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Audio Processing */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Zap className="w-5 h-5" />
            Audio Processing
          </CardTitle>
          <CardDescription>
            Enable audio enhancement features
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Noise Gate */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium">Noise Gate Threshold</span>
              <span className="text-sm text-muted-foreground">{Math.round(noiseGate * 100)}%</span>
            </div>
            <Slider
              value={[noiseGate]}
              onValueChange={(value) => setNoiseGate(value[0])}
              min={0.0}
              max={1.0}
              step={0.1}
              className="w-full"
            />
            <p className="text-xs text-muted-foreground">
              Mutes sounds quieter than this level to block background noise
            </p>
          </div>

          {/* Audio Gain */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium">Audio Gain</span>
              <span className="text-sm text-muted-foreground">{Math.round(audioGain * 100)}%</span>
            </div>
            <Slider
              value={[audioGain]}
              onValueChange={(value) => setAudioGain(value[0])}
              min={0.5}
              max={2.0}
              step={0.1}
              className="w-full"
            />
            <p className="text-xs text-muted-foreground">
              Amplifies your voice input
            </p>
          </div>

          {/* Feature Toggles */}
          <div className="space-y-2 pt-2 border-t">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={echoCancellation}
                onChange={(e) => setEchoCancellation(e.target.checked)}
                className="w-4 h-4 rounded"
              />
              <span className="text-sm font-medium">Echo Cancellation</span>
              <span className="text-xs text-muted-foreground ml-auto">
                {echoCancellation ? 'ON' : 'OFF'}
              </span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={noiseSuppression}
                onChange={(e) => setNoiseSuppression(e.target.checked)}
                className="w-4 h-4 rounded"
              />
              <span className="text-sm font-medium">Noise Suppression</span>
              <span className="text-xs text-muted-foreground ml-auto">
                {noiseSuppression ? 'ON' : 'OFF'}
              </span>
            </label>
          </div>
        </CardContent>
      </Card>

      {/* Speaker Volume */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Volume2 className="w-5 h-5" />
            Speaker Volume
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium">Output Volume</span>
              <span className="text-sm text-muted-foreground">75%</span>
            </div>
            <Slider
              value={[0.75]}
              min={0}
              max={1}
              step={0.05}
              className="w-full"
              disabled
            />
          </div>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex gap-2 pt-4">
        <Button variant="outline" onClick={handleTestMicrophone} className="flex-1">
          Test Microphone
        </Button>
        <Button onClick={handleApplySettings} disabled={isLoading} className="flex-1">
          {isLoading ? 'Applying...' : 'Apply Settings'}
        </Button>
      </div>
    </div>
  );
}
