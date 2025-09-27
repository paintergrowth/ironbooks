import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../contexts/AppContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { ArrowLeft, Info } from 'lucide-react';
import { supabase } from '../lib/supabase';

function getUtmParams() {
  const qs = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
  return {
    utm_source: qs.get('utm_source'),
    utm_medium: qs.get('utm_medium'),
    utm_campaign: qs.get('utm_campaign'),
    utm_term: qs.get('utm_term'),
    utm_content: qs.get('utm_content'),
  };
}

export const DemoAuth: React.FC = () => {
  const navigate = useNavigate();
  const { setUser } = useAppContext();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    company: '',
    phone: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const formatPhoneNumber = (value: string) => {
    const cleaned = value.replace(/\D/g, '');
    const limited = cleaned.slice(0, 10);
    if (limited.length >= 6) return `(${limited.slice(0, 3)}) ${limited.slice(3, 6)}-${limited.slice(6)}`;
    if (limited.length >= 3) return `(${limited.slice(0, 3)}) ${limited.slice(3)}`;
    if (limited.length > 0) return `(${limited}`;
    return limited;
  };

  const isValidPhone = (phone: string) => {
    const cleaned = phone.replace(/\D/g, '');
    return cleaned.length === 10;
  };

  const isFormValid = formData.name && formData.email && (!formData.phone || isValidPhone(formData.phone));

  const handleInputChange = (field: string, value: string) => {
    if (field === 'phone') {
      const formatted = formatPhoneNumber(value);
      setFormData(prev => ({ ...prev, [field]: formatted }));
    } else {
      setFormData(prev => ({ ...prev, [field]: value }));
    }
  };

  const handleDemoLogin = async () => {
    if (!isFormValid) return;

    setIsSubmitting(true);
    try {
      // === Upsert lead + log using schema-aligned RPCs ===
      const utm = getUtmParams();
      const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : null;
      const emailNorm = (formData.email || '').trim().toLowerCase();

      // 1) Upsert into leads and log 'signup_submitted'
      const { error: upsertErr } = await supabase.rpc('lead_upsert_and_log_simple', {
        p_email: emailNorm,
        p_name: formData.name,
        p_company: formData.company || null,
        p_phone: formData.phone || null,
        p_source: 'DemoAuth → Enter Demo Dashboard',
        p_utm_source: utm.utm_source,
        p_utm_medium: utm.utm_medium,
        p_utm_campaign: utm.utm_campaign,
        p_utm_term: utm.utm_term,
        p_utm_content: utm.utm_content,
        p_consent_marketing: false,
        p_ip: null,
        p_user_agent: userAgent,
        p_metadata: {
          path: typeof window !== 'undefined' ? window.location.pathname : '',
          ts: new Date().toISOString(),
        } as any,
      });
      if (upsertErr) console.warn('lead_upsert_and_log_simple error:', upsertErr.message);

      // 2) Log 'signin_success' for demo entry
      const { error: signinErr } = await supabase.rpc('lead_log_signin_simple', {
        p_email: emailNorm,
        p_ip: null,
        p_user_agent: userAgent,
        p_metadata: { via: 'demo_gate' } as any,
      });
      if (signinErr) console.warn('lead_log_signin_simple error:', signinErr.message);

      // === Existing behavior: proceed into demo with a demo user ===
      const demoUser = {
        id: 'demo-user',
        email: 'demo@ironbooks.com',
        user_metadata: { full_name: 'Demo User' },
        app_metadata: {},
        aud: 'authenticated',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        email_confirmed_at: new Date().toISOString(),
        phone_confirmed_at: null,
        confirmation_sent_at: null,
        recovery_sent_at: null,
        email_change_sent_at: null,
        new_email: null,
        invited_at: null,
        action_link: null,
        phone: null,
        role: 'authenticated',
        last_sign_in_at: new Date().toISOString()
      };

      setUser(demoUser as any);
      navigate('/');
    } catch (error) {
      console.error('Error during demo login:', error);

      // Fail-soft: still allow demo even if capture/log fails
      const demoUser = {
        id: 'demo-user',
        email: 'demo@ironbooks.com',
        user_metadata: { full_name: 'Demo User' },
        app_metadata: {},
        aud: 'authenticated',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        email_confirmed_at: new Date().toISOString(),
        phone_confirmed_at: null,
        confirmation_sent_at: null,
        recovery_sent_at: null,
        email_change_sent_at: null,
        new_email: null,
        invited_at: null,
        action_link: null,
        phone: null,
        role: 'authenticated',
        last_sign_in_at: new Date().toISOString()
      };
      setUser(demoUser as any);
      navigate('/');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">Demo Access</CardTitle>
          <CardDescription>
            Experience IronBooks with read-only demo data
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Lead Capture Form */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                type="text"
                placeholder="Your full name"
                value={formData.name}
                onChange={(e) => handleInputChange('name', e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email *</Label>
              <Input
                id="email"
                type="email"
                placeholder="your.email@company.com"
                value={formData.email}
                onChange={(e) => handleInputChange('email', e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="company">Company</Label>
              <Input
                id="company"
                type="text"
                placeholder="Your company name"
                value={formData.company}
                onChange={(e) => handleInputChange('company', e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                type="tel"
                placeholder="(555) 123-4567"
                value={formData.phone}
                onChange={(e) => handleInputChange('phone', e.target.value)}
                className={formData.phone && !isValidPhone(formData.phone) ? 'border-red-500' : ''}
              />
              {formData.phone && !isValidPhone(formData.phone) && (
                <p className="text-xs text-red-600">Please enter a valid 10-digit phone number</p>
              )}
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start space-x-3">
              <Info className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-blue-800">
                <p className="font-medium mb-1">Demo Features:</p>
                <ul className="space-y-1 text-blue-700">
                  <li>• View sample financial data</li>
                  <li>• Explore all dashboard features</li>
                  <li>• Read-only access (no changes saved)</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <Button
              onClick={handleDemoLogin}
              className="w-full"
              size="lg"
              disabled={!isFormValid || isSubmitting}
            >
              {isSubmitting ? 'Loading...' : 'Enter Demo Dashboard'}
            </Button>

            <Button
              variant="outline"
              onClick={() => navigate('/login')}
              className="w-full"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Sign In
            </Button>
          </div>

          <div className="text-xs text-gray-500 text-center">
            <p>Demo data is read-only and resets on page refresh</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
