import { useState, useEffect } from 'react';
import { Cloud, Sun, CloudRain, Snowflake, Wind, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface AmbientModeViewProps {
  claireState: 'idle' | 'listening' | 'thinking' | 'speaking';
  isWakeWordActive?: boolean;
  onBackToDashboard?: () => void;
}

interface Weather {
  temperature: number;
  description: string;
  location: string;
}

interface Reminder {
  id: string;
  title: string;
  scheduled_time: string;
}

export function AmbientModeView({ claireState, isWakeWordActive = true, onBackToDashboard }: AmbientModeViewProps) {
  const [time, setTime] = useState(new Date());
  const [weather, setWeather] = useState<Weather | null>(null);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [gradientHue, setGradientHue] = useState(200);

  // Update time every second
  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Slow gradient color shift
  useEffect(() => {
    const interval = setInterval(() => {
      setGradientHue((prev) => (prev + 0.5) % 360);
    }, 200);
    return () => clearInterval(interval);
  }, []);

  // Fetch weather
  useEffect(() => {
    const fetchWeather = async () => {
      try {
        const res = await fetch('/api/realtime/info?query_type=weather');
        if (res.ok) {
          const data = await res.json();
          setWeather({
            temperature: data.temperature || 22,
            description: data.description || 'Clear',
            location: data.location || 'Your Area',
          });
        }
      } catch (e) {
        console.error('Failed to fetch weather:', e);
      }
    };
    fetchWeather();
    const interval = setInterval(fetchWeather, 300000); // Every 5 min
    return () => clearInterval(interval);
  }, []);

  // Fetch reminders
  useEffect(() => {
    const fetchReminders = async () => {
      try {
        const res = await fetch('/api/reminders/upcoming?hours_ahead=12');
        if (res.ok) {
          const data = await res.json();
          setReminders(data.reminders?.slice(0, 3) || []);
        }
      } catch (e) {
        console.error('Failed to fetch reminders:', e);
      }
    };
    fetchReminders();
    const interval = setInterval(fetchReminders, 60000); // Every minute
    return () => clearInterval(interval);
  }, []);

  const getWeatherIcon = (desc: string) => {
    const lower = desc.toLowerCase();
    if (lower.includes('rain')) return <CloudRain className="w-12 h-12" />;
    if (lower.includes('snow')) return <Snowflake className="w-12 h-12" />;
    if (lower.includes('wind')) return <Wind className="w-12 h-12" />;
    if (lower.includes('cloud')) return <Cloud className="w-12 h-12" />;
    return <Sun className="w-12 h-12" />;
  };

  const formatReminderTime = (isoTime: string) => {
    const date = new Date(isoTime);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div 
      className="w-full h-full flex flex-col items-center justify-center p-8 transition-colors duration-1000"
      style={{
        background: `linear-gradient(135deg, hsl(${gradientHue}, 30%, 15%) 0%, hsl(${(gradientHue + 60) % 360}, 40%, 20%) 100%)`
      }}
    >
      {/* Back to Dashboard button */}
      <Button
        onClick={onBackToDashboard}
        variant="ghost"
        size="sm"
        className="absolute top-6 left-6 text-white/50 hover:text-white hover:bg-white/10 z-10"
      >
        <Home className="w-5 h-5 mr-2" />
        Dashboard
      </Button>

      {/* Main Clock */}
      <div className="text-center mb-8">
        <div className="text-8xl sm:text-9xl font-light text-white tracking-tight">
          {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
        <div className="text-2xl text-white/60 mt-2">
          {time.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
        </div>
      </div>

      {/* Weather & Reminders Row */}
      <div className="flex flex-wrap justify-center gap-8 mt-8">
        {/* Weather Card */}
        {weather && (
          <div className="flex items-center gap-4 px-6 py-4 bg-white/10 backdrop-blur-sm rounded-2xl">
            <div className="text-white/80">
              {getWeatherIcon(weather.description)}
            </div>
            <div>
              <div className="text-3xl font-light text-white">{weather.temperature}°C</div>
              <div className="text-white/60 text-sm">{weather.description}</div>
              <div className="text-white/40 text-xs">{weather.location}</div>
            </div>
          </div>
        )}

        {/* Upcoming Reminders */}
        {reminders.length > 0 && (
          <div className="px-6 py-4 bg-white/10 backdrop-blur-sm rounded-2xl min-w-[200px]">
            <div className="text-white/60 text-xs uppercase tracking-wide mb-2">Upcoming</div>
            <div className="space-y-2">
              {reminders.map((r) => (
                <div key={r.id} className="flex items-center gap-3 text-white">
                  <span className="text-white/50 text-sm">{formatReminderTime(r.scheduled_time)}</span>
                  <span className="text-sm">{r.title}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Claire mini-face when speaking/listening */}
      {(claireState === 'listening' || claireState === 'speaking') && (
        <div className="absolute bottom-8 flex items-center gap-3 px-4 py-2 bg-white/20 backdrop-blur-sm rounded-full">
          <div className="relative">
            <div className="w-8 h-8 bg-pink-200 rounded-full flex items-center justify-center text-lg">
              😊
            </div>
            {claireState === 'listening' && (
              <div className="absolute inset-0 rounded-full border-2 border-blue-400 animate-ping" />
            )}
            {claireState === 'speaking' && (
              <div className="absolute inset-0 rounded-full border-2 border-green-400 animate-pulse" />
            )}
          </div>
          <span className="text-white text-sm">
            {claireState === 'listening' ? 'Listening...' : 'Speaking...'}
          </span>
        </div>
      )}

      {/* Voice hint */}
      {claireState === 'idle' && (
        <div className="absolute bottom-8 flex items-center gap-2 text-white/40 text-sm">
          <div className={`w-2 h-2 rounded-full ${isWakeWordActive ? 'bg-green-500 animate-pulse' : 'bg-gray-500'}`} />
          <span>{isWakeWordActive ? 'Say "Claire" to talk' : 'Voice inactive'}</span>
        </div>
      )}
    </div>
  );
}
