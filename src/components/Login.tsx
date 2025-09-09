import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Eye, EyeOff, Mail, Lock, AlertTriangle } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Separator } from './ui/separator';
import { useToast } from '../hooks/use-toast';
import { supabase } from '../lib/supabase';
import { LoginHeader } from './LoginHeader';
import { LoginFooter } from './LoginFooter';
import { SecurityBar } from './SecurityBar';
import { BenefitsPanel } from './BenefitsPanel';

// Force auth redirects to production root (avoid preview hosts and nonexistent routes)
const APP_ORIGIN = 'https://ironbooks.netlify.app';

export const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [capsLockOn, setCapsLockOn] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isMagicLinkLoading, setIsMagicLinkLoading] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string; general?: string }>({});
  const [isSignUp, setIsSignUp] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);

  const navigate = useNavigate();
  const { toast } = useToast();

  // Keep this: if you ever come back to /login with tokens in the URL, we finalize the session.
  useEffect(() => {
    const finalizeIfCallback = async () => {
      try {
        const params = new URLSearchParams(window.location.search);
        const isCb = params.get('cb') === '1';
        const hasCode = params.has('code');
        const hasAccessToken = window.location.hash.includes('access_token');

        if (isCb || hasCode || hasAccessToken) {
          await supabase.auth.getSession(); // persist session from URL
          const redirect = localStorage.getItem('postAuthRedirect') || '/';
          localStorage.removeItem('postAuthRedirect');
          setIsRedirecting(true);
          window.history.replaceState({}, '', redirect);
          navigate(redirect, { replace: true });
        }
      } catch (err: any) {
        toast({
          title: 'Sign-in completion failed',
          description: err?.message ?? 'Please try signing in again.',
          variant: 'destructive',
        });
      }
    };
    void finalizeIfCallback();
  }, [navigate, toast]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    setCapsLockOn(e.getModifierState('CapsLock'));
    if (e.key === 'Enter') {
      handleSubmit(e as any);
    } else if (e.key === 'Escape') {
      setErrors({});
    }
  };

  const validateForm = () => {
    const newErrors: typeof errors = {};
    if (!email) {
      newErrors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      newErrors.email = 'Please enter a valid email address';
    }
    if (!password) {
      newErrors.password = 'Password is required';
    } else if (password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setIsLoading(true);
    setErrors({});
    try {
      const { error } = isSignUp
        ? await supabase.auth.signUp({ email, password })
        : await supabase.auth.signInWithPassword({ email, password });

      if (error) {
        setErrors({ general: error.message });
      } else {
        toast({
          title: isSignUp ? 'Account created!' : 'Welcome back!',
          description: isSignUp
            ? 'Please check your email to verify your account.'
            : "You've been signed in successfully.",
        });
        if (!isSignUp) navigate('/');
      }
    } catch {
      setErrors({ general: 'An unexpected error occurred' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleAuth = async () => {
    setIsGoogleLoading(true);
    try {
      // Save where the user was, in case you want to restore it after landing on /
      localStorage.setItem('postAuthRedirect', window.location.pathname + window.location.search);
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          // Redirect to root so it never 404s
          redirectTo: `${APP_ORIGIN}/`,
           //redirectTo: 'https://ironbooks.netlify.app'
        },
      });
      if (error) throw error;
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to sign in with Google',
        variant: 'destructive',
      });
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const handleMagicLink = async () => {
    if (!email) {
      setErrors({ email: 'Please enter your email address first' });
      return;
    }
    if (!/\S+@\S+\.\S+/.test(email)) {
      setErrors({ email: 'Please enter a valid email address' });
      return;
    }

    setIsMagicLinkLoading(true);
    setErrors({});
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          // Send them to the app root; Supabase JS will hydrate the session on load
          emailRedirectTo: `${APP_ORIGIN}/`,
          shouldCreateUser: false, // only existing users
        },
      });
      if (error) throw error;

      toast({
        title: 'Magic link sent!',
        description: `Check your email (${email}) for a sign-in link.`,
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error?.message ?? 'Failed to send magic link. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsMagicLinkLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex flex-col">
      <LoginHeader />
      <SecurityBar />

      <div className="flex-1 flex">
        {/* Auth Card */}
        <div className="w-full lg:w-1/2 flex items-center justify-center p-8">
          <Card className="w-full max-w-md rounded-2xl shadow-xl border-0">
            <CardHeader className="space-y-2 text-center pb-6">
              <CardTitle className="text-2xl font-bold text-gray-900">
                {isSignUp ? 'Create your account' : 'Sign in to Iron Books'}
              </CardTitle>
              <CardDescription className="text-gray-600">
                Your AI-powered financial advisor for contractors
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-6">
              {errors.general && (
                <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3" aria-live="polite">
                  {errors.general}
                </div>
              )}
   

                


              {/* Single provider (Google) */}
              <Button
                variant="outline"
                onClick={handleGoogleAuth}
                disabled={isGoogleLoading || isRedirecting}
                className="w-full"
              >
                {isGoogleLoading || isRedirecting ? 'Loading…' : 'Google'}
              </Button>

              <Button
                variant="outline"
                onClick={handleMagicLink}
                disabled={isMagicLinkLoading}
                className="w-full"
              >
                {isMagicLinkLoading ? 'Sending…' : 'Email me a magic link'}
              </Button>

              <div className="flex flex-col space-y-2 text-center text-sm">
                <Link
                  to="/forgot-password"
                  className="text-blue-600 hover:text-blue-500 hover:underline focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 rounded"
                >
                  Forgot password?
                </Link>
                <button
                  type="button"
                  onClick={() => setIsSignUp(!isSignUp)}
                  className="text-blue-600 hover:underline focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 rounded"
                >
                  {isSignUp ? 'Already have an account? Sign in' : 'Create free account'}
                </button>
              </div>

              <div className="text-center">
                <Link
                  to="/demo-auth"
                  className="text-sm text-gray-600 hover:text-gray-900 hover:underline focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 rounded"
                >
                  Try the live demo (no sign-up)
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Benefits Panel */}
        <BenefitsPanel />
      </div>

      <LoginFooter />
    </div>
  );
};
