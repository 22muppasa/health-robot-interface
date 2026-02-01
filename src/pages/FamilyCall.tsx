import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

/**
 * FamilyCall page - redirects to FamilyPortal
 * This route handles incoming call links from notifications.
 * Call parameters (room, token) are preserved in the redirect.
 */
export default function FamilyCallPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    // Preserve any call parameters in the redirect
    const room = searchParams.get('room');
    const token = searchParams.get('token');
    
    // Redirect to family portal with call params if present
    let redirectUrl = '/family/dashboard';
    if (room || token) {
      const params = new URLSearchParams();
      if (room) params.set('room', room);
      if (token) params.set('token', token);
      redirectUrl += `?${params.toString()}`;
    }
    
    navigate(redirectUrl, { replace: true });
  }, [navigate, searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4" />
        <p className="text-muted-foreground">Redirecting to Family Portal...</p>
      </div>
    </div>
  );
}
