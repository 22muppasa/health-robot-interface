import { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Heart, Settings, Menu, X, Users, Phone } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useState } from 'react';

interface ResponsiveLayoutProps {
  children: ReactNode;
  isFullScreen?: boolean;
  showHeader?: boolean;
  showFooter?: boolean;
  headerTitle?: string;
  headerExtra?: ReactNode;
}

export function ResponsiveLayout({
  children,
  isFullScreen = false,
  showHeader = true,
  showFooter = true,
  headerTitle = 'Claire Healthcare Robot',
  headerExtra,
}: ResponsiveLayoutProps) {
  const [showMobileMenu, setShowMobileMenu] = useState(false);

  return (
    <div className="h-screen w-screen bg-background overflow-hidden flex flex-col">
      {/* Header - Always visible but minimal during calls */}
      {showHeader && (
        <header className={cn(
          'flex-shrink-0 border-b border-border transition-all duration-300',
          isFullScreen ? 'p-2 h-14' : 'p-2 sm:p-3 md:p-4'
        )}>
          <div className="flex items-center justify-between gap-2 sm:gap-3 h-full">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Heart className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <h1 className={cn(
                  'font-bold text-foreground truncate transition-all duration-300',
                  isFullScreen ? 'text-sm sm:text-base' : 'text-base sm:text-lg md:text-xl'
                )}>
                  {headerTitle}
                </h1>
                {!isFullScreen && (
                  <p className="text-xs text-muted-foreground truncate">Voice-Controlled Nurse Assistant</p>
                )}
              </div>
            </div>

            {/* Header Extra Content (Status Icons) */}
            {headerExtra && (
              <div className="flex-shrink-0">
                {headerExtra}
              </div>
            )}

            {/* Desktop Settings Link */}
            <div className="hidden sm:flex gap-2 flex-shrink-0">
              <Link to="/family-call">
                <Button variant="outline" size="sm" className="flex items-center gap-1">
                  <Phone className="w-4 h-4" />
                  <span className="hidden md:inline">Family Portal</span>
                </Button>
              </Link>
              <Link to="/family-dashboard">
                <Button variant="outline" size="sm" className="flex items-center gap-1">
                  <Users className="w-4 h-4" />
                  <span className="hidden md:inline">Info</span>
                </Button>
              </Link>
              <Link to="/settings">
                <Button variant="outline" size="sm" className="flex items-center gap-1">
                  <Settings className="w-4 h-4" />
                  <span className="hidden md:inline">Settings</span>
                </Button>
              </Link>
            </div>

            {/* Mobile Menu Button */}
            <div className="sm:hidden flex-shrink-0">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowMobileMenu(!showMobileMenu)}
              >
                {showMobileMenu ? (
                  <X className="w-5 h-5" />
                ) : (
                  <Menu className="w-5 h-5" />
                )}
              </Button>
            </div>
          </div>

          {/* Mobile Menu Dropdown */}
          {showMobileMenu && (
            <div className="absolute top-14 right-0 left-0 bg-card border-b border-border p-2 z-50 sm:hidden">
              <Link to="/family-call" onClick={() => setShowMobileMenu(false)} className="block">
                <Button variant="ghost" size="sm" className="w-full justify-start gap-2">
                  <Phone className="w-4 h-4" />
                  Family Portal (Call)
                </Button>
              </Link>
              <Link to="/family-dashboard" onClick={() => setShowMobileMenu(false)} className="block">
                <Button variant="ghost" size="sm" className="w-full justify-start gap-2">
                  <Users className="w-4 h-4" />
                  Patient Info
                </Button>
              </Link>
              <Link to="/settings" onClick={() => setShowMobileMenu(false)} className="block">
                <Button variant="ghost" size="sm" className="w-full justify-start gap-2">
                  <Settings className="w-4 h-4" />
                  Settings
                </Button>
              </Link>
            </div>
          )}
        </header>
      )}

      {/* Main Content */}
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
        {children}
      </div>

      {/* Footer - Only in non-fullscreen */}
      {showFooter && !isFullScreen && (
        <footer className="flex-shrink-0 px-3 sm:px-4 md:px-5 py-2 border-t border-border text-center text-xs sm:text-sm text-muted-foreground bg-muted/20">
          <p>Claire Healthcare Robot v1.0</p>
        </footer>
      )}
    </div>
  );
}
