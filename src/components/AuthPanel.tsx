import React, { useState } from 'react';
import { Mail, ArrowRight, Loader2 } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Separator } from './ui/separator';
import { useToast } from '../hooks/use-toast';
import { supabase } from '../lib/supabase';
import { Link } from 'react-router-dom';

// Force auth redirects to production root (avoid preview hosts and nonexistent routes)

const APP_ORIGIN = 'https://ironbooks.netlify.app/';

interface AuthPanelProps {
  mode?: 'signin' | 'signup';
}

export const AuthPanel: React.FC<AuthPanelProps> = ({ mode = 'signin' }) => {
  const [email, setEmail] = useState('');
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isMagicLinkLoading, setIsMagicLinkLoading] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [isSignUp, setIsSignUp] = useState(mode === 'signup');
  
  const { toast } = useToast();

  const validateEmail = (email: string) => {
    if (!email) {
      return 'Email is required';
    }
    if (!/\S+@\S+\.\S+/.test(email)) {
      return 'Please enter a valid email address';
    }
    return '';
  };

  const handleGoogleAuth = async () => {
    setIsGoogleLoading(true);
    try {
      localStorage.setItem('postAuthRedirect', window.location.pathname + window.location.search);
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${APP_ORIGIN}/`,
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
    const error = validateEmail(email);
    if (error) {
      setEmailError(error);
      return;
    }

    setIsMagicLinkLoading(true);
    setEmailError('');
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${APP_ORIGIN}/`,
          shouldCreateUser: isSignUp,
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

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEmail(e.target.value);
    if (emailError) {
      setEmailError('');
    }
  };

  return (
    <div className="space-y-8 animate-slide-up-fade">
      {/* Header */}
      <div className="space-y-3 text-center">
        <h1 className="text-3xl font-bold text-foreground tracking-tight">
          {isSignUp ? 'Welcome to Ironbooks' : 'Welcome to Ironbooks'}
        </h1>
        <p className="text-lg text-muted-foreground leading-relaxed">
          Your AI agent for finances
        </p>
        <p className="text-sm text-muted-foreground mt-2">
          Sign in or sign up for free<br />
          with your work email
        </p>
      </div>

      {/* Google Auth */}
      <Button
        variant="outline"
        onClick={handleGoogleAuth}
        disabled={isGoogleLoading}
        className="w-full h-11 font-medium"
      >
        {isGoogleLoading ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : (
          <svg className="h-4 w-4 mr-2" viewBox="0 0 24 24">
            <path
              fill="currentColor"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="currentColor"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="currentColor"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            />
            <path
              fill="currentColor"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
        )}
        Continue with Google
      </Button>

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <Separator className="w-full" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-card px-2 text-muted-foreground">or</span>
        </div>
      </div>

      {/* Email Form */}
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email" className="text-sm font-medium">
            Email address
          </Label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="email"
              type="email"
              placeholder="you@yourcompany.com"
              value={email}
              onChange={handleEmailChange}
              className={`pl-10 h-11 ${emailError ? 'border-destructive' : ''}`}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleMagicLink();
                }
              }}
            />
          </div>
          {emailError && (
            <p className="text-sm text-destructive" role="alert">
              {emailError}
            </p>
          )}
        </div>

        <Button
          onClick={handleMagicLink}
          disabled={isMagicLinkLoading || !email}
          className="w-full h-11 font-medium"
        >
          {isMagicLinkLoading ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <ArrowRight className="h-4 w-4 ml-2" />
          )}
          {isMagicLinkLoading ? 'Sending magic link...' : `Send magic link`}
        </Button>
      </div>

      {/* Toggle Sign In/Up */}
      <div className="text-center text-sm">
        <button
          type="button"
          onClick={() => setIsSignUp(!isSignUp)}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          {isSignUp 
            ? 'Already have an account? Sign in' 
            : "Don't have an account? Sign up"
          }
        </button>
      </div>


{/* Demo Link */}
<div className="text-center">
        <Link
          to="/demo-auth"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Try the live demo (no sign-up required)
        </Link>
      </div>
      {/* Legal */}
      <p className="text-xs text-muted-foreground text-center leading-relaxed">
        By continuing, you agree to our{' '}
        <a href="#" className="underline hover:text-foreground">
          Terms of Service
        </a>{' '}
        and{' '}
        <a href="#" className="underline hover:text-foreground">
          Privacy Policy
        </a>
        .
      </p>
    </div>
  );
};
