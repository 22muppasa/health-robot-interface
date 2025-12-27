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
  const [voiceEnabled, setVoiceEnabled] = useState(systemStatus.assistant_enabled);

  const handleCallStatusChange = (status: CallStatus) => {
    setLocalCallStatus(status);
  };

  const handleVoiceToggle = (enabled: boolean) => {
    setVoiceEnabled(enabled);
    updateStatus({ assistant_enabled: enabled });
  };

  const isListening = systemStatus.assistant_state === 'listening';

  return (
    <div className="min-h-screen w-full bg-background overflow-hidden">
      <div className="w-full h-full overflow-y-auto p-3 sm:p-4 md:p-5 lg:p-6 max-w-7xl mx-auto">
        {/* Header */}
        <header className="mb-4 sm:mb-5 md:mb-6">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Heart className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-foreground truncate">MediBot Assistant</h1>
              <p className="text-xs sm:text-sm text-muted-foreground truncate">Healthcare Robot Control Dashboard</p>
            </div>
          </div>
        </header>

        {/* Status Panel */}
        <div className="mb-4 sm:mb-5 md:mb-6">
          <StatusPanel status={systemStatus} />
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5 md:gap-6 auto-rows-max md:auto-rows-fr">
          {/* Video Conference - Left Column */}
          <div className="md:row-span-2 min-h-[300px] sm:min-h-[350px] md:min-h-0">
            <VideoConference
              callStatus={localCallStatus}
              onStatusChange={handleCallStatusChange}
            />
          </div>

          {/* Voice Assistant - Top Right */}
          <div className="min-h-0">
            <VoiceAssistant
              isEnabled={voiceEnabled}
              isListening={isListening}
              lastTranscript={lastTranscript}
              onToggle={handleVoiceToggle}
            />
          </div>

          {/* Robot Actions - Bottom Right */}
          <div className="min-h-0">
            <RobotActions />
          </div>
        </div>

        {/* Footer */}
        <footer className="mt-6 sm:mt-8 text-center text-xs sm:text-sm text-muted-foreground">
          <p>MediBot v1.0 • Connected to Backend</p>
        </footer>
      </div>
    </div>
  );
};

export default Index;
