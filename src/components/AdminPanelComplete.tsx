import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import UserDetailsModal from './UserDetailsModal';
import AddUserModal from './AddUserModal';
import BulkActionsToolbar from './BulkActionsToolbar';
import FilterChips from './FilterChips';
import UserDetailDrawer from './UserDetailDrawer';
import AdminKPICards from './AdminKPICards';
import { 
  Users, Plus, Search, Eye, Key, CheckCircle, XCircle, Activity, ArrowUpDown
} from 'lucide-react';

const AdminPanelComplete: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [showAddUser, setShowAddUser] = useState(false);
  const [showUserDetails, setShowUserDetails] = useState(false);
  const [showUserDrawer, setShowUserDrawer] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [activeFilters, setActiveFilters] = useState<string[]>([]);
  const [timeframe, setTimeframe] = useState('This Month');
  const [sortConfig, setSortConfig] = useState({ key: '', direction: 'asc' });
  const [users, setUsers] = useState<any[]>([]);

  // NEW: track my user id so we can refresh after save
  const [myUid, setMyUid] = useState<string | null>(null);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const getMarginBadge = (margin: number) => {
    if (margin >= 10) {
      return <Badge className="bg-green-500 text-white">{margin.toFixed(1)}%</Badge>;
    } else if (margin >= 0) {
      return <Badge className="bg-amber-500 text-white">{margin.toFixed(1)}%</Badge>;
    } else {
      return <Badge className="bg-red-500 text-white">{margin.toFixed(1)}%</Badge>;
    }
  };

  const handleSort = (key: string) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const handleViewUser = (user: any) => {
    setSelectedUser(user);
    setShowUserDrawer(true);
  };

  const handleSelectUser = (userId: string, checked: boolean) => {
    if (checked) {
      setSelectedUsers(prev => [...prev, userId]);
    } else {
      setSelectedUsers(prev => prev.filter(id => id !== userId));
    }
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedUsers(sortedAndFilteredUsers.map(user => user.id));
    } else {
      setSelectedUsers([]);
    }
  };

  const handleFilterToggle = (filter: string) => {
    setActiveFilters(prev => 
      prev.includes(filter) 
        ? prev.filter(f => f !== filter)
        : [...prev, filter]
    );
  };

  const sortedAndFilteredUsers = [...users]
    .filter(user => {
      const matchesSearch = user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           user.fullName.toLowerCase().includes(searchTerm.toLowerCase());
      
      if (!matchesSearch) return false;
      
      if (activeFilters.length === 0) return true;
      
      return activeFilters.some(filter => {
        switch (filter) {
          case 'active': return user.isActive && !user.suspended;
          case 'suspended': return user.suspended;
          case 'neverLoggedIn': return user.neverLoggedIn;
          case 'noQBO': return !user.qboConnected;
          case 'highUsage': return user.cfoAgentUses > 30;
          case 'trial': return user.trial;
          case 'pastDue': return user.pastDue;
          default: return false;
        }
      });
    })
    .sort((a, b) => {
      if (!sortConfig.key) return 0;
      
      const aValue = a[sortConfig.key as keyof typeof a];
      const bValue = b[sortConfig.key as keyof typeof b];
      
      if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });

  const stats = {
    totalUsers: users.length,
    activeUsers: users.filter(u => u.isActive && !u.suspended).length,
    trialsExpiring: users.filter(u => u.trial).length,
    noQBO: users.filter(u => !u.qboConnected).length,
    errors24h: 3,
    usersDelta7d: 5,
    activeDelta7d: 2
  };

  const counts = {
    active: users.filter(u => u.isActive && !u.suspended).length,
    suspended: users.filter(u => u.suspended).length,
    neverLoggedIn: users.filter(u => u.neverLoggedIn).length,
    noQBO: users.filter(u => !u.qboConnected).length,
    highUsage: users.filter(u => u.cfoAgentUses > 30).length,
    trial: users.filter(u => u.trial).length,
    pastDue: users.filter(u => u.pastDue).length
  };

  const fetchAdmin = async (uid: string) => {
    try {
      const { data, error } = await supabase.rpc('admin_list', { p_caller: uid });
      if (error) {
        console.error('[admin_list error]', error.message, error.details, error.hint, error.code);
        setUsers([]);
        return;
      }

      const mapped = (data ?? []).map((r: any) => {
        const lastLogin = r.last_login;
        const isActive = !!r.is_active;
        return {
          id: r.id,
          email: r.email,
          fullName: r.full_name || '—',
          role: r.role === 'admin' ? 'Admin' : 'User',
          plan: r.plan || 'Starter',
          isActive,
          suspended: !isActive,
          neverLoggedIn: !lastLogin,
          trial: false,
          pastDue: false,
          qboConnected: !!r.qbo_connected,
          cfoAgentUses: Number(r.cfo_uses) || 0,
          aiTokens: Number(r.ai_tokens) || 0,
          organization: '—',
          billingStatus: 'active',
          mrr: 0,
          createdAt: r.created_at,
          lastLogin,
          revenueMTD: Number(r.revenue_mtd) || 0,
          netProfitMTD: Number(r.net_profit_mtd) || 0,
          netMargin: Number(r.net_margin_pct) || 0,
        };
      });

      setUsers(mapped);
    } catch (e) {
      console.error('[AdminPanelComplete] admin_list fetch failed:', e);
      setUsers([]);
    }
  };

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const { data: { user } } = await supabase.auth.getUser();

      if (user && !cancelled) {
        setMyUid(user.id);           // ← NEW: remember my uid
        await fetchAdmin(user.id);
        return;
      }

      // If user not ready yet, wait for auth
      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        if (!cancelled && session?.user) {
          setMyUid(session.user.id); // ← NEW: remember my uid
          fetchAdmin(session.user.id);
        }
      });

      // cleanup
      return () => subscription.unsubscribe();
    };

    const cleanupPromise = run();

    return () => {
      cancelled = true;
      Promise.resolve(cleanupPromise).then((fn: any) => typeof fn === 'function' && fn());
    };
  }, []);

  return (
    <div
      className="space-y-6 p-6 pb-28 h-[100dvh] overflow-y-auto"
      style={{ WebkitOverflowScrolling: 'touch' }}
    >
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Admin Panel</h1>
          <p className="text-gray-600">Manage users and system settings</p>
        </div>
        <Button onClick={() => setShowAddUser(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add User
        </Button>
      </div>

      <AdminKPICards stats={stats} onCardClick={handleFilterToggle} />
      <div className="space-y-4">
        {/* Timeframe Selector */}
        <div className="flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <label className="text-sm font-medium">Timeframe:</label>
            <Select value={timeframe} onValueChange={setTimeframe}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="This Month">This Month</SelectItem>
                <SelectItem value="Last Month">Last Month</SelectItem>
                <SelectItem value="YTD">YTD</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex space-x-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                placeholder="Search users..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
        </div>

        <FilterChips 
          activeFilters={activeFilters}
          onFilterToggle={handleFilterToggle}
          onClearAll={() => setActiveFilters([])}
          counts={counts}
        />

        <BulkActionsToolbar
          selectedCount={selectedUsers.length}
          onResendInvite={() => console.log('Resend invite')}
          onForcePasswordReset={() => console.log('Force password reset')}
          onSuspend={() => console.log('Suspend users')}
          onUnsuspend={() => console.log('Unsuspend users')}
          onExportCSV={() => console.log('Export CSV')}
          onClear={() => setSelectedUsers([])}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Users ({sortedAndFilteredUsers.length})</span>
            <Checkbox
              checked={selectedUsers.length === sortedAndFilteredUsers.length && sortedAndFilteredUsers.length > 0}
              onCheckedChange={handleSelectAll}
            />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-2 w-8"></th>
                  <th className="text-left p-2">User</th>
                  <th className="text-left p-2">Role</th>
                  <th className="text-left p-2">Status</th>
                  <th className="text-left p-2">Last Login</th>
                  <th className="text-left p-2">QBO</th>
                  <th className="text-left p-2">CFO Uses</th>
                  <th className="text-left p-2">AI Tokens</th>  
                  <th className="text-left p-2">Plan</th>
                  <th className="text-right p-2 cursor-pointer hover:bg-gray-50" onClick={() => handleSort('revenueMTD')}>
                    <div className="flex items-center justify-end">
                      Revenue (MTD) <ArrowUpDown className="ml-1 h-3 w-3" />
                    </div>
                  </th>
                  <th className="text-right p-2 cursor-pointer hover:bg-gray-50" onClick={() => handleSort('netProfitMTD')}>
                    <div className="flex items-center justify-end">
                      Net Profit (MTD) <ArrowUpDown className="ml-1 h-3 w-3" />
                    </div>
                  </th>
                  <th className="text-center p-2 cursor-pointer hover:bg-gray-50" onClick={() => handleSort('netMargin')}>
                    <div className="flex items-center justify-center">
                      Net Margin (%) <ArrowUpDown className="ml-1 h-3 w-3" />
                    </div>
                  </th>
                  <th className="text-left p-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedAndFilteredUsers.map((user) => (
                  <tr 
                    key={user.id} 
                    className="border-b hover:bg-gray-50 cursor-pointer"
                    onClick={() => handleViewUser(user)}
                  >
                    <td className="p-2" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selectedUsers.includes(user.id)}
                        onCheckedChange={(checked) => handleSelectUser(user.id, checked as boolean)}
                      />
                    </td>
                    <td className="p-2">
                      <div>
                        <p className="font-medium">{user.fullName}</p>
                        <p className="text-sm text-gray-600">{user.email}</p>
                      </div>
                    </td>
                    <td className="p-2">
                      <Badge variant="outline">{user.role}</Badge>
                    </td>
                    <td className="p-2">
                      <Badge variant={user.isActive && !user.suspended ? "default" : "secondary"}>
                        {user.suspended ? 'Suspended' : user.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </td>
                    <td className="p-2 text-sm">{new Date(user.lastLogin).toLocaleDateString()}</td>
                    <td className="p-2">
                      <Badge variant={user.qboConnected ? "default" : "outline"}>
                        {user.qboConnected ? 'Connected' : 'Not Connected'}
                      </Badge>
                    </td>
                    <td className="p-2 font-medium">{user.cfoAgentUses}</td>
                    <td className="p-2 font-medium">{(user.aiTokens ?? 0).toLocaleString()}</td>
                    <td className="p-2">
                      <Badge>{user.plan}</Badge>
                    </td>
                    <td className="p-2 text-right font-bold">
                      {user.revenueMTD ? formatCurrency(user.revenueMTD) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="p-2 text-right font-bold">
                      {user.netProfitMTD !== undefined ? (
                        <span className={user.netProfitMTD < 0 ? 'text-red-500' : ''}>
                          {formatCurrency(user.netProfitMTD)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="p-2 text-center">
                      {user.netMargin !== undefined ? getMarginBadge(user.netMargin) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="p-2" onClick={(e) => e.stopPropagation()}>
                      <div className="flex space-x-2">
                        <Button size="sm" variant="outline">
                          <Key className="h-3 w-3" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <UserDetailsModal
        user={selectedUser}
        isOpen={showUserDetails}
        onClose={() => {
          setShowUserDetails(false);
          setSelectedUser(null);
        }}
      />

      {/* Drawer: now with onSaved to refresh + close */}
<UserDetailDrawer
  user={selectedUser}
  isOpen={showUserDrawer}
  onClose={() => {
    setShowUserDrawer(false);
    setSelectedUser(null);
  }}
onSaved={async () => {
  if (myUid) await fetchAdmin(myUid);  // reuse the uid we already have
}}

/>



      <AddUserModal
        isOpen={showAddUser}
        onClose={() => setShowAddUser(false)}
        onAddUser={(userData) => setUsers(prev => [...prev, userData])}
      />
    </div>
  );
};

export default AdminPanelComplete;
