import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { toast } from '@/hooks/use-toast';

interface DevicePairingScreenProps {
  onPaired: (patientId: string, patientName: string) => void;
}

const DevicePairingScreen: React.FC<DevicePairingScreenProps> = ({ onPaired }) => {
  const [pairingCode, setPairingCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [deviceId, setDeviceId] = useState<string | null>(null);

  // Generate a device ID on first load
  React.useEffect(() => {
    const stored = localStorage.getItem('claire_device_id');
    if (stored) {
      setDeviceId(stored);
    } else {
      // Register this device
      registerDevice();
    }
  }, []);

  const registerDevice = async () => {
    try {
      // Generate a unique device serial based on browser fingerprint
      const deviceSerial = `device-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      const response = await fetch('/api/device/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_serial: deviceSerial })
      });
      
      if (response.ok) {
        const data = await response.json();
        localStorage.setItem('claire_device_id', data.device_id);
        localStorage.setItem('claire_device_serial', deviceSerial);
        setDeviceId(data.device_id);
      }
    } catch (error) {
      console.error('Failed to register device:', error);
    }
  };

  const handlePair = async () => {
    if (!pairingCode || pairingCode.length < 6) {
      toast({
        title: "Invalid Code",
        description: "Please enter a 6-digit pairing code",
        variant: "destructive"
      });
      return;
    }

    if (!deviceId) {
      await registerDevice();
    }

    setIsLoading(true);
    
    try {
      const response = await fetch('/api/device/pair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          device_id: deviceId || localStorage.getItem('claire_device_id'),
          pairing_code: pairingCode
        })
      });
      
      const data = await response.json();
      
      if (data.success) {
        // Store patient info
        localStorage.setItem('claire_patient_id', data.patient_id);
        localStorage.setItem('claire_patient_name', data.patient_name);
        if (data.room_number) {
          localStorage.setItem('claire_room_number', data.room_number);
        }
        
        toast({
          title: "Paired Successfully!",
          description: `Connected to ${data.patient_name}`,
        });
        
        onPaired(data.patient_id, data.patient_name);
      } else {
        toast({
          title: "Pairing Failed",
          description: data.message || "Invalid pairing code",
          variant: "destructive"
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to connect. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Only allow digits and limit to 8 characters
    const value = e.target.value.replace(/\D/g, '').slice(0, 8);
    setPairingCode(value);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-800 to-indigo-900 flex items-center justify-center p-4">
      <Card className="w-full max-w-md bg-white/10 backdrop-blur-lg border-white/20">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 w-24 h-24 bg-gradient-to-br from-cyan-400 to-blue-500 rounded-full flex items-center justify-center">
            <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
          </div>
          <CardTitle className="text-2xl text-white">Setup CLAIRE Device</CardTitle>
          <CardDescription className="text-white/70">
            Enter the 6-digit pairing code to connect this device to a patient
          </CardDescription>
        </CardHeader>
        
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Input
              type="text"
              inputMode="numeric"
              placeholder="Enter pairing code"
              value={pairingCode}
              onChange={handleCodeChange}
              className="text-center text-2xl tracking-widest bg-white/20 border-white/30 text-white placeholder:text-white/50 h-14"
              maxLength={8}
            />
            <p className="text-xs text-white/50 text-center">
              Ask your nurse or administrator for the pairing code
            </p>
          </div>
          
          <Button
            onClick={handlePair}
            disabled={isLoading || pairingCode.length < 6}
            className="w-full h-12 text-lg bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600"
          >
            {isLoading ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Connecting...
              </span>
            ) : (
              'Connect Device'
            )}
          </Button>
          
          <div className="text-center">
            <p className="text-xs text-white/40">
              Device ID: {deviceId?.slice(0, 8) || 'Generating...'}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default DevicePairingScreen;
