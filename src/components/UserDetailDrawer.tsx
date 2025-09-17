import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  User, Shield, Building, Calendar, Activity, 
  Link, Key, Mail, UserX, CreditCard
} from 'lucide-react';

interface UserDetailDrawerProps {
  user: any;
  isOpen: boolean;
  onClose: () => void;
  /** optional: parent can refresh grid after save */
  onSaved?: () => void;
}

const UserDetailDrawer: React.FC<UserDetailDrawerProps> = ({
  user,
  isOpen,
  onClose,
  onSaved
}) => {
  if (!user) return null;

  // ----- role editing state -----
  const initialTitleCase = (user.role === 'Admin' || user.role === 'User') ? user.role : 'User';
  const [roleDraft, setRoleDraft] = useState<'Admin' | 'User'>(initialTitleCase);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const titleCase = (user.role === 'Admin' || user.role === 'User') ? user.role : 'User';
    setRoleDraft(titleCase);
  }, [user?.id]); // re-init when a different user is opened

  const isDirty = roleDraft.toLowerCase() !== (user.role || 'User').toLowerCase();

  const handleCancel = () => onClose();

const handleSave = async () => {
  setIsSaving(true);
  try {
    const dbRole = roleDraft.toLowerCase(); // 'admin' | 'user'
    console.debug('[UserDetailDrawer] saving role', { userId: user.id, dbRole });

    // IMPORTANT: do NOT call .single() or .select() here to avoid 406s under RLS
    const { error } = await supabase
      .from('profiles')
      .update({ role: dbRole })
      .eq('id', user.id);

    if (error) {
      console.error('[UserDetailDrawer] save role failed:', error);
      alert(error.message || 'Failed to save changes.');
      return;
    }

    // tell parent to refetch via admin_list(), then close the drawer
    onSaved?.();
    onClose();
  } finally {
    setIsSaving(false);
  }
};



  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  };

  return (
    <Sheet open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>

      <SheetContent className="w-[600px] sm:max-w-[600px] overflow-y-auto">
        <SheetHeader>
          <div className="flex items-center justify-between">
            <SheetTitle className="flex items-center space-x-2">
              <User className="w-5 h-5" />
              <span>{user.fullName}</span>
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

            <TabsContent value="overview" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Profile</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Email:</span>
                    <span className="text-sm font-medium">{user.email}</span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Status:</span>
                    <Badge variant={user.isActive ? "default" : "secondary"}>
                      {user.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>

                  {/* Role editor (dropdown) */}
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Role:</span>
                    <div className="min-w-[8rem]">
                      <Select value={roleDraft} onValueChange={(v) => setRoleDraft(v as 'Admin' | 'User')}>
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

                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Organization:</span>
                    <span className="text-sm">{user.organization || 'N/A'}</span>
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

            <TabsContent value="billing" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Plan & Billing</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Plan:</span>
                    <Badge>{user.plan || 'Professional'}</Badge>
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
