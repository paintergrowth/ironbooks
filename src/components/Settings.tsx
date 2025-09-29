// src/pages/Settings.tsx
// update settings.
import React, { useEffect, useState } from 'react';
import ViewingAsChip from "@/components/ViewingAsChip";
import ImpersonateDropdown from "@/components/ImpersonateDropdown";
import { supabase } from '@/lib/supabase';
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { useTheme } from '@/components/theme-provider';
import { useToast } from '@/hooks/use-toast';
import { 
  LogOut, 
  Key, 
  HelpCircle, 
  Moon,
  Sun,
  Shield,
  Bell,
  Database,
  Users,
  //Globe,
  Smartphone,
  Save,
  ExternalLink
} from 'lucide-react';
import { useImpersonation } from '@/lib/impersonation';

console.log('[Settings] file loaded');

/** ===== Intuit (QuickBooks) OAuth config (copied from CFOAgent) ===== */
const QBO_CLIENT_ID = 'ABdBqpI0xI6KDjHIgedbLVEnXrqjJpqLj2T3yyT7mBjkfI4ulJ';
const QBO_REDIRECT_URI = 'https://ironbooks.netlify.app/?connected=qbo';
const QBO_SCOPES = 'com.intuit.quickbooks.accounting openid profile email';
const QBO_AUTHORIZE_URL = 'https://appcenter.intuit.com/connect/oauth2';

function randomState(len = 24) {
  try {
    const arr = new Uint8Array(len);
    crypto.getRandomValues(arr);
    return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  }
}

function buildQboAuthUrl() {
  const state = randomState();
  try {
    localStorage.setItem('qbo_oauth_state', state);
    localStorage.setItem('qbo_postAuthReturn', window.location.pathname + window.location.search + window.location.hash);
  } catch {}
  const url =
    `${QBO_AUTHORIZE_URL}` +
    `?client_id=${encodeURIComponent(QBO_CLIENT_ID)}` +
    `&redirect_uri=${encodeURIComponent(QBO_REDIRECT_URI)}` +
    `&response_type=code` +
    `&scope=${encodeURIComponent(QBO_SCOPES)}` +
    `&state=${encodeURIComponent(state)}` +
    `&prompt=consent`;
  return url;
}

const Settings: React.FC = () => {
  const [notifications, setNotifications] = useState({
    email: true,
    push: false,
    reports: true,
    security: true,
  });
  const [profile, setProfile] = useState({
    name: 'John Smith',
    email: 'john.smith@company.com',
    phone: '+1 (555) 123-4567',
    company: 'Demo Company Inc.',
    designation: 'CFO',
  });
  const { theme, setTheme } = useTheme();
  const [saving, setSaving] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  // QuickBooks connection state (real user only)
  const [qboConnected, setQboConnected] = useState(false);
  const [effRealmId, setEffRealmId] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState<string | null>(null); // NEW

  const { toast } = useToast();

  // Impersonation state + reset key for dropdown
  const { isImpersonating } = useImpersonation();
  const [impersonateKey, setImpersonateKey] = useState(0);

  // When “Back to me” is clicked (inside ViewingAsChip), isImpersonating becomes false.
  // Force-remount the dropdown so it clears to blank.
  useEffect(() => {
    if (!isImpersonating) setImpersonateKey(k => k + 1);
  }, [isImpersonating]);

  // -------- Load current user's profile on mount --------
  useEffect(() => {
    (async () => {
      try {
        const { data: { user }, error: userErr } = await supabase.auth.getUser();
        if (userErr) throw userErr;
        if (!user) return;

        setProfile((p) => ({ ...p, email: user.email ?? p.email }));

        const { data, error } = await supabase
          .from('profiles')
          .select('full_name, phone, company, designation, settings, role, qbo_connected, qbo_realm_id')
          .eq('id', user.id)
          .maybeSingle();

        if (error) throw error;

        if (data) {
          setProfile((p) => ({
            ...p,
            name: data.full_name ?? '',
            phone: data.phone ?? '',
            company: data.company ?? '',
            designation: data.designation ?? '',
          }));

          setIsAdmin(data.role === 'admin');

          const defaults = { email: true, push: false, reports: true };
          const saved = (data.settings as any)?.notifications ?? {};
          setNotifications((n) => ({
            ...n,
            email: saved.email ?? defaults.email,
            push: saved.push ?? defaults.push,
            reports: saved.reports ?? defaults.reports,
          }));

          // QBO status from profile
          const connected = Boolean(data.qbo_connected) || Boolean(data.qbo_realm_id);
          setQboConnected(connected);
          setEffRealmId(data.qbo_realm_id ?? null);
        }
      } catch (e) {
        console.error('[Settings] load failed:', e);
      }
    })();
  }, []);

  // -------- Handle OAuth redirect (?connected=qbo) exactly like CFOAgent --------
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('connected') !== 'qbo') return;

    const code = params.get('code') || null;
    const incomingRealm = params.get('realmId') || null;
    const state = params.get('state') || null;
    const storedState = localStorage.getItem('qbo_oauth_state');

    const cleanUrl = window.location.origin + window.location.pathname;
    const finishAndClean = () => {
      try { history.replaceState({}, '', cleanUrl); } catch {}
      try { localStorage.removeItem('qbo_oauth_state'); } catch {}
    };

    if (storedState && state && storedState !== state) {
      toast({ title: 'QuickBooks', description: 'Security check failed (state mismatch). Please reconnect.', variant: 'destructive' });
      finishAndClean();
      return;
    }

    (async () => {
      try {
        const { data: { user: authedUser } } = await supabase.auth.getUser();
        if (!authedUser) {
          if (code)         { try { sessionStorage.setItem('pending_qbo_code', code); } catch {} }
          if (incomingRealm) { try { sessionStorage.setItem('pending_qbo_realm', incomingRealm); } catch {} }
          try { sessionStorage.setItem('pending_qbo_redirect', QBO_REDIRECT_URI); } catch {}
          finishAndClean();
          return;
        }

        if (code && incomingRealm) {
          const { error: fnErr } = await supabase.functions.invoke('qbo-oauth-exchange', {
            body: { code, realmId: incomingRealm, redirectUri: QBO_REDIRECT_URI, userId: authedUser.id },
          });
          if (fnErr) {
            console.warn('[QBO] exchange failed:', fnErr.message);
            toast({ title: 'QuickBooks', description: 'Failed to complete connection (token exchange).', variant: 'destructive' });
            finishAndClean();
            return;
          }
        }

        if (incomingRealm && authedUser?.id) {
          const { error } = await supabase
            .from('profiles')
            .update({
              qbo_realm_id: incomingRealm,
              qbo_connected: true,
              qbo_connected_at: new Date().toISOString(),
            })
            .eq('id', authedUser.id);

          if (error) {
            console.warn('[QBO] profiles update failed:', error.message);
            toast({ title: 'QuickBooks', description: 'Failed to save connection.', variant: 'destructive' });
          } else {
            setQboConnected(true);
            setEffRealmId(incomingRealm);
            toast({ title: 'QuickBooks', description: 'Connected successfully!' });
            // kick a full sync
            await supabase.functions.invoke('qbo-sync-transactions', {
              body: { realmId: incomingRealm, userId: authedUser.id, mode: 'full' }
            });
          }
        }
      } finally {
        finishAndClean();
      }
    })();
  }, [toast]);

  // -------- Deferred exchange if user logged in after redirect --------
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const pendingRealm = sessionStorage.getItem('pending_qbo_realm');
      const pendingCode = sessionStorage.getItem('pending_qbo_code');
      const pendingRedirect = sessionStorage.getItem('pending_qbo_redirect') || QBO_REDIRECT_URI;
      if (!pendingRealm || !pendingCode) return;

      const { error: fnErr } = await supabase.functions.invoke('qbo-oauth-exchange', {
        body: { code: pendingCode, realmId: pendingRealm, redirectUri: pendingRedirect, userId: user.id },
      });
      if (fnErr) {
        console.warn('[QBO] deferred exchange failed:', fnErr.message);
      } else {
        const { error } = await supabase
          .from('profiles')
          .update({
            qbo_realm_id: pendingRealm,
            qbo_connected: true,
            qbo_connected_at: new Date().toISOString(),
          })
          .eq('id', user.id);
        if (!error) {
          setQboConnected(true);
          setEffRealmId(pendingRealm);
          await supabase.functions.invoke('qbo-sync-transactions', {
            body: { realmId: pendingRealm, userId: user.id, mode: 'full' }
          });
        }
      }
      try {
        sessionStorage.removeItem('pending_qbo_realm');
        sessionStorage.removeItem('pending_qbo_code');
        sessionStorage.removeItem('pending_qbo_redirect');
      } catch {}
    })();
  }, []);

  // -------- NEW: Fetch company name when connected --------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!qboConnected || !effRealmId) return;
      try {
        const { data: { user } } = await supabase.auth.getUser();
        const uid = user?.id;
        if (!uid) return;
        const { data, error } = await supabase.functions.invoke('qbo-company', {
          body: { realmId: effRealmId, userId: uid, nonce: Date.now() },
        });
        if (!error && !cancelled && (data as any)?.companyName) {
          setCompanyName((data as any).companyName);
        }
      } catch {
        // ignore; keep badge as "Connected"
      }
    })();
    return () => { cancelled = true; };
  }, [qboConnected, effRealmId]);

  // -------- Save handler: upsert into public.profiles --------
  const handleSave = async () => {
    try {
      setSaving(true);
      const { data: { user }, error: userErr } = await supabase.auth.getUser();
      if (userErr) throw userErr;
      if (!user) {
        alert('Please sign in first.');
        return;
      }

      const payload = {
        id: user.id,
        full_name: profile.name?.trim() ? profile.name.trim() : null,
        phone: profile.phone?.trim() ? profile.phone.trim() : null,
        company: profile.company?.trim() ? profile.company.trim() : null,
        designation: profile.designation?.trim() ? profile.designation.trim() : null,
        settings: {
          notifications: {
            email: !!notifications.email,
            push: !!notifications.push,
            reports: !!notifications.reports,
          },
        },
      };

      const { error } = await supabase
        .from('profiles')
        .upsert(payload, { onConflict: 'id' });

      if (error) throw error;
      alert('Settings saved successfully!');
    } catch (e) {
      console.error('[Settings] save failed:', e);
      alert('Failed to save settings.');
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = () => {
    alert('Logging out...');
  };

  // ----- QuickBooks connect / reconnect (identical behavior to CFOAgent, but in Settings) -----
  const handleConnectQuickBooks = () => {
    if (isImpersonating) {
      toast({
        title: 'Impersonation',
        description: 'Connect/Reconnect is disabled while impersonating.',
        variant: 'destructive',
      });
      return;
    }
    if (!QBO_CLIENT_ID) {
      toast({ title: 'QuickBooks', description: 'Missing Client ID. Set QBO_CLIENT_ID.', variant: 'destructive' });
      return;
    }
    const url = buildQboAuthUrl();
    try { window.location.assign(url); }
    catch {
      const a = document.createElement('a');
      a.href = url;
      a.target = '_self';
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
    }
  };

  return (
    <div className="h-[100dvh]">
      <div className="max-w-4xl mx-auto space-y-8 p-6 h-full overflow-y-auto">  
        {/* Header: title + Save only */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Settings</h1>
            <p className="text-gray-600 dark:text-gray-300 mt-1">Manage your account and preferences</p>
          </div>

          <div className="flex items-center gap-3">
            <Button onClick={handleSave} className="bg-blue-600 hover:bg-blue-700" disabled={saving}>
              <Save className="mr-2 h-4 w-4" />
              {saving ? 'Saving…' : 'Save Changes'}
            </Button>
          </div>
        </div>

        {/* Profile Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Users className="mr-2 h-5 w-5" />
              Profile Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="name">Full Name</Label>
                <Input 
                  id="name" 
                  value={profile.name}
                  onChange={(e) => setProfile({...profile, name: e.target.value})}
                />
              </div>
              <div>
                <Label htmlFor="email">Email Address</Label>
                <Input 
                  id="email" 
                  type="email" 
                  value={profile.email}
                  disabled
                />
              </div>
              <div>
                <Label htmlFor="phone">Phone Number</Label>
                <Input 
                  id="phone" 
                  value={profile.phone}
                  onChange={(e) => setProfile({...profile, phone: e.target.value})}
                />
              </div>
              <div>
                <Label htmlFor="designation">Designation</Label>
                <Input 
                  id="designation" 
                  value={profile.designation}
                  onChange={(e) => setProfile({...profile, designation: e.target.value})}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Appearance */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Sun className="mr-2 h-5 w-5" />
              Appearance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center space-x-4">
              <Button
                variant={theme === 'light' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setTheme('light')}
              >
                <Sun className="mr-2 h-4 w-4" />
                Light
              </Button>
              <Button
                variant={theme === 'dark' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setTheme('dark')}
              >
                <Moon className="mr-2 h-4 w-4" />
                Dark
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* --- Admin Options (below Appearance). Only visible to admins --- */}
        {isAdmin && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Shield className="mr-2 h-5 w-5" />
                Admin Options
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Sub-tile: Impersonation */}
              <div className="p-4 border rounded-lg space-y-4">
                <div>
                  <p className="font-medium">Impersonate a Customer</p>
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    Select a customer to view the app exactly as they do.
                  </p>
                </div>

                {/* Row 1: Dropdown (full-width) */}
                <div className="w-full">
                  <div className="w-full border rounded-lg p-4 box-border">
                    <ImpersonateDropdown key={impersonateKey} />
                  </div>
                </div>

                {/* Row 2: Yellow “Viewing as” tile (full-width). Content fully contained. */}
                <div className="w-full">
                  <div
                    className={`w-full min-h-[72px] p-4 border rounded-2xl box-border overflow-hidden ${
                      isImpersonating ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 border-dashed'
                    }`}
                  >
                    <div className="max-w-full">
                      {isImpersonating ? (
                        <div className="w-full break-words [word-break:break-word]">
                          <ViewingAsChip />
                        </div>
                      ) : (
                        <p className="text-sm text-gray-600">Not impersonating anyone</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Sub-tile: Admin panel shortcut */}
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <p className="font-medium">Admin Panel</p>
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    Manage users, data, and integrations.
                  </p>
                </div>
                <Button
                  asChild
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  title="Open Admin Panel"
                  onClick={() => console.log('[Settings] Open Admin Panel clicked')}
                >
                  <Link to="/admin-panel">
                    <Shield className="mr-2 h-4 w-4" />
                    Open Admin Panel
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Notifications */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Bell className="mr-2 h-5 w-5" />
              Notifications
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Email Notifications</p>
                <p className="text-sm text-gray-600 dark:text-gray-300">Receive updates via email</p>
              </div>
              <Switch 
                checked={notifications.email}
                onCheckedChange={(checked) => setNotifications({...notifications, email: checked})}
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Push Notifications</p>
                <p className="text-sm text-gray-600 dark:text-gray-300">Browser push notifications</p>
              </div>
              <Switch 
                checked={notifications.push}
                onCheckedChange={(checked) => setNotifications({...notifications, push: checked})}
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Weekly Reports</p>
                <p className="text-sm text-gray-600 dark:text-gray-300">Automated financial summaries</p>
              </div>
              <Switch 
                checked={notifications.reports}
                onCheckedChange={(checked) => setNotifications({...notifications, reports: checked})}
              />
            </div>
          </CardContent>
        </Card>

        {/* Security */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Shield className="mr-2 h-5 w-5" />
              Security & Privacy
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Two-Factor Authentication</p>
                <p className="text-sm text-gray-600 dark:text-gray-300">Add an extra layer of security</p>
              </div>
              <Badge variant="outline" className="text-green-600 border-green-600">
                Enabled
              </Badge>
            </div>
            <Button variant="outline" className="w-full sm:w-auto">
              <Key className="mr-2 h-4 w-4" />
              Change Password
            </Button>
            <Button variant="outline" className="w-full sm:w-auto">
              <Smartphone className="mr-2 h-4 w-4" />
              Manage Devices
            </Button>
          </CardContent>
        </Card>

        {/* Integrations (QuickBooks added, Xero kept) */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Database className="mr-2 h-5 w-5" />
              Integrations
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">

            {/* QuickBooks Online */}
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center">
                  <ExternalLink className="h-5 w-5 text-emerald-600" />
                </div>
                <div>
                  <p className="font-medium">QuickBooks Online</p>
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    {qboConnected ? (
                      <>Connected{` · ${companyName || 'QuickBooks'}`}</>
                    ) : (
                      'Not connected'
                    )}
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleConnectQuickBooks}
                className="flex items-center gap-2"
                title={isImpersonating ? 'Disabled while impersonating' : 'Connect your QuickBooks Online account'}
                disabled={isImpersonating}
              >
                <ExternalLink className="h-4 w-4" />
                {qboConnected ? 'Reconnect' : 'Connect QuickBooks'}
              </Button>
            </div>

            {/* Xero (unchanged) Temporarily Disabled
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                  <Globe className="h-5 w-5 text-purple-600" />
                </div>
                <div>
                  <p className="font-medium">Xero</p>
                  <p className="text-sm text-gray-600 dark:text-gray-300">Not connected</p>
                </div>
              </div>
              <Button variant="outline" size="sm">Connect</Button>
            </div>

             */}
          </CardContent>
        </Card>

        <Separator />

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-4">
          <Button variant="outline">
            <HelpCircle className="mr-2 h-4 w-4" />
            Contact Support
          </Button>
          <Button variant="destructive" onClick={handleLogout}>
            <LogOut className="mr-2 h-4 w-4" />
            Sign Out
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Settings;
