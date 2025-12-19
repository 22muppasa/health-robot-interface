import { useState } from 'react';
import { StatusPanel } from '@/components/StatusPanel';
import { VideoConference } from '@/components/VideoConference';
import { VoiceAssistant } from '@/components/VoiceAssistant';
import { RobotActions } from '@/components/RobotActions';
import { useWebSocket } from '@/hooks/useWebSocket';
import { CallStatus } from '@/lib/api';
import { Heart } from 'lucide-react';

const Index = () => {
  const { systemStatus, callStatus, lastTranscript, updateStatus } = useWebSocket();
  const [localCallStatus, setLocalCallStatus] = useState<CallStatus>(callStatus);
  const [voiceEnabled, setVoiceEnabled] = useState(false);

  const handleCallStatusChange = (status: CallStatus) => {
    setLocalCallStatus(status);
  };

  const handleVoiceToggle = (enabled: boolean) => {
    setVoiceEnabled(enabled);
    updateStatus({ microphoneEnabled: enabled });
  };

  const isListening = systemStatus.assistantState === 'listening';

  return (
    <div className="min-h-screen bg-background p-4 lg:p-6">
      {/* Header */}
      <header className="mb-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
            <Heart className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">MediBot Assistant</h1>
            <p className="text-sm text-muted-foreground">Healthcare Robot Control Dashboard</p>
          </div>
        </div>
      </header>

      {/* Status Panel */}
      <div className="mb-6">
        <StatusPanel status={systemStatus} />
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Video Conference - Left Column */}
        <div className="lg:row-span-2">
          <VideoConference
            callStatus={localCallStatus}
            onStatusChange={handleCallStatusChange}
          />
        </div>

        {/* Voice Assistant - Top Right */}
        <div>
          <VoiceAssistant
            isEnabled={voiceEnabled}
            isListening={isListening}
            lastTranscript={lastTranscript}
            onToggle={handleVoiceToggle}
          />
        </div>

        {/* Robot Actions - Bottom Right */}
        <div>
          <RobotActions />
        </div>
      </div>

      {/* Footer */}
      <footer className="mt-8 text-center text-sm text-muted-foreground">
        <p>MediBot v1.0 • Connected to Backend</p>
      </footer>
    </div>
  );
};

export default Index;
