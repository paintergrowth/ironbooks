import React, { useEffect, useMemo, useState, useRef } from 'react';
import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { User, Shield, Link, Key, Mail, UserX, CreditCard } from 'lucide-react';

interface UserDetailDrawerProps {
  user: any;
  isOpen: boolean;
  onClose: () => void;
  /** optional: parent can refresh grid after save */
  onSaved?: () => void;
}

type RoleDraft = 'Admin' | 'User';
type StatusDraft = 'Active' | 'Suspended';
type PlanDraft = 'No Subscription' | 'Iron' | 'Gold' | 'Platinum';

type Baseline = {
  name: string;
  role: RoleDraft;
  status: StatusDraft;
  plan: PlanDraft;
  company: string;
};

type ArtifactRow = {
  id?: string;
  realm_id: string;
  year: number;
  month: number;
  pdf_path: string | null;
  video_url: string | null;
  pnl_generated: boolean;
  video_added: boolean;
};

type MonthKey = string; // "YYYY-MM"

const UserDetailDrawer: React.FC<UserDetailDrawerProps> = ({ user, isOpen, onClose, onSaved }) => {
  if (!user) return null;

  // ----- initial values from props (safe fallbacks) -----
  const initialName = useMemo(() => (user.fullName === '—' ? '' : (user.fullName ?? '')), [user?.id]);
  const initialRoleTitle: RoleDraft = (user.role === 'Admin' || user.role === 'User') ? user.role : 'User';
  const initialStatus: StatusDraft = user.isActive ? 'Active' : 'Suspended';
  const initialPlan: PlanDraft = (['No Subscription', 'Iron', 'Gold', 'Platinum'].includes(user.plan) ? user.plan : 'No Subscription') as PlanDraft;
  // Try to use any company-ish prop if present; otherwise empty string
  const initialCompany = useMemo(
    () => (user.company ?? user.organization ?? '') as string,
    [user?.id]
  );

  // ----- baseline (for dirty detection) & drafts -----
  const [baseline, setBaseline] = useState<Baseline>({
    name: initialName,
    role: initialRoleTitle,
    status: initialStatus,
    plan: initialPlan,
    company: initialCompany,
  });

  const [nameDraft, setNameDraft] = useState<string>(initialName);
  const [roleDraft, setRoleDraft] = useState<RoleDraft>(initialRoleTitle);
  const [statusDraft, setStatusDraft] = useState<StatusDraft>(initialStatus);
  const [planDraft, setPlanDraft] = useState<PlanDraft>(initialPlan);
  const [companyDraft, setCompanyDraft] = useState<string>(initialCompany);
  const [isSaving, setIsSaving] = useState(false);
  const fileInputs = useRef<Record<MonthKey, HTMLInputElement | null>>({});

  // ====== Financials tab state (isolated) ======
  const [viewerIsAdmin, setViewerIsAdmin] = useState<boolean>(false);

  // NEW: Resolve realm id robustly (use grid value if present; otherwise fetch from profiles)
  const initialRealmGuess: string | null =
    user.realmId || user.realm_id || user.qbo_realm_id || null;
  const [resolvedRealmId, setResolvedRealmId] = useState<string | null>(initialRealmGuess);

  const buildMonths = () => {
    const out: { y: number; m: number; key: MonthKey; label: string }[] = [];
    const now = new Date();
    const start = new Date(now.getFullYear() - 1, 0, 1); // last year Jan 1
    const end = new Date(now.getFullYear(), now.getMonth(), 1); // current month start
    for (let d = new Date(start); d <= end; d.setMonth(d.getMonth() + 1)) {
      const y = d.getFullYear();
      const m = d.getMonth() + 1;
      const key = `${y}-${String(m).padStart(2, '0')}`;
      const label = d.toLocaleString('en-US', { year: 'numeric', month: 'short' });
      out.push({ y, m, key, label });
    }
    return out;
  };
  const months = useMemo(buildMonths, [user?.id]);

  const [artifacts, setArtifacts] = useState<Record<MonthKey, ArtifactRow | null>>({});
  const [videoDrafts, setVideoDrafts] = useState<Record<MonthKey, string>>({});
  const [signedLinks, setSignedLinks] = useState<Record<MonthKey, string>>({});
  const [loadingArtifacts, setLoadingArtifacts] = useState(false);
  const [savingByMonth, setSavingByMonth] = useState<Record<MonthKey, boolean>>({});

  // Re-init from incoming user on open / user change
  useEffect(() => {
    const nextBaseline: Baseline = {
      name: initialName,
      role: initialRoleTitle,
      status: initialStatus,
      plan: initialPlan,
      company: initialCompany,
    };
    setBaseline(nextBaseline);
    setNameDraft(nextBaseline.name);
    setRoleDraft(nextBaseline.role);
    setStatusDraft(nextBaseline.status);
    setPlanDraft(nextBaseline.plan);
    setCompanyDraft(nextBaseline.company);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Best-effort fresh read from DB (will succeed if RLS allows; otherwise silently no-op)
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const { data } = await supabase
          .from('profiles')
          .select('full_name,is_active,role,plan,company')
          .eq('id', user.id)
          .maybeSingle();

        if (!cancelled && data) {
          const freshBaseline: Baseline = {
            name: data.full_name ?? '',
            role: (data.role === 'admin' ? 'Admin' : 'User') as RoleDraft,
            status: (data.is_active ? 'Active' : 'Suspended') as StatusDraft,
            plan: (['No Subscription', 'Iron', 'Gold', 'Platinum'].includes(data.plan) ? data.plan : 'No Subscription') as PlanDraft,
            company: data.company ?? '',
          };
          setBaseline(freshBaseline);
          setNameDraft(freshBaseline.name);
          setRoleDraft(freshBaseline.role);
          setStatusDraft(freshBaseline.status);
          setPlanDraft(freshBaseline.plan);
          setCompanyDraft(freshBaseline.company);
        }
      } catch {
        // ignore (likely RLS), fall back to props
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  // ----- dirty detection -----
  const isDirty =
    (nameDraft ?? '').trim() !== (baseline.name ?? '').trim() ||
    roleDraft !== baseline.role ||
    statusDraft !== baseline.status ||
    planDraft !== baseline.plan ||
    (companyDraft ?? '').trim() !== (baseline.company ?? '').trim();

  const handleCancel = () => onClose();

  const handleSave = async () => {
    if (!isDirty) return;

    // Build minimal update payload
    const updates: Record<string, any> = {};
    if ((nameDraft ?? '').trim() !== (baseline.name ?? '').trim()) updates.full_name = nameDraft.trim();
    if (roleDraft !== baseline.role) updates.role = roleDraft.toLowerCase(); // 'admin' | 'user'
    if (statusDraft !== baseline.status) updates.is_active = (statusDraft === 'Active'); // boolean
    if (planDraft !== baseline.plan) updates.plan = planDraft;
    if ((companyDraft ?? '').trim() !== (baseline.company ?? '').trim()) updates.company = companyDraft.trim();

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', user.id)
        .select('id')
        .maybeSingle();

      if (error) {
        console.error('[UserDetailDrawer] save failed:', error);
        alert(error.message || 'Failed to save changes.');
        return;
      }

      onSaved?.(); // let parent refresh grid
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  // Determine if current viewer is admin
  useEffect(() => {
    let cancelled = false;
    const loadViewer = async () => {
      try {
        const { data: { user: u } } = await supabase.auth.getUser();
        if (!u) return;
        const { data: me } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', u.id)
          .maybeSingle();
        if (!cancelled) setViewerIsAdmin(me?.role === 'admin');
      } catch {
        if (!cancelled) setViewerIsAdmin(false);
      }
    };
    if (isOpen) loadViewer();
    return () => { cancelled = true; };
  }, [isOpen]);

  // NEW: Resolve realm id if not passed by grid
  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      // if grid already provided it, keep it
      if (initialRealmGuess) {
        if (!cancelled) setResolvedRealmId(initialRealmGuess);
        return;
      }

      // else fetch from profiles
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('qbo_realm_id')
          .eq('id', user.id)
          .maybeSingle();

        if (!cancelled) {
          const r = data?.qbo_realm_id ?? null;
          setResolvedRealmId(r);
          console.log('[UserDetailDrawer] realm resolved via profiles', { userId: user.id, qbo_realm_id: r, error });
        }
      } catch {
        if (!cancelled) setResolvedRealmId(null);
      }
    };

    if (isOpen && user?.id) run();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, user?.id, initialRealmGuess]);

  // Load artifacts for selected user's realm (admin-only)
  useEffect(() => {
    let cancelled = false;
    const loadArtifacts = async () => {
      if (!isOpen || !viewerIsAdmin || !resolvedRealmId) {
        setArtifacts({});
        setVideoDrafts({});
        setSignedLinks({});
        return;
      }
      setLoadingArtifacts(true);
      try {
        const years = Array.from(new Set(months.map(m => m.y)));
        const { data, error } = await supabase
          .from('qbo_financial_artifacts')
          .select('id,realm_id,year,month,pdf_path,video_url,pnl_generated,video_added')
          .eq('realm_id', resolvedRealmId)
          .in('year', years);
        if (error) throw error;

        const map: Record<MonthKey, ArtifactRow | null> = {};
        months.forEach(({ y, m, key }) => {
          const row = (data || []).find(r => r.year === y && r.month === m) as ArtifactRow | undefined;
          map[key] = row || null;
        });

        const drafts: Record<MonthKey, string> = {};
        Object.entries(map).forEach(([k, r]) => { drafts[k] = r?.video_url || ''; });

        // Pre-generate signed URLs for rows that have a pdf_path
        const links: Record<MonthKey, string> = {};
        for (const { key } of months) {
          const r = map[key];
          if (r?.pdf_path) {
            const { data: s } = await supabase
              .storage.from('financial-reports')
              .createSignedUrl(r.pdf_path, 3600);
            if (s?.signedUrl) links[key] = s.signedUrl;
          }
        }

        if (!cancelled) {
          setArtifacts(map);
          setVideoDrafts(drafts);
          setSignedLinks(links);
        }
      } catch (e) {
        console.error('[Financials] load error', e);
        if (!cancelled) {
          setArtifacts({});
          setVideoDrafts({});
          setSignedLinks({});
        }
      } finally {
        if (!cancelled) setLoadingArtifacts(false);
      }
    };
    loadArtifacts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, viewerIsAdmin, resolvedRealmId, user?.id]);

  // Financial handlers
  const monthKey = (y: number, m: number) => `${y}-${String(m).padStart(2, '0')}`;
  const setBusy = (k: MonthKey, v: boolean) => setSavingByMonth(prev => ({ ...prev, [k]: v }));
  const pdfPathFor = (realm: string, y: number, m: number) => `${realm}/${y}/${String(m).padStart(2, '0')}/report.pdf`;

  async function refreshOne(y: number, m: number) {
    if (!resolvedRealmId) return;
    const key = monthKey(y, m);
    const { data: r } = await supabase
      .from('qbo_financial_artifacts')
      .select('id,realm_id,year,month,pdf_path,video_url,pnl_generated,video_added')
      .eq('realm_id', resolvedRealmId).eq('year', y).eq('month', m).maybeSingle();
    setArtifacts(prev => ({ ...prev, [key]: (r as ArtifactRow) || null }));
    if ((r as ArtifactRow | null)?.pdf_path) {
      const { data: s } = await supabase.storage.from('financial-reports').createSignedUrl((r as ArtifactRow).pdf_path!, 3600);
      setSignedLinks(prev => ({ ...prev, [key]: s?.signedUrl || '' }));
    } else {
      setSignedLinks(prev => ({ ...prev, [key]: '' }));
    }
  }

  async function upsertRow(y: number, m: number, patch: Partial<ArtifactRow>) {
    if (!resolvedRealmId) return;
    const payload: any = { realm_id: resolvedRealmId, year: y, month: m, ...patch };
    const { error } = await supabase
      .from('qbo_financial_artifacts')
      .upsert([payload], { onConflict: 'realm_id,year,month' });
    if (error) throw error;
  }

  async function handleUpload(y: number, m: number, file: File) {
    if (!resolvedRealmId) return;
    const key = monthKey(y, m);
    try {
      setBusy(key, true);
      const path = pdfPathFor(resolvedRealmId, y, m);
      const { error: upErr } = await supabase.storage.from('financial-reports').upload(path, file, { upsert: true });
      if (upErr) throw upErr;

      const { data: { user: u } } = await supabase.auth.getUser();
      await upsertRow(y, m, { pdf_path: path, uploaded_by: u?.id || null });

      await refreshOne(y, m);
      onSaved?.();
    } catch (e: any) {
      alert(e.message || 'Upload failed');
    } finally {
      setBusy(key, false);
    }
  }

  async function handleDelete(y: number, m: number) {
    if (!resolvedRealmId) return;
    const key = monthKey(y, m);
    try {
      setBusy(key, true);
      const row = artifacts[key];
      if (row?.pdf_path) {
        await supabase.storage.from('financial-reports').remove([row.pdf_path]);
      }
      await upsertRow(y, m, { pdf_path: null });

      await refreshOne(y, m);
      onSaved?.();
    } catch (e: any) {
      alert(e.message || 'Delete failed');
    } finally {
      setBusy(key, false);
    }
  }

  async function handleSaveVideo(y: number, m: number, url: string) {
    if (!resolvedRealmId) return;
    const key = monthKey(y, m);
    try {
      setBusy(key, true);
      const clean = url.trim() || null;
      await upsertRow(y, m, { video_url: clean });

      await refreshOne(y, m);
      onSaved?.();
    } catch (e: any) {
      alert(e.message || 'Save failed');
    } finally {
      setBusy(key, false);
    }
  }

  return (
    <Sheet open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent className="w-[600px] sm:max-w-[600px] overflow-y-auto">
        <SheetHeader>
          <div className="flex items-center justify-between">
            <SheetTitle className="flex items-center space-x-2">
              <User className="w-5 h-5" />
              <span>{baseline.name || user.fullName}</span>
            </SheetTitle>

            {isDirty && (
              <div className="space-x-2">
                <Button variant="outline" size="sm" onClick={handleCancel} disabled={isSaving}>
                  Cancel
                </Button>
                <Button size="sm" onClick={handleSave} disabled={isSaving}>
                  {isSaving ? 'Saving…' : 'Save'}
                </Button>
              </div>
            )}
          </div>
        </SheetHeader>

        <div className="mt-6">
          <Tabs defaultValue="overview" className="w-full">
            {/* grid-cols from 4 -> 5 to add Financials */}
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="activity">Activity</TabsTrigger>
              <TabsTrigger value="billing">Billing</TabsTrigger>
              <TabsTrigger value="actions">Actions</TabsTrigger>
              <TabsTrigger value="financials">Financials</TabsTrigger>
            </TabsList>

            {/* OVERVIEW */}
            <TabsContent value="overview" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Profile</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Name (editable) – shown ABOVE Email */}
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Name:</span>
                    <div className="min-w-[14rem]">
                      <Input
                        value={nameDraft}
                        onChange={(e) => setNameDraft(e.target.value)}
                        className="h-8"
                        placeholder="Enter full name"
                      />
                    </div>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Email:</span>
                    <span className="text-sm font-medium">{user.email}</span>
                  </div>

                  {/* Status (editable) */}
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Status:</span>
                    <div className="min-w-[10rem]">
                      <Select value={statusDraft} onValueChange={(v) => setStatusDraft(v as StatusDraft)}>
                        <SelectTrigger className="h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Active">Active</SelectItem>
                          <SelectItem value="Suspended">Suspended</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Role (editable) */}
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Role:</span>
                    <div className="min-w-[8rem]">
                      <Select value={roleDraft} onValueChange={(v) => setRoleDraft(v as RoleDraft)}>
                        <SelectTrigger className="h-8">
                          <SelectValue placeholder="Select role" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="User">User</SelectItem>
                          <SelectItem value="Admin">Admin</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Organization (editable -> profiles.company) */}
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Organization:</span>
                    <div className="min-w-[14rem]">
                      <Input
                        value={companyDraft}
                        onChange={(e) => setCompanyDraft(e.target.value)}
                        className="h-8"
                        placeholder="Enter organization"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">QuickBooks Integration</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Status:</span>
                    <Badge variant={user.qboConnected ? "default" : "outline"}>
                      {user.qboConnected ? 'Connected' : 'Not Connected'}
                    </Badge>
                  </div>
                  {user.qboConnected && (
                    <>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">Company:</span>
                        <span className="text-sm">{user.qboCompany || 'N/A'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">Last Sync:</span>
                        <span className="text-sm">{formatDate(user.qboLastSync || user.lastLogin)}</span>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* ACTIVITY */}
            <TabsContent value="activity" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">CFO Agent Usage</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Total Uses:</span>
                      <span className="text-sm font-bold">{user.cfoAgentUses}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Last 7 days:</span>
                      <span className="text-sm">{user.cfoUses7d || Math.floor(user.cfoAgentUses * 0.3)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Last 30 days:</span>
                      <span className="text-sm">{user.cfoUses30d || Math.floor(user.cfoAgentUses * 0.7)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Login History</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Last Login:</span>
                      <span>{formatDate(user.lastLogin)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Created:</span>
                      <span>{formatDate(user.createdAt)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* BILLING */}
            <TabsContent value="billing" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Plan & Billing</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Plan (editable) */}
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Plan:</span>
                    <div className="min-w-[12rem]">
                      <Select value={planDraft} onValueChange={(v) => setPlanDraft(v as PlanDraft)}>
                        <SelectTrigger className="h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="No Subscription">No Subscription</SelectItem>
                          <SelectItem value="Iron">Iron</SelectItem>
                          <SelectItem value="Gold">Gold</SelectItem>
                          <SelectItem value="Platinum">Platinum</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Status:</span>
                    <Badge variant={user.billingStatus === 'active' ? 'default' : 'destructive'}>
                      {user.billingStatus || 'Active'}
                    </Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">MRR:</span>
                    <span className="text-sm font-medium">${user.mrr || '99'}</span>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ACTIONS */}
            <TabsContent value="actions" className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Button size="sm" variant="outline" className="justify-start">
                  <Shield className="w-4 h-4 mr-2" />
                  Impersonate
                </Button>
                <Button size="sm" variant="outline" className="justify-start">
                  <Key className="w-4 h-4 mr-2" />
                  Reset Password
                </Button>
                <Button size="sm" variant="outline" className="justify-start">
                  <Mail className="w-4 h-4 mr-2" />
                  Resend Invite
                </Button>
                <Button size="sm" variant="outline" className="justify-start">
                  <Link className="w-4 h-4 mr-2" />
                  Relink QBO
                </Button>
                <Button size="sm" variant="outline" className="justify-start">
                  <UserX className="w-4 h-4 mr-2" />
                  Suspend User
                </Button>
                <Button size="sm" variant="outline" className="justify-start">
                  <CreditCard className="w-4 h-4 mr-2" />
                  Grant Credit
                </Button>
              </div>
            </TabsContent>

            {/* FINANCIALS (admin-only) */}
            <TabsContent value="financials" className="space-y-4">
              {!viewerIsAdmin ? (
                <Card>
                  <CardContent className="text-sm text-gray-600">
                    Only admins can view Financials.
                  </CardContent>
                </Card>
              ) : !resolvedRealmId ? (
                <Card>
                  <CardContent className="text-sm text-gray-600">
                    This user does not have a connected QuickBooks realm.
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Financials (Realm: {resolvedRealmId})</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {loadingArtifacts ? (
                      <div className="text-sm text-gray-600">Loading…</div>
                    ) : (
{/* nicer monthly cards */}
<div className="grid grid-cols-1 gap-3">
  {months.map(({ y, m, key, label }) => {
    const row = artifacts[key];
    const busy = !!savingByMonth[key];
    const signedUrl = signedLinks[key];

    return (
      <div
        key={key}
        className="rounded-xl border bg-white/50 p-4 shadow-sm hover:shadow-md transition-colors"
      >
        {/* Row 1 — Month & Year */}
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold">{label}</div>
          {/* optional tiny status chips */}
          <div className="flex items-center gap-2">
            <span className={`text-xs px-2 py-0.5 rounded-full border ${
              row?.pdf_path ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-50 text-gray-600 border-gray-200'
            }`}>
              PDF {row?.pdf_path ? 'attached' : 'missing'}
            </span>
            <span className={`text-xs px-2 py-0.5 rounded-full border ${
              row?.video_added ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-50 text-gray-600 border-gray-200'
            }`}>
              Video {row?.video_added ? 'added' : 'pending'}
            </span>
          </div>
        </div>

        <div className="mt-3 space-y-3 divide-y">
          {/* Row 2 — P&L Generated + PDF controls */}
          <div className="pt-1 first:pt-0 flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                readOnly
                checked={!!row?.pnl_generated}
                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-2 focus:ring-primary/30"
              />
              <span className="text-gray-700">P&amp;L Generated</span>
            </label>

            <div className="flex items-center gap-2">
              {row?.pdf_path && signedUrl ? (
                <>
                  <a
                    className="text-sm underline text-blue-700 hover:text-blue-800"
                    href={signedUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View PDF
                  </a>
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => handleDelete(y, m)}>
                    {busy ? 'Deleting…' : 'Delete'}
                  </Button>
                </>
              ) : (
                <>
                  <input
                    type="file"
                    accept="application/pdf"
                    className="hidden"
                    ref={(el) => { fileInputs.current[key] = el; }}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleUpload(y, m, f);
                      e.currentTarget.value = '';
                    }}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => fileInputs.current[key]?.click()}
                  >
                    {busy ? 'Uploading…' : 'Upload PDF'}
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Row 3 — Video Added + URL input (full width) */}
          <div className="pt-3 flex flex-col gap-2">
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                readOnly
                checked={!!row?.video_added}
                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-2 focus:ring-primary/30"
              />
              <span className="text-gray-700">Video Added</span>
            </label>

            <Input
              value={videoDrafts[key] ?? ''}
              onChange={(e) => setVideoDrafts(prev => ({ ...prev, [key]: e.target.value }))}
              placeholder="https://video-url…"
              className="h-9 w-full"
              disabled={busy}
            />
          </div>

          {/* Row 4 — Save button (right aligned) */}
          <div className="pt-3 flex justify-end">
            <Button
              size="sm"
              disabled={busy}
              onClick={() => handleSaveVideo(y, m, videoDrafts[key] ?? '')}
              className="min-w-[88px]"
            >
              {busy ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>
      </div>
    );
  })}
</div>

                    )}
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default UserDetailDrawer;
