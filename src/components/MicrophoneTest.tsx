// src/components/MicrophoneTest.tsx
/**
 * MicrophoneTest Component
 * Allows users to test their microphone and diagnose issues with wake word detection
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { Mic, MicOff, Play, Square, AlertCircle, CheckCircle, Volume2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface DiagnosticResult {
  test: string;
  status: 'pass' | 'fail' | 'warning' | 'pending';
  message: string;
}

export function MicrophoneTest() {
  const [isRecording, setIsRecording] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [diagnostics, setDiagnostics] = useState<DiagnosticResult[]>([]);
  const [speechRecognitionResult, setSpeechRecognitionResult] = useState<string>('');
  const [isTestingSpeech, setIsTestingSpeech] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Run diagnostics on mount
  useEffect(() => {
    runDiagnostics();
  }, []);

  const runDiagnostics = async () => {
    const results: DiagnosticResult[] = [];

    // Check browser support
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      results.push({
        test: 'Speech Recognition API',
        status: 'pass',
        message: 'Your browser supports speech recognition',
      });
    } else {
      results.push({
        test: 'Speech Recognition API',
        status: 'fail',
        message: 'Your browser does not support speech recognition. Use Chrome, Edge, or Safari.',
      });
    }

    // Check microphone API availability
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      results.push({
        test: 'Microphone API',
        status: 'pass',
        message: 'Microphone access is available',
      });
    } else {
      results.push({
        test: 'Microphone API',
        status: 'fail',
        message: 'Microphone API is not available in this browser',
      });
    }

    // Check HTTPS (required for microphone in most browsers)
    if (window.location.protocol === 'https:' || window.location.hostname === 'localhost') {
      results.push({
        test: 'Secure Context',
        status: 'pass',
        message: 'Page is served securely (required for microphone)',
      });
    } else {
      results.push({
        test: 'Secure Context',
        status: 'warning',
        message: 'Page may need HTTPS for microphone access',
      });
    }

    // Check microphone permission
    try {
      const permissionStatus = await navigator.permissions.query({ name: 'microphone' as PermissionName });
      if (permissionStatus.state === 'granted') {
        results.push({
          test: 'Microphone Permission',
          status: 'pass',
          message: 'Microphone permission is granted',
        });
      } else if (permissionStatus.state === 'prompt') {
        results.push({
          test: 'Microphone Permission',
          status: 'warning',
          message: 'Microphone permission will be requested',
        });
      } else {
        results.push({
          test: 'Microphone Permission',
          status: 'fail',
          message: 'Microphone permission is denied. Please allow in browser settings.',
        });
      }
    } catch {
      results.push({
        test: 'Microphone Permission',
        status: 'warning',
        message: 'Could not check permission status',
      });
    }

    // Try to enumerate audio devices
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices.filter(d => d.kind === 'audioinput');
      if (audioInputs.length > 0) {
        results.push({
          test: 'Audio Input Devices',
          status: 'pass',
          message: `Found ${audioInputs.length} microphone(s)`,
        });
      } else {
        results.push({
          test: 'Audio Input Devices',
          status: 'fail',
          message: 'No microphones detected',
        });
      }
    } catch {
      results.push({
        test: 'Audio Input Devices',
        status: 'warning',
        message: 'Could not enumerate devices',
      });
    }

    setDiagnostics(results);
  };

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Set up audio level monitoring
      const audioContext = new AudioContext();
      const analyser = audioContext.createAnalyser();
      const source = audioContext.createMediaStreamSource(stream);
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;
      source.connect(analyser);
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;

      const updateLevel = () => {
        if (!analyserRef.current) return;
        const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
        setAudioLevel(Math.min(100, average * 1.5));
        animationFrameRef.current = requestAnimationFrame(updateLevel);
      };
      updateLevel();

      // Set up recording
      const mediaRecorder = new MediaRecorder(stream);
      chunksRef.current = [];
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        setRecordedBlob(blob);
      };
      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setIsRecording(true);
      setRecordedBlob(null);
    } catch (error) {
      console.error('Failed to start recording:', error);
      setDiagnostics(prev => [
        ...prev.filter(d => d.test !== 'Recording Test'),
        {
          test: 'Recording Test',
          status: 'fail',
          message: `Failed to access microphone: ${error instanceof Error ? error.message : 'Unknown error'}`,
        },
      ]);
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    setIsRecording(false);
    setAudioLevel(0);
  }, [isRecording]);

  const playRecording = useCallback(() => {
    if (!recordedBlob) return;
    const url = URL.createObjectURL(recordedBlob);
    const audio = new Audio(url);
    audioRef.current = audio;
    audio.onplay = () => setIsPlaying(true);
    audio.onended = () => {
      setIsPlaying(false);
      URL.revokeObjectURL(url);
    };
    audio.play();
  }, [recordedBlob]);

  const testSpeechRecognition = useCallback(() => {
    if (!('webkitSpeechRecognition' in window)) {
      setSpeechRecognitionResult('Speech recognition not supported in this browser');
      return;
    }

    setIsTestingSpeech(true);
    setSpeechRecognitionResult('Listening... Say "Claire" or anything else');

    const recognition = new window.webkitSpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    let transcript = '';
    recognition.onresult = (event: SpeechRecognitionEvent) => {
      transcript = '';
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      setSpeechRecognitionResult(`Heard: "${transcript}"`);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      setSpeechRecognitionResult(`Error: ${event.error}`);
      setIsTestingSpeech(false);
    };

    recognition.onend = () => {
      if (!transcript) {
        setSpeechRecognitionResult('No speech detected. Try speaking louder or closer to the microphone.');
      }
      setIsTestingSpeech(false);
    };

    try {
      recognition.start();
      // Auto-stop after 5 seconds
      setTimeout(() => {
        try {
          recognition.stop();
        } catch {
          // Ignore errors when stopping recognition
        }
      }, 5000);
    } catch (e) {
      setSpeechRecognitionResult(`Failed to start: ${e}`);
      setIsTestingSpeech(false);
    }
  }, []);

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mic className="w-5 h-5" />
          Microphone Test
        </CardTitle>
        <CardDescription>
          Test your microphone to ensure wake word detection works properly
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Diagnostics Results */}
        <div className="space-y-2">
          <h3 className="font-semibold text-sm">System Diagnostics</h3>
          <div className="space-y-1">
            {diagnostics.map((result, i) => (
              <div
                key={i}
                className={cn(
                  'flex items-center gap-2 p-2 rounded text-sm',
                  result.status === 'pass' && 'bg-green-50 text-green-800',
                  result.status === 'fail' && 'bg-red-50 text-red-800',
                  result.status === 'warning' && 'bg-yellow-50 text-yellow-800',
                  result.status === 'pending' && 'bg-gray-50 text-gray-800'
                )}
              >
                {result.status === 'pass' && <CheckCircle className="w-4 h-4 flex-shrink-0" />}
                {result.status === 'fail' && <AlertCircle className="w-4 h-4 flex-shrink-0" />}
                {result.status === 'warning' && <AlertCircle className="w-4 h-4 flex-shrink-0" />}
                <span className="font-medium">{result.test}:</span>
                <span className="flex-1">{result.message}</span>
              </div>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={runDiagnostics}>
            Re-run Diagnostics
          </Button>
        </div>

        {/* Audio Level Test */}
        <div className="space-y-3">
          <h3 className="font-semibold text-sm">Audio Level Test</h3>
          <p className="text-sm text-muted-foreground">
            Record your voice to check if the microphone is picking up audio.
          </p>
          
          <div className="flex items-center gap-4">
            {!isRecording ? (
              <Button onClick={startRecording} className="gap-2">
                <Mic className="w-4 h-4" />
                Start Recording
              </Button>
            ) : (
              <Button onClick={stopRecording} variant="destructive" className="gap-2">
                <Square className="w-4 h-4" />
                Stop Recording
              </Button>
            )}

            {recordedBlob && !isRecording && (
              <Button onClick={playRecording} variant="outline" className="gap-2" disabled={isPlaying}>
                <Play className="w-4 h-4" />
                {isPlaying ? 'Playing...' : 'Play Back'}
              </Button>
            )}
          </div>

          {/* Audio Level Meter */}
          {isRecording && (
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Volume2 className="w-4 h-4 text-muted-foreground" />
                <div className="flex-1 h-4 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className={cn(
                      'h-full transition-all duration-100 rounded-full',
                      audioLevel > 50 ? 'bg-green-500' : audioLevel > 20 ? 'bg-yellow-500' : 'bg-red-500'
                    )}
                    style={{ width: `${audioLevel}%` }}
                  />
                </div>
                <span className="text-sm font-mono w-12">{Math.round(audioLevel)}%</span>
              </div>
              <p className="text-xs text-muted-foreground">
                {audioLevel < 10
                  ? '⚠️ Very low audio - speak louder or check microphone'
                  : audioLevel < 30
                  ? '⚠️ Low audio - try speaking louder'
                  : '✓ Good audio level'}
              </p>
            </div>
          )}
        </div>

        {/* Speech Recognition Test */}
        <div className="space-y-3">
          <h3 className="font-semibold text-sm">Speech Recognition Test</h3>
          <p className="text-sm text-muted-foreground">
            Test if the browser can understand your speech. Try saying "Claire" or any phrase.
          </p>
          
          <Button
            onClick={testSpeechRecognition}
            disabled={isTestingSpeech}
            className="gap-2"
          >
            <Mic className={cn('w-4 h-4', isTestingSpeech && 'animate-pulse')} />
            {isTestingSpeech ? 'Listening...' : 'Test Speech Recognition'}
          </Button>

          {speechRecognitionResult && (
            <div className={cn(
              'p-3 rounded-lg text-sm',
              speechRecognitionResult.startsWith('Error') || speechRecognitionResult.includes('not supported')
                ? 'bg-red-50 text-red-800'
                : speechRecognitionResult.startsWith('Heard')
                ? 'bg-green-50 text-green-800'
                : 'bg-blue-50 text-blue-800'
            )}>
              {speechRecognitionResult}
            </div>
          )}
        </div>

        {/* Tips */}
        <div className="bg-muted/50 rounded-lg p-4 space-y-2">
          <h3 className="font-semibold text-sm">Troubleshooting Tips</h3>
          <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
            <li>Use Chrome, Edge, or Safari for best speech recognition support</li>
            <li>Ensure your microphone is not muted in system settings</li>
            <li>Speak clearly and at a normal volume, about 1-2 feet from the mic</li>
            <li>Reduce background noise if possible</li>
            <li>Try saying "Hey Claire" or "OK Claire" if "Claire" alone isn't detected</li>
            <li>Make sure no other app is using the microphone</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
