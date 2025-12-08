
import React, { useEffect, useMemo, useState, useRef } from 'react';

import { supabase } from '@/lib/supabase';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { User, Shield, Link, Key, Mail, UserX, CreditCard } from 'lucide-react';
import { useIpLocation } from '@/hooks/useIpLocation';

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
const [lastIp, setLastIp] = useState<string | null>(null);
const [lastUserAgent, setLastUserAgent] = useState<string | null>(null);

// Fallback from grid/user object in case DB lookup fails or is empty
const candidateIp: string | null =
  user.lastIp ||
  user.last_ip ||
  user.ip_address ||
  user.ip ||
  null;

// Prefer DB lastIp; fallback to candidateIp from grid
const effectiveIp = lastIp || candidateIp;

// Now resolve location from the effective IP
const { location, status: ipStatus } = useIpLocation(effectiveIp);


  // ----- initial values from props (safe fallbacks) -----
  const initialName = useMemo(() => (user.fullName === '—' ? '' : (user.fullName ?? '')), [user?.id]);
  const initialRoleTitle: RoleDraft = (user.role === 'Admin' || user.role === 'User') ? user.role : 'User';
  const initialStatus: StatusDraft = user.isActive ? 'Active' : 'Suspended';
  const initialPlan: PlanDraft = (['No Subscription', 'Iron', 'Gold', 'Platinum'].includes(user.plan) ? user.plan : 'No Subscription') as PlanDraft;
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
    const start = new Date(now.getFullYear() - 1, 0, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 1);
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

// ⭐ NEW: last sync value from qbo_sync_queue.last_updated
const [lastSync, setLastSync] = useState<string | null>(null);
// ⭐ From user_last_activity view
const [lastActivity, setLastActivity] = useState<string | null>(null);
const [lastPage, setLastPage] = useState<string | null>(null);


  

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

    const updates: Record<string, any> = {};
    if ((nameDraft ?? '').trim() !== (baseline.name ?? '').trim()) updates.full_name = nameDraft.trim();
    if (roleDraft !== baseline.role) updates.role = roleDraft.toLowerCase();
    if (statusDraft !== baseline.status) updates.is_active = (statusDraft === 'Active');
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

      onSaved?.();
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

// Resolve realm id if not passed by grid
useEffect(() => {
  let cancelled = false;

  const run = async () => {
    if (initialRealmGuess) {
      if (!cancelled) setResolvedRealmId(initialRealmGuess);
      return;
    }
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

// ⭐ NEW EFFECT: load last sync from qbo_sync_queue
useEffect(() => {
  let cancelled = false;

  const loadLastSync = async () => {
    try {
      if (!isOpen || !resolvedRealmId) {
        if (!cancelled) setLastSync(null);
        return;
      }

      const { data, error } = await supabase
        .from('qbo_sync_queue')
        .select('last_updated')
        .eq('realm_id', resolvedRealmId)
        .maybeSingle();

      if (error) {
        console.error('[UserDetailDrawer] loadLastSync error', error);
        if (!cancelled) setLastSync(null);
        return;
      }

      if (!cancelled) {
        setLastSync(data?.last_updated ?? null);
      }
    } catch (e) {
      console.error('[UserDetailDrawer] loadLastSync exception', e);
      if (!cancelled) setLastSync(null);
    }
  };

  loadLastSync();

  return () => {
    cancelled = true;
  };
}, [isOpen, resolvedRealmId]);


// ⭐ ADD THIS NEW EFFECT:
useEffect(() => {
  let cancelled = false;

  const loadLastSync = async () => {
    try {
      if (!isOpen || !resolvedRealmId) {
        if (!cancelled) setLastSync(null);
        return;
      }

      const { data, error } = await supabase
        .from('qbo_sync_queue')
        .select('last_updated')
        .eq('realm_id', resolvedRealmId)
        .maybeSingle(); // PK is realm_id, so max 1 row

      if (error) {
        console.error('[UserDetailDrawer] loadLastSync error', error);
        if (!cancelled) setLastSync(null);
        return;
      }

      if (!cancelled) {
        setLastSync(data?.last_updated ?? null);
      }
    } catch (e) {
      console.error('[UserDetailDrawer] loadLastSync exception', e);
      if (!cancelled) setLastSync(null);
    }
  };

  loadLastSync();

  return () => {
    cancelled = true;
  };
}, [isOpen, resolvedRealmId]);

// Load last IP + user agent from page_view_events when drawer opens
useEffect(() => {
  let cancelled = false;

  const loadLastSessionMeta = async () => {
    try {
      if (!isOpen || !user?.id) {
        if (!cancelled) {
          setLastIp(null);
          setLastUserAgent(null);
        }
        return;
      }

      const { data, error } = await supabase
        .from('page_view_events')
        .select('ip_address,user_agent')
        .eq('effective_user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error('[UserDetailDrawer] loadLastSessionMeta error', error);
        if (!cancelled) {
          setLastIp(null);
          setLastUserAgent(null);
        }
        return;
      }

      if (!cancelled) {
        setLastIp(data?.ip_address ?? null);
        setLastUserAgent(data?.user_agent ?? null);
      }
    } catch (e) {
      console.error('[UserDetailDrawer] loadLastSessionMeta exception', e);
      if (!cancelled) {
        setLastIp(null);
        setLastUserAgent(null);
      }
    }
  };

  loadLastSessionMeta();

  return () => {
    cancelled = true;
  };
}, [isOpen, user?.id]);

  
// ⭐ NEW EFFECT: load last activity & last page from user_last_activity view
useEffect(() => {
  let cancelled = false;

  const loadLastActivity = async () => {
    try {
      if (!isOpen || !user?.id) {
        if (!cancelled) {
          setLastActivity(null);
          setLastPage(null);
        }
        return;
      }

      const { data, error } = await supabase
        .from('user_last_activity')
        .select('last_activity, last_page')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) {
        console.error('[UserDetailDrawer] loadLastActivity error', error);
        if (!cancelled) {
          setLastActivity(null);
          setLastPage(null);
        }
        return;
      }

      if (!cancelled) {
        setLastActivity(data?.last_activity ?? null);
        setLastPage(data?.last_page ?? null);
      }
    } catch (e) {
      console.error('[UserDetailDrawer] loadLastActivity exception', e);
      if (!cancelled) {
        setLastActivity(null);
        setLastPage(null);
      }
    }
  };

  loadLastActivity();

  return () => {
    cancelled = true;
  };
}, [isOpen, user?.id]);

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
      await upsertRow(y, m, { pdf_path: path, uploaded_by: u?.id || null } as any);

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
      <SheetContent className="w-[600px] sm:max-w-[600px] overflow-y-auto bg-background text-foreground">
        <SheetHeader>
          <div className="flex items-center justify-between">
            <SheetTitle className="flex items-center space-x-2 text-foreground">
              <User className="w-5 h-5" />
              <span>{baseline.name || user.fullName}</span>
            </SheetTitle>

            {isDirty && (
              <div className="space-x-2">
                <Button variant="outline" size="sm" onClick={handleCancel} disabled={isSaving}
                  className="dark:bg-slate-900/60 dark:border-slate-700">
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
            <TabsList className="grid w-full grid-cols-5 rounded-lg border bg-muted/30 dark:bg-slate-900/60 dark:border-slate-700">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="activity">Activity</TabsTrigger>
              <TabsTrigger value="billing">Billing</TabsTrigger>
              <TabsTrigger value="actions">Actions</TabsTrigger>
              <TabsTrigger value="financials">Financials</TabsTrigger>
            </TabsList>

            {/* OVERVIEW */}
            <TabsContent value="overview" className="space-y-4">
              <Card className="dark:bg-slate-900/60 dark:border-slate-700">
                <CardHeader>
                  <CardTitle className="text-sm text-foreground">Profile</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Name:</span>
                    <div className="min-w-[14rem]">
                      <Input
                        value={nameDraft}
                        onChange={(e) => setNameDraft(e.target.value)}
                        className="h-8 dark:bg-slate-900/60 dark:border-slate-700 placeholder:text-muted-foreground"
                        placeholder="Enter full name"
                      />
                    </div>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Email:</span>
                    <span className="text-sm font-medium text-foreground">{user.email}</span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Status:</span>
                    <div className="min-w-[10rem]">
                      <Select value={statusDraft} onValueChange={(v) => setStatusDraft(v as StatusDraft)}>
                        <SelectTrigger className="h-8 dark:bg-slate-900/60 dark:border-slate-700">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="dark:bg-slate-900/90 dark:border-slate-700">
                          <SelectItem value="Active">Active</SelectItem>
                          <SelectItem value="Suspended">Suspended</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Role:</span>
                    <div className="min-w-[8rem]">
                      <Select value={roleDraft} onValueChange={(v) => setRoleDraft(v as RoleDraft)}>
                        <SelectTrigger className="h-8 dark:bg-slate-900/60 dark:border-slate-700">
                          <SelectValue placeholder="Select role" />
                        </SelectTrigger>
                        <SelectContent className="dark:bg-slate-900/90 dark:border-slate-700">
                          <SelectItem value="User">User</SelectItem>
                          <SelectItem value="Admin">Admin</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Organization:</span>
                    <div className="min-w-[14rem]">
                      <Input
                        value={companyDraft}
                        onChange={(e) => setCompanyDraft(e.target.value)}
                        className="h-8 dark:bg-slate-900/60 dark:border-slate-700 placeholder:text-muted-foreground"
                        placeholder="Enter organization"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="dark:bg-slate-900/60 dark:border-slate-700">
                <CardHeader>
                  <CardTitle className="text-sm text-foreground">QuickBooks Integration</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Status:</span>
                    <Badge
                      variant={user.qboConnected ? "default" : "outline"}
                      className={
                        user.qboConnected
                          ? "bg-emerald-600 text-white hover:bg-emerald-700"
                          : "bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700"
                      }
                    >
                      {user.qboConnected ? 'Connected' : 'Not Connected'}
                    </Badge>
                  </div>
                  {user.qboConnected && (
                    <>
                      <div className="flex justify-between">
                        <span className="text-sm text-muted-foreground">Company:</span>
                        <span className="text-sm text-foreground">{user.qboCompany || 'N/A'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-muted-foreground">Last Sync:</span>
                        <span className="text-sm text-foreground">
                          {lastSync ? formatDate(lastSync) : '—'}
                        </span>
                      </div>

                    </>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* ACTIVITY */}
            <TabsContent value="activity" className="space-y-4">
              <Card className="dark:bg-slate-900/60 dark:border-slate-700">
                <CardHeader>
                  <CardTitle className="text-sm text-foreground">CFO Agent Usage</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Total Uses:</span>
                      <span className="text-sm font-bold text-foreground">{user.cfoAgentUses}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Last 7 days:</span>
                      <span className="text-sm text-foreground">{user.cfoUses7d || Math.floor(user.cfoAgentUses * 0.3)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Last 30 days:</span>
                      <span className="text-sm text-foreground">{user.cfoUses30d || Math.floor(user.cfoAgentUses * 0.7)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="dark:bg-slate-900/60 dark:border-slate-700">
                <CardHeader>
                  <CardTitle className="text-sm text-foreground">Login History</CardTitle>
                </CardHeader>
                <CardContent>
  <div className="space-y-2">
    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">Last Login:</span>
      <span className="text-foreground">{formatDate(user.lastLogin)}</span>
    </div>

    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">Created:</span>
      <span className="text-foreground">{formatDate(user.createdAt)}</span>
    </div>

    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">Last Activity:</span>
      <span className="text-foreground">
        {lastActivity ? formatDate(lastActivity) : '—'}
      </span>
    </div>

    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">Last Page Viewed:</span>
      <span className="text-foreground">
        {lastPage || '—'}
      </span>
    </div>

{/* NEW: IP + Location */}
<div className="flex justify-between text-sm">
  <span className="text-muted-foreground">Last IP:</span>
  <span className="text-foreground">
    {effectiveIp || '—'}
  </span>
</div>

<div className="flex justify-between text-sm">
  <span className="text-muted-foreground">Location:</span>
  <span className="text-foreground text-right">
    {!effectiveIp && ipStatus === 'idle' && '—'}
    {effectiveIp && ipStatus === 'loading' && 'Looking up…'}
    {effectiveIp && ipStatus === 'error' && 'Unknown'}
    {effectiveIp && ipStatus === 'success' && location && (
      <>
        {location.city && `${location.city}, `}
        {location.region && `${location.region}, `}
        {location.country}
      </>
    )}
  </span>
</div>
<div className="flex justify-between text-sm">
  <span className="text-muted-foreground">App/Device:</span>
  <span
    className="text-foreground text-right truncate max-w-[260px]"
    title={lastUserAgent || ''}
  >
    {lastUserAgent || '—'}
  </span>
</div>
  </div>
</CardContent>


              </Card>
            </TabsContent>

            {/* BILLING */}
            <TabsContent value="billing" className="space-y-4">
              <Card className="dark:bg-slate-900/60 dark:border-slate-700">
                <CardHeader>
                  <CardTitle className="text-sm text-foreground">Plan & Billing</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Plan:</span>
                    <div className="min-w-[12rem]">
                      <Select value={planDraft} onValueChange={(v) => setPlanDraft(v as PlanDraft)}>
                        <SelectTrigger className="h-8 dark:bg-slate-900/60 dark:border-slate-700">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="dark:bg-slate-900/90 dark:border-slate-700">
                          <SelectItem value="No Subscription">No Subscription</SelectItem>
                          <SelectItem value="Iron">Iron</SelectItem>
                          <SelectItem value="Gold">Gold</SelectItem>
                          <SelectItem value="Platinum">Platinum</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Status:</span>
                    <Badge variant={user.billingStatus === 'active' ? 'default' : 'destructive'}>
                      {user.billingStatus || 'Active'}
                    </Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">MRR:</span>
                    <span className="text-sm font-medium text-foreground">${user.mrr || '99'}</span>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ACTIONS */}
            <TabsContent value="actions" className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Button size="sm" variant="outline" className="justify-start dark:bg-slate-900/60 dark:border-slate-700">
                  <Shield className="w-4 h-4 mr-2" />
                  Impersonate
                </Button>
                <Button size="sm" variant="outline" className="justify-start dark:bg-slate-900/60 dark:border-slate-700">
                  <Key className="w-4 h-4 mr-2" />
                  Reset Password
                </Button>
                <Button size="sm" variant="outline" className="justify-start dark:bg-slate-900/60 dark:border-slate-700">
                  <Mail className="w-4 h-4 mr-2" />
                  Resend Invite
                </Button>
                <Button size="sm" variant="outline" className="justify-start dark:bg-slate-900/60 dark:border-slate-700">
                  <Link className="w-4 h-4 mr-2" />
                  Relink QBO
                </Button>
                <Button size="sm" variant="outline" className="justify-start dark:bg-slate-900/60 dark:border-slate-700">
                  <UserX className="w-4 h-4 mr-2" />
                  Suspend User
                </Button>
                <Button size="sm" variant="outline" className="justify-start dark:bg-slate-900/60 dark:border-slate-700">
                  <CreditCard className="w-4 h-4 mr-2" />
                  Grant Credit
                </Button>
              </div>
            </TabsContent>

            {/* FINANCIALS (admin-only) */}
            <TabsContent value="financials" className="space-y-4">
              {!viewerIsAdmin ? (
                <Card className="dark:bg-slate-900/60 dark:border-slate-700">
                  <CardContent className="text-sm text-muted-foreground">
                    Only admins can view Financials.
                  </CardContent>
                </Card>
              ) : !resolvedRealmId ? (
                <Card className="dark:bg-slate-900/60 dark:border-slate-700">
                  <CardContent className="text-sm text-muted-foreground">
                    This user does not have a connected QuickBooks realm.
                  </CardContent>
                </Card>
              ) : (
                <Card className="dark:bg-slate-900/60 dark:border-slate-700">
                  <CardHeader>
                    <CardTitle className="text-sm text-foreground">Financials (Realm: {resolvedRealmId})</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {loadingArtifacts ? (
                      <div className="text-sm text-muted-foreground">Loading…</div>
                    ) : (
                      <>
                        {/* monthly cards */}
                        <div className="grid grid-cols-1 gap-3">
                          {months.map(({ y, m, key, label }) => {
                            const row = artifacts[key];
                            const busy = !!savingByMonth[key];
                            const signedUrl = signedLinks[key];

                            return (
                              <div
                                key={key}
                                className="rounded-xl border p-4 shadow-sm hover:shadow-md transition-colors
                                           bg-muted/30 dark:bg-slate-900/60 dark:border-slate-700"
                              >
                                {/* Row 1 — Month & Year */}
                                <div className="flex items-center justify-between">
                                  <div className="text-sm font-semibold text-foreground">{label}</div>
                                  <div className="flex items-center gap-2">
                                    <span className={`text-xs px-2 py-0.5 rounded-full border ${
                                      row?.pdf_path
                                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800'
                                        : 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700'
                                    }`}>
                                      PDF {row?.pdf_path ? 'attached' : 'missing'}
                                    </span>
                                    <span className={`text-xs px-2 py-0.5 rounded-full border ${
                                      row?.video_added
                                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800'
                                        : 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700'
                                    }`}>
                                      Video {row?.video_added ? 'added' : 'pending'}
                                    </span>
                                  </div>
                                </div>

                                <div className="mt-3 space-y-3 divide-y divide-slate-200/60 dark:divide-slate-800">
                                  {/* Row 2 — P&L Generated + PDF controls */}
                                  <div className="pt-1 first:pt-0 flex flex-wrap items-center gap-3">
                                    <label className="inline-flex items-center gap-2 text-sm">
                                      <input
                                        type="checkbox"
                                        readOnly
                                        checked={!!row?.pnl_generated}
                                        className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-2 focus:ring-primary/30 dark:border-slate-700"
                                      />
                                      <span className="text-foreground/80">P&amp;L Generated</span>
                                    </label>

                                    <div className="flex items-center gap-2">
                                      {row?.pdf_path && signedUrl ? (
                                        <>
                                          <a
                                            className="text-sm underline text-blue-700 hover:text-blue-800 dark:text-blue-300 dark:hover:text-blue-200"
                                            href={signedUrl}
                                            target="_blank"
                                            rel="noreferrer"
                                          >
                                            View PDF
                                          </a>
                                          <Button size="sm" variant="outline" disabled={busy}
                                            onClick={() => handleDelete(y, m)}
                                            className="dark:bg-slate-900/60 dark:border-slate-700"
                                          >
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
                                            className="dark:bg-slate-900/60 dark:border-slate-700"
                                          >
                                            {busy ? 'Uploading…' : 'Upload PDF'}
                                          </Button>
                                        </>
                                      )}
                                    </div>
                                  </div>

                                  {/* Row 3 — Video Added + URL input */}
                                  <div className="pt-3 flex flex-col gap-2">
                                    <label className="inline-flex items-center gap-2 text-sm">
                                      <input
                                        type="checkbox"
                                        readOnly
                                        checked={!!row?.video_added}
                                        className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-2 focus:ring-primary/30 dark:border-slate-700"
                                      />
                                      <span className="text-foreground/80">Video Added</span>
                                    </label>

                                    <Input
                                      value={videoDrafts[key] ?? ''}
                                      onChange={(e) => setVideoDrafts(prev => ({ ...prev, [key]: e.target.value }))}
                                      placeholder="https://video-url…"
                                      className="h-9 w-full dark:bg-slate-900/60 dark:border-slate-700 placeholder:text-muted-foreground"
                                      disabled={busy}
                                    />
                                  </div>

                                  {/* Row 4 — Save button */}
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
                      </>
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
