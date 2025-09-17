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
type PlanDraft = 'Starter' | 'Professional' | 'Basic';

type Baseline = {
  name: string;
  role: RoleDraft;
  status: StatusDraft;
  plan: PlanDraft;
  company: string;
};

const UserDetailDrawer: React.FC<UserDetailDrawerProps> = ({ user, isOpen, onClose, onSaved }) => {
  if (!user) return null;

  // ----- initial values from props (safe fallbacks) -----
  const initialName = useMemo(() => (user.fullName === '—' ? '' : (user.fullName ?? '')), [user?.id]);
  const initialRoleTitle: RoleDraft = (user.role === 'Admin' || user.role === 'User') ? user.role : 'User';
  const initialStatus: StatusDraft = user.isActive ? 'Active' : 'Suspended';
  const initialPlan: PlanDraft = (['Starter', 'Professional', 'Basic'].includes(user.plan) ? user.plan : 'Starter') as PlanDraft;
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
            plan: (['Starter', 'Professional', 'Basic'].includes(data.plan) ? data.plan : 'Starter') as PlanDraft,
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
    if (planDraft !== baseline.plan) updates.plan = planDraft; // 'Starter' | 'Professional' | 'Basic'
    if ((companyDraft ?? '').trim() !== (baseline.company ?? '').trim()) updates.company = companyDraft.trim();

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', user.id)
        .select('id')
        .maybeSingle(); // avoids 406 "JSON object requested..." edge cases

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
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="activity">Activity</TabsTrigger>
              <TabsTrigger value="billing">Billing</TabsTrigger>
              <TabsTrigger value="actions">Actions</TabsTrigger>
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
                          <SelectItem value="Starter">Starter</SelectItem>
                          <SelectItem value="Professional">Professional</SelectItem>
                          <SelectItem value="Basic">Basic</SelectItem>
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
          </Tabs>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default UserDetailDrawer;
