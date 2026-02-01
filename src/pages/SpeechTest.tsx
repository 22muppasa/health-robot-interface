// Speech Recognition Test Page
import { useState, useCallback, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Mic, MicOff, CheckCircle, XCircle, AlertCircle,  RefreshCw, Volume2 } from 'lucide-react';
import { cn } from '@/lib/utils';

// Get speech recognition constructor
const getSpeechRecognition = () => {
  return window.webkitSpeechRecognition || window.SpeechRecognition || null;
};

interface TestResult {
  name: string;
  status: 'pending' | 'testing' | 'pass' | 'fail';
  message?: string;
}

export default function SpeechTest() {
  const [tests, setTests] = useState<TestResult[]>([
    { name: 'HTTPS/Secure Context', status: 'pending' },
    { name: 'Speech API Available', status: 'pending' },
    { name: 'Microphone Permission', status: 'pending' },
    { name: 'Audio Input Detected', status: 'pending' },
    { name: 'Speech Recognition Works', status: 'pending' },
  ]);
  const [isTestingRecognition, setIsTestingRecognition] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [audioLevel, setAudioLevel] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const updateTest = useCallback((index: number, updates: Partial<TestResult>) => {
    setTests(prev => prev.map((t, i) => i === index ? { ...t, ...updates } : t));
  }, []);

  const cleanupAudio = useCallback(() => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setAudioLevel(0);
  }, []);

  const runTests = useCallback(async () => {
    setIsRunning(true);
    cleanupAudio();
    
    // Reset all tests
    setTests(prev => prev.map(t => ({ ...t, status: 'pending', message: undefined })));
    setTranscript('');

    // Test 1: HTTPS/Secure Context
    updateTest(0, { status: 'testing' });
    await new Promise(r => setTimeout(r, 300));
    
    const isSecure = window.location.protocol === 'https:' || 
                     window.location.hostname === 'localhost' || 
                     window.location.hostname === '127.0.0.1' ||
                     window.location.hostname.includes('.app.github.dev') ||
                     window.location.hostname.includes('.github.dev');
    
    if (isSecure) {
      updateTest(0, { status: 'pass', message: `Protocol: ${window.location.protocol}, Host: ${window.location.hostname}` });
    } else {
      updateTest(0, { status: 'fail', message: `Not secure. Need HTTPS. Current: ${window.location.protocol}//${window.location.hostname}` });
      setIsRunning(false);
      return;
    }

    // Test 2: Speech API Available
    updateTest(1, { status: 'testing' });
    await new Promise(r => setTimeout(r, 300));
    
    const SpeechRecognition = getSpeechRecognition();
    if (SpeechRecognition) {
      updateTest(1, { status: 'pass', message: 'webkitSpeechRecognition or SpeechRecognition found' });
    } else {
      updateTest(1, { status: 'fail', message: 'Web Speech API not available. Use Chrome, Edge, or Safari.' });
      setIsRunning(false);
      return;
    }

    // Test 3: Microphone Permission
    updateTest(2, { status: 'testing' });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      updateTest(2, { status: 'pass', message: `Granted. Tracks: ${stream.getAudioTracks().length}` });
    } catch (err: unknown) {
      const error = err as Error;
      updateTest(2, { status: 'fail', message: `Denied: ${error.message}. Check browser permissions.` });
      setIsRunning(false);
      return;
    }

    // Test 4: Audio Input Detected
    updateTest(3, { status: 'testing' });
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const analyser = audioContext.createAnalyser();
      const source = audioContext.createMediaStreamSource(streamRef.current!);
      
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.5;
      source.connect(analyser);
      
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      
      // Monitor audio levels for 3 seconds
      let maxLevel = 0;
      let checks = 0;
      const maxChecks = 30; // 3 seconds at 100ms intervals
      
      await new Promise<void>((resolve) => {
        const checkLevel = () => {
          if (checks >= maxChecks) {
            resolve();
            return;
          }
          
          const dataArray = new Uint8Array(analyser.frequencyBinCount);
          analyser.getByteFrequencyData(dataArray);
          const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
          const level = Math.min(100, avg * 2);
          setAudioLevel(level);
          if (level > maxLevel) maxLevel = level;
          checks++;
          
          animationRef.current = requestAnimationFrame(checkLevel);
        };
        checkLevel();
        
        // Also resolve after timeout
        setTimeout(resolve, 3000);
      });
      
      if (maxLevel > 5) {
        updateTest(3, { status: 'pass', message: `Audio detected! Peak level: ${maxLevel.toFixed(1)}%` });
      } else {
        updateTest(3, { status: 'fail', message: `No audio detected. Peak: ${maxLevel.toFixed(1)}%. Check microphone.` });
      }
    } catch (err: unknown) {
      const error = err as Error;
      updateTest(3, { status: 'fail', message: `Audio analysis failed: ${error.message}` });
    }

    // Test 5: Speech Recognition Works
    updateTest(4, { status: 'testing' });
    setIsTestingRecognition(true);
    
    try {
      // Stop the mic stream before starting recognition to avoid conflicts
      cleanupAudio();
      await new Promise(r => setTimeout(r, 300));
      
      const result = await new Promise<{ success: boolean; message: string; transcript?: string }>((resolve) => {
        const SpeechRecognition = getSpeechRecognition();
        const recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = true;
        recognition.lang = 'en-US';
        recognition.maxAlternatives = 3;
        
        let lastTranscript = '';
        let hasResult = false;
        
        const timeout = setTimeout(() => {
          if (!hasResult) {
            try { recognition.stop(); } catch {
              // Ignore stop errors
            }
            resolve({ success: false, message: 'Timeout - no speech detected in 8 seconds' });
          }
        }, 8000);
        
        recognition.onstart = () => {
          console.log('Speech recognition test started');
        };
        
        recognition.onresult = (event: SpeechRecognitionEvent) => {
          const transcript = Array.from(event.results)
            .map((r: SpeechRecognitionResult) => r[0]?.transcript || '')
            .join(' ')
            .trim();
          
          if (transcript) {
            lastTranscript = transcript;
            setTranscript(transcript);
          }
        };
        
        recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
          clearTimeout(timeout);
          hasResult = true;
          
          if (event.error === 'no-speech') {
            resolve({ success: false, message: 'No speech detected. Please speak into the microphone.' });
          } else if (event.error === 'not-allowed') {
            resolve({ success: false, message: 'Microphone not allowed. Check browser permissions.' });
          } else if (event.error === 'network') {
            resolve({ success: false, message: 'Network error. Speech recognition needs internet.' });
          } else if (event.error === 'aborted') {
            resolve({ success: false, message: 'Recognition aborted.' });
          } else {
            resolve({ success: false, message: `Error: ${event.error}` });
          }
        };
        
        recognition.onend = () => {
          clearTimeout(timeout);
          if (!hasResult) {
            hasResult = true;
            if (lastTranscript) {
              resolve({ success: true, message: 'Speech recognized!', transcript: lastTranscript });
            } else {
              resolve({ success: false, message: 'Recognition ended without result' });
            }
          }
        };
        
        try {
          recognition.start();
        } catch (e: unknown) {
          const error = e as Error;
          clearTimeout(timeout);
          resolve({ success: false, message: `Failed to start: ${error.message}` });
        }
      });
      
      if (result.success) {
        updateTest(4, { status: 'pass', message: result.message });
        if (result.transcript) {
          setTranscript(result.transcript);
        }
      } else {
        updateTest(4, { status: 'fail', message: result.message });
      }
    } catch (err: unknown) {
      const error = err as Error;
      updateTest(4, { status: 'fail', message: `Recognition test failed: ${error.message}` });
    }
    
    setIsTestingRecognition(false);
    setIsRunning(false);
  }, [updateTest, cleanupAudio]);

  useEffect(() => {
    return () => {
      cleanupAudio();
    };
  }, [cleanupAudio]);

  const getStatusIcon = (status: TestResult['status']) => {
    switch (status) {
      case 'pass':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'fail':
        return <XCircle className="w-5 h-5 text-red-500" />;
      case 'testing':
        return <RefreshCw className="w-5 h-5 text-blue-500 animate-spin" />;
      default:
        return <AlertCircle className="w-5 h-5 text-gray-400" />;
    }
  };

  const allPassed = tests.every(t => t.status === 'pass');
  const anyFailed = tests.some(t => t.status === 'fail');

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">Speech Recognition Test</h1>
          <p className="text-muted-foreground">
            This page tests all requirements for voice commands to work.
          </p>
        </div>

        {/* Run Tests Button */}
        <div className="flex justify-center">
          <Button 
            size="lg" 
            onClick={runTests} 
            disabled={isRunning}
            className="gap-2"
          >
            {isRunning ? (
              <>
                <RefreshCw className="w-5 h-5 animate-spin" />
                Running Tests...
              </>
            ) : (
              <>
                <Mic className="w-5 h-5" />
                Run All Tests
              </>
            )}
          </Button>
        </div>

        {/* Test Results */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {allPassed ? (
                <CheckCircle className="w-6 h-6 text-green-500" />
              ) : anyFailed ? (
                <XCircle className="w-6 h-6 text-red-500" />
              ) : (
                <AlertCircle className="w-6 h-6 text-gray-400" />
              )}
              Test Results
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {tests.map((test, i) => (
              <div 
                key={test.name}
                className={cn(
                  "flex items-start gap-3 p-3 rounded-lg border",
                  test.status === 'pass' && "bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-800",
                  test.status === 'fail' && "bg-red-50 border-red-200 dark:bg-red-950 dark:border-red-800",
                  test.status === 'testing' && "bg-blue-50 border-blue-200 dark:bg-blue-950 dark:border-blue-800",
                  test.status === 'pending' && "bg-gray-50 border-gray-200 dark:bg-gray-900 dark:border-gray-700"
                )}
              >
                {getStatusIcon(test.status)}
                <div className="flex-1">
                  <p className="font-medium">{i + 1}. {test.name}</p>
                  {test.message && (
                    <p className={cn(
                      "text-sm mt-1",
                      test.status === 'pass' && "text-green-700 dark:text-green-300",
                      test.status === 'fail' && "text-red-700 dark:text-red-300",
                      test.status === 'testing' && "text-blue-700 dark:text-blue-300"
                    )}>
                      {test.message}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Audio Level */}
        {(isRunning || audioLevel > 0) && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Volume2 className="w-5 h-5" />
                Microphone Level
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div 
                  className={cn(
                    "h-full transition-all duration-75 rounded-full",
                    audioLevel > 50 ? "bg-green-500" : audioLevel > 20 ? "bg-yellow-500" : "bg-gray-400"
                  )}
                  style={{ width: `${audioLevel}%` }}
                />
              </div>
              <p className="text-sm text-center mt-2 text-muted-foreground">
                {audioLevel > 20 ? "Audio detected! Try speaking." : "Speak into your microphone..."}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Transcript */}
        {transcript && (
          <Card>
            <CardHeader>
              <CardTitle>Recognized Speech</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-lg">"{transcript}"</p>
            </CardContent>
          </Card>
        )}

        {/* Instructions for Common Issues */}
        <Card>
          <CardHeader>
            <CardTitle>Troubleshooting</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <p className="font-medium">❌ HTTPS Required</p>
              <p className="text-muted-foreground">
                Access the app via the forwarded HTTPS URL in your Codespace ports tab, not localhost.
              </p>
            </div>
            <div>
              <p className="font-medium">❌ Microphone Denied</p>
              <p className="text-muted-foreground">
                Click the lock/camera icon in the address bar → Allow microphone access → Refresh page.
              </p>
            </div>
            <div>
              <p className="font-medium">❌ No Audio Detected</p>
              <p className="text-muted-foreground">
                Check your microphone is connected, not muted, and set as default input device.
              </p>
            </div>
            <div>
              <p className="font-medium">❌ Network Error</p>
              <p className="text-muted-foreground">
                Web Speech API requires internet. Check your connection.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Back Link */}
        <div className="flex justify-center">
          <Button variant="outline" onClick={() => window.history.back()}>
            ← Back to App
          </Button>
        </div>
      </div>
    </div>
  );
}
