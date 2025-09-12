// src/components/Dashboard.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import MetricCard from './MetricCard';
import ExpenseCategories from './ExpenseCategories';
import { QuickPulse } from './QuickPulse';
import { DollarSign, CreditCard, TrendingUp, Download, Calendar } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/lib/supabase';
import { useAppContext } from '@/contexts/AppContext';

type UiTimeframe = 'thisMonth' | 'lastMonth' | 'ytd';
type ApiPeriod = 'this_month' | 'last_month' | 'ytd';

interface ApiNumberPair {
  current?: number | string | null;
  previous?: number | string | null;
}

interface QboDashboardPayload {
  period?: ApiPeriod;
  revenue?: ApiNumberPair;
  expenses?: ApiNumberPair;
  netProfit?: ApiNumberPair;
  ytdSeries?: Array<{ name: string; revenue: number; expenses: number }>;
  lastSyncAt?: string;
  companyName?: string; // <-- already present
}
// Must match Intuit app settings and what you used to start OAuth
const QBO_REDIRECT_URI = 'https://ironbooks.netlify.app/?connected=qbo';

const fallbackChartData = [
  { name: 'Jan', revenue: 0, expenses: 0 },
  { name: 'Feb', revenue: 0, expenses: 0 },
  { name: 'Mar', revenue: 0, expenses: 0 },
  { name: 'Apr', revenue: 0, expenses: 0 },
  { name: 'May', revenue: 0, expenses: 0 },
  { name: 'Jun', revenue: 0, expenses: 0 },
  { name: 'Jul', revenue: 0, expenses: 0 },
];

// ---------- helpers ----------
const toNumber = (v: unknown, def = 0): number => {
  const n = typeof v === 'string' ? Number(v) : (typeof v === 'number' ? v : NaN);
  return Number.isFinite(n) ? n : def;
};

const formatCurrency0 = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

const pctChange = (curr: number, prev: number): number | null => {
  if (!Number.isFinite(curr) || !Number.isFinite(prev)) return null;
  if (prev === 0) return null;
  return ((curr - prev) / Math.abs(prev)) * 100;
};

const diffAbs = (curr: number, prev: number): number => Math.abs(curr - prev);

const toApiPeriod = (ui: UiTimeframe): ApiPeriod =>
  ui === 'thisMonth' ? 'this_month' : ui === 'lastMonth' ? 'last_month' : 'ytd';

const changeLabel = (period: UiTimeframe) =>
  period === 'ytd' ? 'from last year' : 'from last month';

// ---------- component ----------
interface DashboardProps {
  onNavigateToReports?: (filter: string, timeframe: string) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ onNavigateToReports }) => {
  console.log('src/components/AppLayout.tsx live: components/CFOAgent.tsx (QBO card build)');

  const { user, loading: userLoading } = useAppContext();
  const { toast } = useToast();

  const [timeframe, setTimeframe] = useState<UiTimeframe>('thisMonth');
  const [loading, setLoading] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState<string | null>(null); // <-- keep this
  const [realmId, setRealmId] = useState<string | null>(null);
  // server data (numbers)
  const [revCurr, setRevCurr] = useState(0);
  const [revPrev, setRevPrev] = useState(0);
  const [expCurr, setExpCurr] = useState(0);
  const [expPrev, setExpPrev] = useState(0);
  const [netCurr, setNetCurr] = useState(0);
  const [netPrev, setNetPrev] = useState(0);

  // YTD chart data (ALWAYS YTD)
  const [ytdChartData, setYtdChartData] = useState(fallbackChartData);
  const [ytdLoading, setYtdLoading] = useState(false);

  const revPct = useMemo(() => pctChange(revCurr, revPrev), [revCurr, revPrev]);
  const expPct = useMemo(() => pctChange(expCurr, expPrev), [expCurr, expPrev]);
  const netDiff = useMemo(() => diffAbs(netCurr, netPrev), [netCurr, netPrev]);
  const netUp = useMemo(() => netCurr >= netPrev, [netCurr, netPrev]);

  const insightText = useMemo(() => {
    const label = changeLabel(timeframe);
    const revStr = revPct === null ? '—' : `${revPct > 0 ? '+' : ''}${Math.abs(revPct).toFixed(1)}%`;
    const expStr = expPct === null ? '—' : `${expPct > 0 ? '+' : ''}${Math.abs(expPct).toFixed(1)}%`;
    return `Revenue ${revStr} ${label} while expenses ${expPct && expPct < 0 ? 'decreased' : 'changed'} ${expStr}`;
  }, [revPct, expPct, timeframe]);

 // Complete the connection if we stashed realmId before user.id was ready
useEffect(() => {
  if (!user?.id) return;

  const pendingRealm = sessionStorage.getItem('pending_qbo_realm');
  const pendingCode = sessionStorage.getItem('pending_qbo_code');
  const pendingRedirect = sessionStorage.getItem('pending_qbo_redirect') || QBO_REDIRECT_URI;
  if (!pendingRealm || !pendingCode) return;

  (async () => {
    // 1) Do the deferred exchange now that userId is available
    const { error: fnErr } = await supabase.functions.invoke('qbo-oauth-exchange', {
      body: { code: pendingCode, realmId: pendingRealm, redirectUri: pendingRedirect, userId: user.id },
    });
    if (fnErr) {
      console.warn('[QBO] deferred exchange failed:', fnErr.message);
      try {
        sessionStorage.removeItem('pending_qbo_realm');
        sessionStorage.removeItem('pending_qbo_code');
        sessionStorage.removeItem('pending_qbo_redirect');
      } catch {}
      return;
    }

    // 2) Persist profile flags
    const { error } = await supabase
      .from('profiles')
      .update({
        qbo_realm_id: pendingRealm,
        qbo_connected: true,
        qbo_connected_at: new Date().toISOString(),
      })
      .eq('id', user.id);

    if (error) {
      console.warn('[QBO] deferred profiles update failed:', error.message);
    } else {
      setRealmId(pendingRealm);
      await supabase.functions.invoke('qbo-sync-transactions', {
        body: { realmId: pendingRealm, userId: user.id, mode: 'full' }
      });
    }

    try {
      sessionStorage.removeItem('pending_qbo_realm');
      sessionStorage.removeItem('pending_qbo_code');
      sessionStorage.removeItem('pending_qbo_redirect');
    } catch {}
  })();
}, [user?.id]);





  // Handle Intuit OAuth redirect on /?connected=qbo&code=...&state=...&realmId=...
useEffect(() => {
  // Only run on the special callback
  const params = new URLSearchParams(window.location.search);
  if (params.get('connected') !== 'qbo') return;

  const code = params.get('code');
  const incomingRealm = params.get('realmId');
  const state = params.get('state');
  const storedState = localStorage.getItem('qbo_oauth_state');

  // clean URL + storage so the effect doesn't re-run
  const clean = () => {
    try { history.replaceState({}, '', window.location.origin + window.location.pathname); } catch {}
    try { localStorage.removeItem('qbo_oauth_state'); } catch {}
  };

  // CSRF/state check
  if (storedState && state && storedState !== state) {
    toast({ title: 'QuickBooks', description: 'Security check failed (state mismatch). Please reconnect.', variant: 'destructive' });
    clean();
    return;
  }

  (async () => {
    try {
      // 1) Exchange the auth code for tokens (server-side Edge Function)
      if (code && incomingRealm) {
        // Ensure the Supabase user is hydrated
        const { data: { user: authedUser } } = await supabase.auth.getUser();
        if (!authedUser) {
          // Stash and finish later when user is ready
          try { sessionStorage.setItem('pending_qbo_code', code); } catch {}
          try { sessionStorage.setItem('pending_qbo_realm', incomingRealm); } catch {}
          try { sessionStorage.setItem('pending_qbo_redirect', QBO_REDIRECT_URI); } catch {}
          clean();
          return;
        }

        const { error: fnErr } = await supabase.functions.invoke('qbo-oauth-exchange', {
          body: { code, realmId: incomingRealm, redirectUri: QBO_REDIRECT_URI, userId: authedUser.id },
        });
        if (fnErr) {
          console.warn('[QBO] exchange failed:', fnErr.message);
          toast({ title: 'QuickBooks', description: 'Failed to complete connection (token exchange).', variant: 'destructive' });
          clean();
          return;
        }
      }

      // 2) Persist the connection and kick off the first sync (if user is ready)
      if (incomingRealm && user?.id) {
        const { error } = await supabase
          .from('profiles')
          .update({
            qbo_realm_id: incomingRealm,
            qbo_connected: true,
            qbo_connected_at: new Date().toISOString(),
          })
          .eq('id', user.id);

        if (error) {
          console.warn('[QBO] profiles update failed:', error.message);
          toast({ title: 'QuickBooks', description: 'Failed to save connection.', variant: 'destructive' });
        } else {
          setRealmId(incomingRealm);
          toast({ title: 'QuickBooks', description: 'Connected successfully!' });
          await supabase.functions.invoke('qbo-sync-transactions', {
            body: { realmId: incomingRealm, userId: user.id, mode: 'full' }
          });
        }
      } else if (incomingRealm && !user?.id) {
        // 3) If the user session isn’t ready yet, stash and finish later
        try { sessionStorage.setItem('pending_qbo_realm', incomingRealm); } catch {}
        clean();
        return;
      }
    } finally {
      clean();
    }
  })();
  // run when auth state changes (so we can finish steps as user becomes ready)
}, [user?.id, toast]);





  // Fetch tiles for the selected timeframe (same as before)
  useEffect(() => {
    let isCancelled = false;
    const run = async () => {
      if (userLoading) return;
      setLoading(true);
      try {
        const period = toApiPeriod(timeframe);

        const { data, error } = await supabase.functions.invoke('qbo-dashboard', {
          body: { period, nonce: Date.now() },
        });

        if (error) console.error('qbo-dashboard error:', error);

        const payload: QboDashboardPayload = (data as any) ?? {};

        const rc = toNumber(payload?.revenue?.current, revCurr);
        const rp = toNumber(payload?.revenue?.previous, revPrev);
        const ec = toNumber(payload?.expenses?.current, expCurr);
        const ep = toNumber(payload?.expenses?.previous, expPrev);
        const nc = toNumber(payload?.netProfit?.current, rc - ec);
        const np = toNumber(payload?.netProfit?.previous, rp - ep);

        if (!isCancelled) {
          setRevCurr(rc);
          setRevPrev(rp);
          setExpCurr(ec);
          setExpPrev(ep);
          setNetCurr(nc);
          setNetPrev(np);
          setLastSync(payload?.lastSyncAt ?? new Date().toISOString());
          if (payload?.companyName) setCompanyName(payload.companyName); // keep existing behavior
        }
      } catch (e) {
        console.error('qbo-dashboard fetch failed:', e);
      } finally {
        if (!isCancelled) setLoading(false);
      }
    };
    run();
    return () => { isCancelled = true; };
  }, [timeframe, userLoading]);

  // Fetch YTD series for the chart ALWAYS (unchanged)
  useEffect(() => {
    let isCancelled = false;
    const loadYtd = async () => {
      if (userLoading) return;
      setYtdLoading(true);
      try {
        const { data, error } = await supabase.functions.invoke('qbo-dashboard', {
          body: { period: 'ytd', nonce: Date.now() },
        });
        if (error) console.error('qbo-dashboard (ytd series) error:', error);

        const payload: QboDashboardPayload = (data as any) ?? {};
        if (!isCancelled) {
          if (Array.isArray(payload?.ytdSeries) && payload.ytdSeries.length > 0) {
            setYtdChartData(payload.ytdSeries.map((row) => ({
              name: String(row.name),
              revenue: toNumber(row.revenue, 0),
              expenses: toNumber(row.expenses, 0),
            })));
          } else {
            setYtdChartData(fallbackChartData);
          }
          if (payload?.lastSyncAt) setLastSync(payload.lastSyncAt);
          if (payload?.companyName && !companyName) setCompanyName(payload.companyName);
        }
      } catch (e) {
        console.error('qbo-dashboard (ytd) fetch failed:', e);
        if (!isCancelled) setYtdChartData(fallbackChartData);
      } finally {
        if (!isCancelled) setYtdLoading(false);
      }
    };
    loadYtd();
    return () => { isCancelled = true; };
  }, [userLoading]);

// 1) Load realmId from profiles (once auth is ready)
useEffect(() => {
  let cancelled = false;
  const loadRealm = async () => {
    if (userLoading || !user?.id) return;
    const { data, error } = await supabase
      .from('profiles')
      .select('qbo_realm_id')
      .eq('id', user.id)
      .single();
    if (!cancelled && !error && data?.qbo_realm_id) {
      setRealmId(data.qbo_realm_id);
    }
  };
  loadRealm();
  return () => { cancelled = true; };
}, [userLoading, user?.id]);

// --- Company name: call Edge Function via supabase.functions.invoke (no CORS) ---
useEffect(() => {
  let cancelled = false;

  const run = async () => {
    if (userLoading || !realmId || companyName) return;

    try {
      const { data: s } = await supabase.auth.getSession();
      const accessToken = s?.session?.access_token;

      const { data, error } = await supabase.functions.invoke('qbo-company', {
        body: { realmId, nonce: Date.now() },
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      });

      if (error) {
        console.warn('qbo-company invoke error:', error);
        return;
      }

      if (!cancelled && data?.companyName) {
        setCompanyName(data.companyName);
      }
    } catch (e) {
      console.warn('qbo-company invoke exception:', e);
    }
  };

  run();
  return () => { cancelled = true; };
}, [userLoading, realmId, companyName]);




// NEW: Ask the tiny function for the company name (does nothing else).

/*
useEffect(() => {
  let cancelled = false;
  const run = async () => {
    // wait until auth state is ready and we actually have a session
    if (userLoading || !user) return;

    try {
      const { data: s } = await supabase.auth.getSession();
      const accessToken = s?.session?.access_token;

      const { data, error } = await supabase.functions.invoke('qbo-company', {
        body: { nonce: Date.now() },
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      });

      if (!error && data?.companyName && !cancelled) {
        setCompanyName(data.companyName);
      }
    } catch (e) {
      console.warn('qbo-company error:', e);
    }
  };

  // only fetch if we don't already have it
  if (!companyName) run();
  return () => { cancelled = true; };
}, [userLoading, user, companyName]);

*/

  const handleCardClick = (reportType: string) => {
    if (onNavigateToReports) {
      const urlParams = new URLSearchParams(window.location.search);
      urlParams.set('source', 'dashboard');
      const newUrl = `${window.location.pathname}?${urlParams.toString()}`;
      window.history.pushState({}, '', newUrl);
      onNavigateToReports(reportType, timeframe);
    }
  };

  const handleExportSnapshot = () => {
    console.log('Export dashboard snapshot as PDF');
  };

  const revenueValueStr = formatCurrency0(revCurr);
  const expensesValueStr = formatCurrency0(expCurr);
  const netValueStr = formatCurrency0(netCurr);

  const revChangeStr =
    revPct === null ? `— ${changeLabel(timeframe)}` : `${revPct > 0 ? '+' : ''}${Math.abs(revPct).toFixed(1)}% ${changeLabel(timeframe)}`;
  const expChangeStr =
    expPct === null ? `— ${changeLabel(timeframe)}` : `${expPct > 0 ? '+' : ''}${Math.abs(expPct).toFixed(1)}% ${changeLabel(timeframe)}`;
  const netChangeStr = `${netUp ? '+' : '-'}${formatCurrency0(netDiff)} vs ${timeframe === 'ytd' ? 'last year' : 'last month'}`;

  return (
    <div className="space-y-8 p-6">
      {/* Company name centered above the header */}
      <div className="flex justify-center">
        <h2 className="text-lg md:text-xl font-semibold text-gray-900 dark:text-white truncate max-w-[90%] text-center">
          {companyName || '—'}
        </h2>
      </div>

      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">Quick Pulse</h1>
          <p className="text-gray-600 dark:text-gray-400">Your business health at a glance</p>
        </div>
        <div className="flex items-center space-x-4">
          <Select value={timeframe} onValueChange={(v: UiTimeframe) => setTimeframe(v)}>
            <SelectTrigger className="w-40" disabled={loading}>
              <Calendar className="w-4 h-4 mr-2" />
              <SelectValue placeholder="Select period" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="thisMonth">This Month</SelectItem>
              <SelectItem value="lastMonth">Last Month</SelectItem>
              <SelectItem value="ytd">YTD</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={handleExportSnapshot} variant="outline" size="sm" disabled={loading || ytdLoading}>
            <Download className="w-4 h-4 mr-2" />
            Export Snapshot
          </Button>
          <div className="bg-white dark:bg-gray-800 px-4 py-2 rounded-lg border-2 shadow-sm">
            <div className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Last QBO Sync:{' '}
              <span className="text-blue-600 dark:text-blue-400 font-semibold">
                {lastSync ? new Date(lastSync).toLocaleDateString() + ' at ' + new Date(lastSync).toLocaleTimeString() : '—'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Insight Banner */}
      <div className="bg-gradient-to-r from-primary/10 to-primary/5 dark:from-primary/20 dark:to-primary/10 p-4 rounded-lg border border-primary/20">
        <p className="text-primary font-medium">💡 {insightText}</p>
      </div>
      
      <div className="grid gap-6 md:grid-cols-3">
        <MetricCard
          title="Revenue"
          value={revenueValueStr}
          change={revChangeStr}
          icon={DollarSign}
          trend={revPct !== null && revPct < 0 ? 'down' : 'up'}
          onClick={() => handleCardClick('revenue')}
        />
        <MetricCard
          title="Expenses"
          value={expensesValueStr}
          change={expChangeStr}
          icon={CreditCard}
          trend={expPct !== null && expPct > 0 ? 'up' : 'down'}
          onClick={() => handleCardClick('expenses')}
        />
        <MetricCard
          title="Net Profit"
          value={netValueStr}
          change={netChangeStr}
          icon={TrendingUp}
          trend={netUp ? 'up' : 'down'}
          margin={revCurr > 0 ? `${((netCurr / revCurr) * 100).toFixed(1)}%` : undefined}
          onClick={() => handleCardClick('profit-loss')}
        />
      </div>

      <QuickPulse
        period={timeframe === 'thisMonth' ? 'this_month' : timeframe === 'lastMonth' ? 'last_month' : 'ytd'}
        metrics={{
          revenue_mtd: revCurr,
          expenses_mtd: expCurr,
          net_margin_pct: revCurr > 0 ? (netCurr / revCurr) * 100 : 0,
          revenue_change: revPct ?? 0,
          expense_change: expPct ?? 0,
          margin_change: 0,
        }}
      />

      <Card className="border-2 shadow-lg dark:border-gray-700">
        <CardHeader>
          <div className="bg-success/10 dark:bg-success/20 p-3 rounded-lg mb-4 border border-success/20">
            <p className="text-sm text-success font-medium">
              Revenue trend {timeframe === 'ytd' ? 'YTD' : 'recent'}: {revPct === null ? '—' : `${(revPct > 0 ? '+' : '')}${Math.abs(revPct).toFixed(1)}%`} {changeLabel(timeframe)}
            </p>
          </div>
          <CardTitle className="text-xl font-bold text-gray-900 dark:text-white">
            Revenue vs Expenses (YTD)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={350}>
            <LineChart data={ytdChartData && ytdChartData.length ? ytdChartData : fallbackChartData}>
              <XAxis dataKey="name" stroke="#6b7280" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis
                stroke="#6b7280"
                fontSize={12}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value) => `$${(value as number) / 1000}k`}
              />
              <Tooltip
                formatter={(value: number) => [`$${(value ?? 0).toLocaleString()}`, '']}
                labelStyle={{ color: '#374151' }}
                contentStyle={{
                  backgroundColor: 'white',
                  border: '2px solid #e5e7eb',
                  borderRadius: '8px',
                  boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                }}
              />
              <Legend />
              <Line type="monotone" dataKey="revenue" stroke="#3b82f6" strokeWidth={3} dot={{ fill: '#3b82f6', strokeWidth: 2, r: 4 }} name="Revenue" />
              <Line type="monotone" dataKey="expenses" stroke="#ef4444" strokeWidth={3} dot={{ fill: '#ef4444', strokeWidth: 2, r: 4 }} name="Expenses" />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <ExpenseCategories timeframe={timeframe === 'thisMonth' ? 'This Month' : timeframe === 'lastMonth' ? 'Last Month' : 'YTD'} />
    </div>
  );
};

export default Dashboard;
