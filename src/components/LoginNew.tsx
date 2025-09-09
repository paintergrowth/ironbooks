import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../hooks/use-toast';
import { supabase } from '../lib/supabase';
import { AuthLayout } from './AuthLayout';
import { AuthPanel } from './AuthPanel';
import { ShowcaseImage } from './ShowcaseImage';

export const LoginNew: React.FC = () => {
  const [isRedirecting, setIsRedirecting] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  // Handle OAuth callback and session finalization
  useEffect(() => {
    const finalizeIfCallback = async () => {
      try {
        const params = new URLSearchParams(window.location.search);
        const isCb = params.get('cb') === '1';
        const hasCode = params.has('code');
        const hasAccessToken = window.location.hash.includes('access_token');

        if (isCb || hasCode || hasAccessToken) {
          setIsRedirecting(true);
          await supabase.auth.getSession(); // persist session from URL
          const redirect = localStorage.getItem('postAuthRedirect') || '/';
          localStorage.removeItem('postAuthRedirect');
          window.history.replaceState({}, '', redirect);
          navigate(redirect, { replace: true });
        }
      } catch (err: any) {
        toast({
          title: 'Sign-in completion failed',
          description: err?.message ?? 'Please try signing in again.',
          variant: 'destructive',
        });
      } finally {
        setIsRedirecting(false);
      }
    };
    
    void finalizeIfCallback();
  }, [navigate, toast]);

  if (isRedirecting) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-muted-foreground">Completing sign-in...</p>
        </div>
      </div>
    );
  }

  return (
    <AuthLayout showCaseComponent={<ShowcaseImage />}>
      <AuthPanel />
    </AuthLayout>
  );
};
