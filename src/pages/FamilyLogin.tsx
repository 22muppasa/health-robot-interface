// src/pages/FamilyLogin.tsx
/**
 * Family Portal Login Page
 * Standalone login for family members to remotely access patient information
 * and initiate video calls
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { User, Lock, Phone, Heart, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';

export default function FamilyLogin() {
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loginForm, setLoginForm] = useState({
    email: '',
    password: '',
    rememberMe: false,
  });
  const [registerForm, setRegisterForm] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    relationship: '',
    patientCode: '',
  });
  const [isRegistering, setIsRegistering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const navigate = useNavigate();
  const { toast } = useToast();

  // Check if already logged in
  useEffect(() => {
    const session = localStorage.getItem('familySession');
    if (session) {
      try {
        const sessionData = JSON.parse(session);
        if (sessionData.token && sessionData.expiresAt > Date.now()) {
          navigate('/family/dashboard');
        }
      } catch {
        localStorage.removeItem('familySession');
      }
    }
  }, [navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    
    if (!loginForm.email.trim() || !loginForm.password.trim()) {
      setError('Please enter your email and password');
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch('/api/family/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: loginForm.email,
          password: loginForm.password,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || 'Login failed');
      }

      // Store session
      const sessionData = {
        token: data.token,
        familyId: data.family_id,
        name: data.name,
        patientId: data.patient_id,
        expiresAt: Date.now() + (loginForm.rememberMe ? 7 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000),
      };
      localStorage.setItem('familySession', JSON.stringify(sessionData));

      toast({
        title: 'Welcome!',
        description: `Logged in as ${data.name}`,
      });

      navigate('/family/dashboard');
    } catch (error) {
      console.error('Login failed:', error);
      setError(error instanceof Error ? error.message : 'Login failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (!registerForm.name.trim()) {
      setError('Please enter your name');
      return;
    }
    if (!registerForm.email.trim()) {
      setError('Please enter your email');
      return;
    }
    if (!registerForm.password.trim() || registerForm.password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    if (registerForm.password !== registerForm.confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (!registerForm.patientCode.trim()) {
      setError('Please enter the patient invite code');
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch('/api/family/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: registerForm.name,
          email: registerForm.email,
          password: registerForm.password,
          relationship: registerForm.relationship || 'Family Member',
          patient_code: registerForm.patientCode,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || 'Registration failed');
      }

      toast({
        title: 'Account Created!',
        description: 'You can now log in with your credentials.',
      });

      // Switch to login form
      setIsRegistering(false);
      setLoginForm({ email: registerForm.email, password: '', rememberMe: false });
    } catch (error) {
      console.error('Registration failed:', error);
      setError(error instanceof Error ? error.message : 'Registration failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex flex-col items-center justify-center p-4">
      {/* Logo/Branding */}
      <div className="mb-8 text-center">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 mb-4 shadow-lg">
          <Heart className="w-10 h-10 text-white" />
        </div>
        <h1 className="text-3xl font-bold text-foreground">Claire Family Portal</h1>
        <p className="text-muted-foreground mt-1">Stay connected with your loved one</p>
      </div>

      <Card className="w-full max-w-md shadow-xl border-0 bg-white/80 dark:bg-gray-800/80 backdrop-blur">
        <CardHeader className="text-center pb-2">
          <CardTitle className="text-xl">
            {isRegistering ? 'Create Your Account' : 'Welcome Back'}
          </CardTitle>
          <CardDescription>
            {isRegistering
              ? 'Register to connect with your patient'
              : 'Sign in to access the family portal'}
          </CardDescription>
        </CardHeader>

        <CardContent>
          {error && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
            </div>
          )}

          {!isRegistering ? (
            /* Login Form */
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Email</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    type="email"
                    placeholder="your@email.com"
                    className="pl-10"
                    value={loginForm.email}
                    onChange={(e) => setLoginForm((prev) => ({ ...prev, email: e.target.value }))}
                    disabled={isLoading}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    className="pl-10 pr-10"
                    value={loginForm.password}
                    onChange={(e) => setLoginForm((prev) => ({ ...prev, password: e.target.value }))}
                    disabled={isLoading}
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    className="w-4 h-4 rounded border-gray-300"
                    checked={loginForm.rememberMe}
                    onChange={(e) => setLoginForm((prev) => ({ ...prev, rememberMe: e.target.checked }))}
                  />
                  <span className="text-sm text-muted-foreground">Remember me</span>
                </label>
              </div>

              <Button type="submit" className="w-full" size="lg" disabled={isLoading}>
                {isLoading ? 'Signing in...' : 'Sign In'}
              </Button>
            </form>
          ) : (
            /* Registration Form */
            <form onSubmit={handleRegister} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Your Name</label>
                <Input
                  placeholder="e.g., Sarah Johnson"
                  value={registerForm.name}
                  onChange={(e) => setRegisterForm((prev) => ({ ...prev, name: e.target.value }))}
                  disabled={isLoading}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Email</label>
                <Input
                  type="email"
                  placeholder="your@email.com"
                  value={registerForm.email}
                  onChange={(e) => setRegisterForm((prev) => ({ ...prev, email: e.target.value }))}
                  disabled={isLoading}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Password</label>
                  <Input
                    type="password"
                    placeholder="••••••••"
                    value={registerForm.password}
                    onChange={(e) => setRegisterForm((prev) => ({ ...prev, password: e.target.value }))}
                    disabled={isLoading}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Confirm</label>
                  <Input
                    type="password"
                    placeholder="••••••••"
                    value={registerForm.confirmPassword}
                    onChange={(e) => setRegisterForm((prev) => ({ ...prev, confirmPassword: e.target.value }))}
                    disabled={isLoading}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Relationship (optional)</label>
                <Input
                  placeholder="e.g., Daughter, Son, Friend"
                  value={registerForm.relationship}
                  onChange={(e) => setRegisterForm((prev) => ({ ...prev, relationship: e.target.value }))}
                  disabled={isLoading}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Patient Invite Code</label>
                <Input
                  placeholder="e.g., ABC123"
                  value={registerForm.patientCode}
                  onChange={(e) => setRegisterForm((prev) => ({ ...prev, patientCode: e.target.value.toUpperCase() }))}
                  disabled={isLoading}
                  className="uppercase"
                />
                <p className="text-xs text-muted-foreground">
                  Ask your patient or their caregiver for this code
                </p>
              </div>

              <Button type="submit" className="w-full" size="lg" disabled={isLoading}>
                {isLoading ? 'Creating Account...' : 'Create Account'}
              </Button>
            </form>
          )}
        </CardContent>

        <CardFooter className="flex flex-col gap-4 pt-0">
          <div className="relative w-full">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white dark:bg-gray-800 px-2 text-muted-foreground">
                {isRegistering ? 'Already have an account?' : "Don't have an account?"}
              </span>
            </div>
          </div>

          <Button
            variant="outline"
            className="w-full"
            onClick={() => {
              setIsRegistering(!isRegistering);
              setError(null);
            }}
            disabled={isLoading}
          >
            {isRegistering ? 'Sign In Instead' : 'Create Account'}
          </Button>
        </CardFooter>
      </Card>

      {/* Quick access for demo */}
      <div className="mt-6 text-center">
        <p className="text-sm text-muted-foreground mb-2">For demo purposes:</p>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            // Demo login - bypass authentication
            const sessionData = {
              token: 'demo-token',
              familyId: 'demo-family',
              name: 'Demo Family Member',
              patientId: 'patient-main',
              expiresAt: Date.now() + 24 * 60 * 60 * 1000,
            };
            localStorage.setItem('familySession', JSON.stringify(sessionData));
            toast({
              title: 'Demo Mode',
              description: 'Logged in as demo family member',
            });
            navigate('/family/dashboard');
          }}
        >
          <Phone className="w-4 h-4 mr-2" />
          Continue as Demo User
        </Button>
      </div>
    </div>
  );
}
