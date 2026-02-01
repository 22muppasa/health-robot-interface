import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Pause, Play, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface PhotoFrameModeViewProps {
  claireState: 'idle' | 'listening' | 'thinking' | 'speaking';
  isWakeWordActive?: boolean;
  onBackToDashboard?: () => void;
}

// Placeholder photos - in production, these would come from an API or cloud storage
const SAMPLE_PHOTOS = [
  {
    id: '1',
    url: 'https://images.unsplash.com/photo-1511895426328-dc8714191300?w=1200&h=800&fit=crop',
    caption: 'Family gathering',
    date: 'December 2025'
  },
  {
    id: '2',
    url: 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=1200&h=800&fit=crop',
    caption: 'Sunny day at the park',
    date: 'Summer 2025'
  },
  {
    id: '3',
    url: 'https://images.unsplash.com/photo-1516733968668-dbdce39c0651?w=1200&h=800&fit=crop',
    caption: 'Grandchildren visiting',
    date: 'November 2025'
  },
  {
    id: '4',
    url: 'https://images.unsplash.com/photo-1502086223501-7ea6ecd79368?w=1200&h=800&fit=crop',
    caption: 'Birthday celebration',
    date: 'October 2025'
  },
  { 
    id: '5',
    url: 'https://images.unsplash.com/photo-1484972759836-b93f9ef2b293?w=1200&h=800&fit=crop',
    caption: 'Beautiful sunset',
    date: 'September 2025'
  },
];

export function PhotoFrameModeView({ claireState, isWakeWordActive = true, onBackToDashboard }: PhotoFrameModeViewProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [showControls, setShowControls] = useState(false);
  const [fadeState, setFadeState] = useState<'in' | 'out'>('in');

  const currentPhoto = SAMPLE_PHOTOS[currentIndex];

  // Auto-advance slideshow
  useEffect(() => {
    if (!isPlaying) return;

    const interval = setInterval(() => {
      setFadeState('out');
      setTimeout(() => {
        setCurrentIndex((prev) => (prev + 1) % SAMPLE_PHOTOS.length);
        setFadeState('in');
      }, 500);
    }, 10000); // 10 seconds per photo

    return () => clearInterval(interval);
  }, [isPlaying]);

  const goToNext = () => {
    setFadeState('out');
    setTimeout(() => {
      setCurrentIndex((prev) => (prev + 1) % SAMPLE_PHOTOS.length);
      setFadeState('in');
    }, 300);
  };

  const goToPrev = () => {
    setFadeState('out');
    setTimeout(() => {
      setCurrentIndex((prev) => (prev - 1 + SAMPLE_PHOTOS.length) % SAMPLE_PHOTOS.length);
      setFadeState('in');
    }, 300);
  };

  // Show controls on mouse movement
  useEffect(() => {
    let timeout: NodeJS.Timeout;
    
    const handleMouseMove = () => {
      setShowControls(true);
      clearTimeout(timeout);
      timeout = setTimeout(() => setShowControls(false), 3000);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('touchstart', handleMouseMove);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('touchstart', handleMouseMove);
      clearTimeout(timeout);
    };
  }, []);

  return (
    <div className="w-full h-full bg-black relative overflow-hidden">
      {/* Back to Dashboard button */}
      <Button
        onClick={onBackToDashboard}
        variant="ghost"
        size="sm"
        className="absolute top-6 left-6 text-white/50 hover:text-white hover:bg-white/10 z-20"
      >
        <Home className="w-5 h-5 mr-2" />
        Dashboard
      </Button>

      {/* Photo */}
      <div 
        className={`absolute inset-0 transition-opacity duration-500 ${fadeState === 'in' ? 'opacity-100' : 'opacity-0'}`}
      >
        <img
          src={currentPhoto.url}
          alt={currentPhoto.caption}
          className="w-full h-full object-cover"
        />
        
        {/* Gradient overlay for caption */}
        <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-black/70 to-transparent" />
      </div>

      {/* Caption */}
      <div 
        className={`absolute bottom-4 left-4 right-4 text-white transition-opacity duration-500 ${
          fadeState === 'in' ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <p className="text-2xl font-light">{currentPhoto.caption}</p>
        <p className="text-sm text-white/60 mt-1">{currentPhoto.date}</p>
      </div>

      {/* Navigation controls - shown on hover */}
      <div 
        className={`absolute inset-0 flex items-center justify-between px-4 transition-opacity duration-300 ${
          showControls ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <button
          onClick={goToPrev}
          className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center text-white hover:bg-white/30 transition-colors"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
        
        <button
          onClick={goToNext}
          className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center text-white hover:bg-white/30 transition-colors"
        >
          <ChevronRight className="w-6 h-6" />
        </button>
      </div>

      {/* Play/Pause and progress */}
      <div 
        className={`absolute top-4 right-4 flex items-center gap-4 transition-opacity duration-300 ${
          showControls ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <button
          onClick={() => setIsPlaying((p) => !p)}
          className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center text-white hover:bg-white/30 transition-colors"
        >
          {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
        </button>
      </div>

      {/* Progress dots */}
      <div className={`absolute bottom-20 left-1/2 -translate-x-1/2 flex gap-2 transition-opacity duration-300 ${
        showControls ? 'opacity-100' : 'opacity-0'
      }`}>
        {SAMPLE_PHOTOS.map((_, idx) => (
          <button
            key={idx}
            onClick={() => {
              setFadeState('out');
              setTimeout(() => {
                setCurrentIndex(idx);
                setFadeState('in');
              }, 300);
            }}
            className={`w-2 h-2 rounded-full transition-all ${
              idx === currentIndex ? 'bg-white w-6' : 'bg-white/50'
            }`}
          />
        ))}
      </div>

      {/* Claire overlay when active */}
      {claireState !== 'idle' && (
        <div className="absolute top-4 left-4 flex items-center gap-3 px-4 py-2 bg-black/50 backdrop-blur-sm rounded-full">
          <div className="relative">
            <div className="w-10 h-10 bg-pink-200 rounded-full flex items-center justify-center text-xl">
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
            {claireState === 'listening' ? 'Listening...' : 
             claireState === 'speaking' ? 'Speaking...' : 'Thinking...'}
          </span>
        </div>
      )}

      {/* Voice hint */}
      {claireState === 'idle' && showControls && (
        <div className="absolute top-4 left-4 flex items-center gap-2 text-white/60 text-sm bg-black/30 backdrop-blur-sm px-3 py-1 rounded-full">
          <div className={`w-2 h-2 rounded-full ${isWakeWordActive ? 'bg-green-500 animate-pulse' : 'bg-gray-500'}`} />
          <span>{isWakeWordActive ? 'Say "Claire" for voice commands' : 'Voice inactive'}</span>
        </div>
      )}

      {/* Time display */}
      <div className={`absolute top-4 left-1/2 -translate-x-1/2 text-white/80 text-lg font-light transition-opacity duration-300 ${
        showControls ? 'opacity-100' : 'opacity-0'
      }`}>
        {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </div>
    </div>
  );
}
