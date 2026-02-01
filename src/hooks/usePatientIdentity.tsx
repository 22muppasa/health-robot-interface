import { useState, useEffect, useCallback } from 'react';

interface DeviceIdentity {
  deviceId: string;
  patientId: string;
  patientName: string;
  roomNumber?: string;
  settings: Record<string, any>;
  contacts: any[];
}

interface UsePatientIdentityReturn {
  identity: DeviceIdentity | null;
  isLoading: boolean;
  isPaired: boolean;
  error: string | null;
  pair: (pairingCode: string) => Promise<boolean>;
  unpair: () => Promise<void>;
  refresh: () => Promise<void>;
  getApiHeaders: () => Record<string, string>;
}

export function usePatientIdentity(): UsePatientIdentityReturn {
  const [identity, setIdentity] = useState<DeviceIdentity | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Check for existing pairing on mount
  useEffect(() => {
    checkExistingPairing();
  }, []);

  const checkExistingPairing = async () => {
    setIsLoading(true);
    setError(null);

    const deviceId = localStorage.getItem('claire_device_id');
    const patientId = localStorage.getItem('claire_patient_id');

    if (!deviceId || !patientId) {
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/device/identity', {
        headers: { 'X-Device-Id': deviceId }
      });

      if (response.ok) {
        const data = await response.json();
        setIdentity({
          deviceId,
          patientId: data.patient_id,
          patientName: data.patient_name,
          roomNumber: data.room_number,
          settings: data.settings || {},
          contacts: data.contacts || []
        });
        
        // Update localStorage with fresh data
        localStorage.setItem('claire_patient_name', data.patient_name);
        if (data.room_number) {
          localStorage.setItem('claire_room_number', data.room_number);
        }
      } else if (response.status === 404) {
        // Device not paired - clear local storage
        localStorage.removeItem('claire_patient_id');
        localStorage.removeItem('claire_patient_name');
        localStorage.removeItem('claire_room_number');
      }
    } catch (err) {
      console.error('Error checking device identity:', err);
      // Use cached values if available
      const cachedName = localStorage.getItem('claire_patient_name');
      if (cachedName) {
        setIdentity({
          deviceId,
          patientId,
          patientName: cachedName,
          roomNumber: localStorage.getItem('claire_room_number') || undefined,
          settings: {},
          contacts: []
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const pair = useCallback(async (pairingCode: string): Promise<boolean> => {
    setIsLoading(true);
    setError(null);

    let deviceId = localStorage.getItem('claire_device_id');

    // Register device if needed
    if (!deviceId) {
      try {
        const deviceSerial = `device-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const registerResponse = await fetch('/api/device/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ device_serial: deviceSerial })
        });

        if (registerResponse.ok) {
          const data = await registerResponse.json();
          deviceId = data.device_id;
          localStorage.setItem('claire_device_id', deviceId);
          localStorage.setItem('claire_device_serial', deviceSerial);
        } else {
          throw new Error('Failed to register device');
        }
      } catch (err) {
        setError('Failed to register device');
        setIsLoading(false);
        return false;
      }
    }

    try {
      const response = await fetch('/api/device/pair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          device_id: deviceId,
          pairing_code: pairingCode
        })
      });

      const data = await response.json();

      if (data.success) {
        localStorage.setItem('claire_patient_id', data.patient_id);
        localStorage.setItem('claire_patient_name', data.patient_name);
        if (data.room_number) {
          localStorage.setItem('claire_room_number', data.room_number);
        }

        setIdentity({
          deviceId: deviceId!,
          patientId: data.patient_id,
          patientName: data.patient_name,
          roomNumber: data.room_number,
          settings: {},
          contacts: []
        });

        // Fetch full identity
        await checkExistingPairing();
        return true;
      } else {
        setError(data.message || 'Invalid pairing code');
        return false;
      }
    } catch (err) {
      setError('Failed to pair device');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const unpair = useCallback(async () => {
    const deviceId = localStorage.getItem('claire_device_id');
    
    if (deviceId) {
      try {
        await fetch('/api/device/unpair', {
          method: 'POST',
          headers: { 'X-Device-Id': deviceId }
        });
      } catch (err) {
        console.error('Error unpairing:', err);
      }
    }

    // Clear local storage
    localStorage.removeItem('claire_patient_id');
    localStorage.removeItem('claire_patient_name');
    localStorage.removeItem('claire_room_number');
    
    setIdentity(null);
  }, []);

  const refresh = useCallback(async () => {
    await checkExistingPairing();
  }, []);

  const getApiHeaders = useCallback((): Record<string, string> => {
    const deviceId = localStorage.getItem('claire_device_id');
    return deviceId ? { 'X-Device-Id': deviceId } : {};
  }, []);

  return {
    identity,
    isLoading,
    isPaired: identity !== null,
    error,
    pair,
    unpair,
    refresh,
    getApiHeaders
  };
}
