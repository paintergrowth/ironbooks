// src/pages/Settings.tsx
// update settings.
import React, { useEffect, useState } from 'react';
import ViewingAsChip from "@/components/ViewingAsChip";
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
  Globe,
  Smartphone,
  Save
} from 'lucide-react';

const Settings: React.FC = () => {
  // Keep initial visuals the same; state will be hydrated from DB on mount.
  const [notifications, setNotifications] = useState({
    email: true,
    push: false,
    reports: true,
    security: true, // UI-only; not persisted
  });
  const [profile, setProfile] = useState({
    name: 'John Smith',
    email: 'john.smith@company.com',
    phone: '+1 (555) 123-4567',
    company: 'Demo Company Inc.',
    designation: 'CFO', // renamed from "role" → "designation"
  });
  const { theme, setTheme } = useTheme();
  const [saving, setSaving] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false); // NEW

  // -------- Load current user's profile on mount --------
  useEffect(() => {
    (async () => {
      try {
        const { data: { user }, error: userErr } = await supabase.auth.getUser();
        if (userErr) throw userErr;
        if (!user) return;

        // Always reflect auth email in the field (readable; not persisted here)
        setProfile((p) => ({ ...p, email: user.email ?? p.email }));

        // Fetch profiles row (nullable fields OK)
        const { data, error } = await supabase
          .from('profiles')
          .select('full_name, phone, company, designation, settings, role')  // NEW: load role
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
        }
        // If no row exists yet, keep defaults; first save will create it.
      } catch (e) {
        console.error('[Settings] load failed:', e);
      }
    })();
  }, []);

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

  return (
    <div className="h-[100dvh]">
      <div className="max-w-4xl mx-auto space-y-8 p-6 h-full overflow-y-auto">  
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Settings</h1>
            <p className="text-gray-600 dark:text-gray-300 mt-1">Manage your account and preferences</p>
          </div>

          {/* Right-aligned actions */}
          <div className="flex items-center gap-3">
            {isAdmin && (
              <Button
                asChild
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                title="Open Admin Panel"
              >
                <Link to="/admin-panel">
                  <Shield className="mr-2 h-4 w-4" />
                  Open Admin Panel
                </Link>
              </Button>
            )}

            {/* Chip only renders when impersonating */}
            <ViewingAsChip />

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

        {/* Integrations (QuickBooks removed) */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Database className="mr-2 h-5 w-5" />
              Integrations
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Xero only (QuickBooks block removed as requested) */}
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
