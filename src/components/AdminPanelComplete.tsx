// src/components/AdminPanelComplete.tsx
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
  const [timeframe, setTimeframe] = useState('Last Month');
  const [fromDate, setFromDate] = useState<string>('');  // NEW
  const [toDate, setToDate] = useState<string>('');      // NEW
  const [sortConfig, setSortConfig] = useState({ key: '', direction: 'asc' as 'asc' | 'desc' });
  const [users, setUsers] = useState<any[]>([]);
  const [baseUsers, setBaseUsers] = useState<any[]>([]);
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
      return <Badge className="bg-emerald-600 text-white hover:bg-emerald-700">{margin.toFixed(1)}%</Badge>;
    } else if (margin >= 0) {
      return <Badge className="bg-amber-500 text-white hover:bg-amber-600">{margin.toFixed(1)}%</Badge>;
    } else {
      return <Badge className="bg-red-500 text-white hover:bg-red-600">{margin.toFixed(1)}%</Badge>;
    }
  };

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
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
      const matchesSearch =
        user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
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
    console.log('[AdminPanelComplete] fetchAdmin START', { uid });
    try {
      const { data, error } = await supabase.rpc('admin_list', { p_caller: uid });
      if (error) {
        console.error('[admin_list error]', error.message, error.details, error.hint, error.code);
        setBaseUsers([]);
        return;
      }
      console.log('[admin_list OK] rows:', (data ?? []).length, 'sample:', (data && data[0]) || null);

      let mappedBase = (data ?? []).map((r: any, idx: number) => {
        const lastLogin = r.last_login;
        const isActive = !!r.is_active;

        const realmId: string | null = r.qbo_realm_id || r.realm_id || r.qboRealmId || null;

        const mappedRow = {
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
          realmId,
        };

        console.log('[admin_list -> baseUser]', idx, {
          id: mappedRow.id,
          email: mappedRow.email,
          realmId: mappedRow.realmId,
          qboConnected: mappedRow.qboConnected,
        });

        return mappedRow;
      });

      const userIds = mappedBase.map(u => u.id);
      if (userIds.length > 0) {
        const { data: profilesData, error: profilesErr } = await supabase
          .from('profiles')
          .select('id, qbo_realm_id')
          .in('id', userIds);
        if (profilesErr) {
          console.error('[profiles realms fetch ERROR]', profilesErr);
        } else {
          const realmMap: Record<string, string | null> = (profilesData || []).reduce((acc: any, p: any) => {
            acc[p.id] = p.qbo_realm_id || null;
            return acc;
          }, {});
          mappedBase = mappedBase.map(u => ({
            ...u,
            realmId: realmMap[u.id] !== undefined ? realmMap[u.id] : u.realmId,
          }));
          console.log('[profiles realms merged]', { count: Object.keys(realmMap).length });
        }
      }

      setBaseUsers(mappedBase);
      console.log('[AdminPanelComplete] fetchAdmin DONE. Base users length:', mappedBase.length);
    } catch (e) {
      console.error('[AdminPanelComplete] admin_list fetch failed:', e);
      setBaseUsers([]);
    }
  };

  const getLastMonthRange = () => {
  const today = new Date();
  let year = today.getFullYear();
  let month = today.getMonth(); // current month (0–11)

  // go to last month
  month -= 1;
  if (month < 0) {
    month = 11;
    year -= 1;
  }

  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 0); // last day of last month

  const toISO = (d: Date) => d.toISOString().slice(0, 10); // YYYY-MM-DD

  return {
    fromISO: toISO(start),
    toISO: toISO(end),
  };
};


const handleTimeframeChange = (value: string) => {
  setTimeframe(value);

  if (value === 'Custom') {
    // Default custom range = last month
    const { fromISO, toISO } = getLastMonthRange();
    setFromDate(fromISO);
    setToDate(toISO);
  } else {
    // When leaving Custom, clear date state
    setFromDate('');
    setToDate('');
  }
};


  
  
  const enrichWithPnL = async () => {
    if (baseUsers.length === 0) return;

    const today = new Date();
    let currentYear = today.getFullYear();
    let currentMonth = today.getMonth() + 1;
    console.log('[P&L params]', { currentYear, currentMonth, timeframe });

    const realmIds = Array.from(
      new Set(
        baseUsers
          .map(u => u.realmId)
          .filter((x: string | null): x is string => !!x)
      )
    );
    console.log('[P&L realmIds unique]', realmIds);

    let pnlByRealm: Record<string, { revenues: number; netIncome: number }> = {};

    if (realmIds.length > 0) {
      console.log('[P&L query] selecting from view qbo_pnl_monthly_from_postings', {
        realmIdsCount: realmIds.length, realmIdsPreview: realmIds.slice(0, 5)
      });
      {/* start */}
let query = supabase
  .from('qbo_pnl_monthly_from_postings')
  .select('realm_id, year, month, revenues, net_income')
  .in('realm_id', realmIds);

let isYTD = false;

if (timeframe === 'This Month') {
  query = query.eq('year', currentYear).eq('month', currentMonth);
} else if (timeframe === 'Last Month') {
  let lastMonth = currentMonth - 1;
  let lastYear = currentYear;
  if (lastMonth === 0) {
    lastMonth = 12;
    lastYear--;
  }
  query = query.eq('year', lastYear).eq('month', lastMonth);
} else if (timeframe === 'YTD') {
  query = query.eq('year', currentYear).gte('month', 1).lte('month', currentMonth);
  isYTD = true;
} else if (timeframe === 'This Quarter') {
  const currentQuarter = Math.floor((currentMonth - 1) / 3) + 1;
  const startMonth = (currentQuarter - 1) * 3 + 1;
  const endMonth = startMonth + 2;
  query = query
    .eq('year', currentYear)
    .gte('month', startMonth)
    .lte('month', endMonth);
} else if (timeframe === 'Last Quarter') {
  let currentQuarter = Math.floor((currentMonth - 1) / 3) + 1;
  let lastQuarter = currentQuarter - 1;
  let yearForLastQuarter = currentYear;

  if (lastQuarter === 0) {
    lastQuarter = 4;
    yearForLastQuarter--;
  }

  const startMonth = (lastQuarter - 1) * 3 + 1;
  const endMonth = startMonth + 2;

  query = query
    .eq('year', yearForLastQuarter)
    .gte('month', startMonth)
    .lte('month', endMonth);
} else if (timeframe === 'Custom') {
  if (!fromDate || !toDate) {
    console.warn('[P&L custom] from/to not set, skipping query', { fromDate, toDate });
  } else {
    let fromD = new Date(fromDate);
    let toD = new Date(toDate);

    if (!isNaN(fromD.getTime()) && !isNaN(toD.getTime())) {
      // Ensure fromD <= toD
      if (fromD > toD) {
        const tmp = fromD;
        fromD = toD;
        toD = tmp;
      }

      const pairs: { year: number; month: number }[] = [];
      const cursor = new Date(fromD.getFullYear(), fromD.getMonth(), 1);
      const end = new Date(toD.getFullYear(), toD.getMonth(), 1);

      while (cursor <= end) {
        pairs.push({ year: cursor.getFullYear(), month: cursor.getMonth() + 1 });
        cursor.setMonth(cursor.getMonth() + 1);
      }

      if (pairs.length > 0) {
        const orClauses = pairs
          .map(p => `and(year.eq.${p.year},month.eq.${p.month})`)
          .join(',');

        query = query.or(orClauses);
      }
    } else {
      console.warn('[P&L custom] invalid date range', { fromDate, toDate });
    }
  }
}



      {/* end */}
      const { data: pnlRows, error: pnlErr } = await query;

      if (pnlErr) {
        console.error('[P&L view fetch ERROR]', pnlErr);
      } else {
        console.log('[P&L view fetch OK] rows:', (pnlRows ?? []).length, 'sample:', (pnlRows && pnlRows[0]) || null);
        pnlByRealm = (pnlRows || []).reduce((acc: any, row: any, idx: number) => {
          if (!acc[row.realm_id]) {
            acc[row.realm_id] = { revenues: 0, netIncome: 0 };
          }
          acc[row.realm_id].revenues += Number(row.revenues) || 0;
          acc[row.realm_id].netIncome += Number(row.net_income) || 0;
          console.log('[P&L row mapped]', idx, row.realm_id, acc[row.realm_id]);
          return acc;
        }, {});
      }
    } else {
      console.warn('[P&L] No realmIds found among users. The three columns will fall back to null/0.');
    }

    const enriched = baseUsers.map((u, idx) => {
      let revenue: number | null = null;
      let profit: number | null = null;
      let marginPct: number | null = null;

      if (u.realmId) {
        const pnl = pnlByRealm[u.realmId] || { revenues: 0, netIncome: 0 };
        revenue = pnl.revenues;
        profit = pnl.netIncome;
        marginPct = revenue === 0 ? 0 : (profit / revenue) * 100;
      }

      const merged = {
        ...u,
        revenueMTD: revenue,
        netProfitMTD: profit,
        netMargin: marginPct,
      };
      console.log('[User P&L merged]', idx, {
        id: merged.id,
        email: merged.email,
        realmId: merged.realmId,
        revenueMTD: merged.revenueMTD,
        netProfitMTD: merged.netProfitMTD,
        netMarginPct: merged.netMargin,
        source: revenue !== null ? 'VIEW' : 'FALLBACK'
      });
      return merged;
    });

    setUsers(enriched);
  };

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user && !cancelled) {
        setMyUid(user.id);
        await fetchAdmin(user.id);
        return;
      }
      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        if (!cancelled && session?.user) {
          setMyUid(session.user.id);
          fetchAdmin(session.user.id);
        }
      });
      return () => subscription.unsubscribe();
    };
    const cleanupPromise = run();
    return () => {
      cancelled = true;
      Promise.resolve(cleanupPromise).then((fn: any) => typeof fn === 'function' && fn());
    };
  }, []);

  useEffect(() => {
  enrichWithPnL();
}, [timeframe, baseUsers, fromDate, toDate]);


const pnlLabel =
  timeframe === 'YTD'
    ? 'YTD'
    : timeframe === 'This Month'
    ? 'MTD'
    : timeframe === 'Last Month'
    ? 'LM'
    : timeframe === 'This Quarter'
    ? 'QTD'
    : timeframe === 'Last Quarter'
    ? 'LQ'
    : timeframe === 'Custom'
    ? 'Custom'
    : '';




  return (
    <div
      className="space-y-6 p-6 pb-28 h-[100dvh] overflow-y-auto bg-background"
      style={{ WebkitOverflowScrolling: 'touch' }}
    >
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Admin Panel</h1>
          <p className="text-muted-foreground">Manage users and system settings</p>
        </div>
      </div>

      {/* KPI cards (unchanged component) */}
      <AdminKPICards stats={stats} onCardClick={handleFilterToggle} />

      <div className="space-y-4">
        {/* Timeframe Selector */}
        <div className="flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <label className="text-sm font-medium text-foreground">Timeframe:</label>
              <Select value={timeframe} onValueChange={handleTimeframeChange}>
                <SelectTrigger className="w-40 dark:bg-slate-900/60 dark:border-slate-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="dark:bg-slate-900/90 dark:border-slate-700">
                  <SelectItem value="This Month">This Month</SelectItem>
                  <SelectItem value="Last Month">Last Month</SelectItem>
                  <SelectItem value="This Quarter">This Quarter</SelectItem>
                  <SelectItem value="Last Quarter">Last Quarter</SelectItem>
                  <SelectItem value="YTD">YTD</SelectItem>
                  <SelectItem value="Custom">Custom</SelectItem> {/* NEW */}
                </SelectContent>
              </Select>


          </div>
        </div>
        {timeframe === 'Custom' && (
          <div className="mt-3 flex items-center space-x-3">
            <div className="flex items-center space-x-2">
              <label className="text-sm text-foreground">From:</label>
              <Input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="w-40 dark:bg-slate-900/60 dark:border-slate-700"
              />
            </div>
            <div className="flex items-center space-x-2">
              <label className="text-sm text-foreground">To:</label>
              <Input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="w-40 dark:bg-slate-900/60 dark:border-slate-700"
              />
            </div>
          </div>
        )}

        {/* Search */}
        <div className="flex space-x-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="Search users..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 dark:bg-slate-900/60 dark:border-slate-700 placeholder:text-muted-foreground"
              />
            </div>
          </div>
        </div>

        {/* Filters + Bulk actions (components keep their own styling) */}
        <div className="rounded-lg border bg-muted/30 dark:bg-slate-900/60 dark:border-slate-700 p-3">
          <FilterChips
            activeFilters={activeFilters}
            onFilterToggle={handleFilterToggle}
            onClearAll={() => setActiveFilters([])}
            counts={counts}
          />
        
          <div className="mt-3">
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
        </div>
  </div>
      {/*new div*/}
      {/* Users Table */}
      <Card className="dark:bg-slate-900/60 dark:border-slate-700">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="text-foreground">Users ({sortedAndFilteredUsers.length})</span>
            <Checkbox
              checked={selectedUsers.length === sortedAndFilteredUsers.length && sortedAndFilteredUsers.length > 0}
              onCheckedChange={handleSelectAll}
            />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30 dark:bg-slate-900/40 dark:border-slate-800">
                  <th className="text-left p-2 w-8"></th>
                  <th className="text-left p-2 text-muted-foreground uppercase tracking-wide text-xs">User</th>
                  <th className="text-left p-2 text-muted-foreground uppercase tracking-wide text-xs">Role</th>
                  <th className="text-left p-2 text-muted-foreground uppercase tracking-wide text-xs">Status</th>
                  <th className="text-left p-2 text-muted-foreground uppercase tracking-wide text-xs">Last Login</th>
                  <th className="text-left p-2 text-muted-foreground uppercase tracking-wide text-xs">QBO</th>
                  <th className="text-left p-2 text-muted-foreground uppercase tracking-wide text-xs">CFO Uses</th>
                  <th className="text-left p-2 text-muted-foreground uppercase tracking-wide text-xs">AI Tokens</th>
                  <th className="text-left p-2 text-muted-foreground uppercase tracking-wide text-xs">Plan</th>
                  <th
                    className="text-right p-2 cursor-pointer hover:bg-muted/50 dark:hover:bg-slate-900/60"
                    onClick={() => handleSort('revenueMTD')}
                  >
                    <div className="flex items-center justify-end text-muted-foreground uppercase tracking-wide text-xs">
                      Revenue ({pnlLabel}) <ArrowUpDown className="ml-1 h-3 w-3" />
                    </div>
                  </th>
                  <th
                    className="text-right p-2 cursor-pointer hover:bg-muted/50 dark:hover:bg-slate-900/60"
                    onClick={() => handleSort('netProfitMTD')}
                  >
                    <div className="flex items-center justify-end text-muted-foreground uppercase tracking-wide text-xs">
                      Net Profit ({pnlLabel}) <ArrowUpDown className="ml-1 h-3 w-3" />
                    </div>
                  </th>
                  <th
                    className="text-center p-2 cursor-pointer hover:bg-muted/50 dark:hover:bg-slate-900/60"
                    onClick={() => handleSort('netMargin')}
                  >
                    <div className="flex items-center justify-center text-muted-foreground uppercase tracking-wide text-xs">
                      Net Margin ({pnlLabel}) <ArrowUpDown className="ml-1 h-3 w-3" />
                    </div>

                  </th>
                  <th className="text-left p-2 text-muted-foreground uppercase tracking-wide text-xs">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedAndFilteredUsers.map((user) => (
                  <tr
                    key={user.id}
                    className="border-b dark:border-slate-800 hover:bg-muted/40 dark:hover:bg-slate-900/40 cursor-pointer"
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
                        <p className="font-medium text-foreground">{user.fullName}</p>
                        <p className="text-xs text-muted-foreground">{user.email}</p>
                      </div>
                    </td>
                    <td className="p-2">
                      <Badge variant="outline" className="border-slate-300 text-foreground dark:border-slate-600">
                        {user.role}
                      </Badge>
                    </td>
                    <td className="p-2">
                      <Badge
                        variant={user.suspended ? "default" : (user.isActive ? "default" : "secondary")}
                        className={
                          user.suspended
                            ? "bg-red-600 text-white hover:bg-red-700"
                            : user.isActive
                            ? "bg-emerald-600 text-white hover:bg-emerald-700"
                            : "bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-100"
                        }
                      >
                        {user.suspended ? 'Suspended' : (user.isActive ? 'Active' : 'Inactive')}
                      </Badge>
                    </td>
                    <td className="p-2 text-xs text-foreground">
                      {user.lastLogin
                        ? new Date(user.lastLogin).toLocaleDateString()
                        : <span className="text-muted-foreground">Never</span>}
                    </td>
                    <td className="p-2">
                      <Badge
                        className={
                          user.qboConnected
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800"
                            : "bg-slate-100 text-slate-700 border border-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700"
                        }
                        variant="outline"
                      >
                        {user.qboConnected ? 'Connected' : 'Not Connected'}
                      </Badge>
                    </td>
                    <td className="p-2 font-medium text-foreground">{user.cfoAgentUses}</td>
                    <td className="p-2 font-medium text-foreground">{(user.aiTokens ?? 0).toLocaleString()}</td>
                    <td className="p-2">
                      <Badge className="bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-100">
                        {user.plan}
                      </Badge>
                    </td>
                    <td className="p-2 text-right font-semibold text-foreground">
                      {user.revenueMTD !== null && user.revenueMTD !== undefined
                        ? formatCurrency(user.revenueMTD)
                        : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="p-2 text-right font-semibold">
                      {user.netProfitMTD !== null && user.netProfitMTD !== undefined ? (
                        <span className={user.netProfitMTD < 0 ? 'text-red-600' : 'text-foreground'}>
                          {formatCurrency(user.netProfitMTD)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="p-2 text-center">
                      {user.netMargin !== null && user.netMargin !== undefined
                        ? getMarginBadge(user.netMargin)
                        : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="p-2" onClick={(e) => e.stopPropagation()}>
                      <div className="flex space-x-2">
                        <Button size="sm" variant="outline" className="dark:bg-slate-900/60 dark:border-slate-700">
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
      <UserDetailDrawer
        user={selectedUser}
        isOpen={showUserDrawer}
        onClose={() => {
          setShowUserDrawer(false);
          setSelectedUser(null);
        }}
        onSaved={async () => {
          if (myUid) await fetchAdmin(myUid);
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
