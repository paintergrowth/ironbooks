// src/components/DashboardNew.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';
import { TrendingDownIcon, TrendingUpIcon, Calendar, Download } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { Area, AreaChart, CartesianGrid, XAxis } from "recharts";
import { supabase, invokeWithAuthSafe } from '@/lib/supabase';
import { useAppContext } from '@/contexts/AppContext';
import { useEffectiveIdentity } from '@/lib/impersonation';
import { useAuthRefresh } from '@/hooks/useAuthRefresh';
import ExpenseCategories from './ExpenseCategories';

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
  companyName?: string;
}

const QBO_REDIRECT_URI = 'https://ironbooks.netlify.app/?connected=qbo';

// ===== DEMO DATA (Jan–Sep of current year) =====
const thisYear = new Date().getFullYear();
const currentMonthIndex = Math.min(new Date().getMonth() + 1, 9); // cap at Sep (9)
const DEMO_MONTH_SERIES: { date: string; revenue: number; expenses: number }[] = [
  { date: `${thisYear}-01-01`, revenue: 120_000, expenses:  85_000 },
  { date: `${thisYear}-02-01`, revenue: 130_000, expenses:  90_000 },
  { date: `${thisYear}-03-01`, revenue: 125_000, expenses:  92_000 },
  { date: `${thisYear}-04-01`, revenue: 140_000, expenses: 100_000 },
  { date: `${thisYear}-05-01`, revenue: 150_000, expenses: 110_000 },
  { date: `${thisYear}-06-01`, revenue: 160_000, expenses: 115_000 },
  { date: `${thisYear}-07-01`, revenue: 170_000, expenses: 120_000 },
  { date: `${thisYear}-08-01`, revenue: 165_000, expenses: 118_000 },
  { date: `${thisYear}-09-01`, revenue: 180_000, expenses: 130_000 },
].slice(0, currentMonthIndex);

// Helper to compute demo tiles based on timeframe
function demoTiles(period: ApiPeriod) {
  const monthIdx = currentMonthIndex; // 1..9
  const month = (i: number) => DEMO_MONTH_SERIES[i - 1] ?? { revenue: 0, expenses: 0 };
  const sumTo = (idx: number) => {
    const slice = DEMO_MONTH_SERIES.slice(0, Math.max(0, idx));
    const revenue = slice.reduce((a, r) => a + r.revenue, 0);
    const expenses = slice.reduce((a, r) => a + r.expenses, 0);
    return { revenue, expenses, net: revenue - expenses };
  };

  if (period === 'this_month') {
    const cur = month(monthIdx);
    const prev = month(Math.max(1, monthIdx - 1));
    return {
      revenue: { current: cur.revenue, previous: prev.revenue || 1 },
      expenses:{ current: cur.expenses, previous: prev.expenses || 1 },
      netProfit:{ current: cur.revenue - cur.expenses, previous: (prev.revenue - prev.expenses) || 1 },
    };
  }

  if (period === 'last_month') {
    const cur = month(Math.max(1, monthIdx - 1));
    const prev = month(Math.max(1, monthIdx - 2));
    return {
      revenue: { current: cur.revenue, previous: prev.revenue || 1 },
      expenses:{ current: cur.expenses, previous: prev.expenses || 1 },
      netProfit:{ current: cur.revenue - cur.expenses, previous: (prev.revenue - prev.expenses) || 1 },
    };
  }

  // ytd
  const curAgg = sumTo(monthIdx);
  // fabricate prior YTD as 90% of current (so % changes render nicely)
  const prevAgg = { revenue: Math.round(curAgg.revenue * 0.9), expenses: Math.round(curAgg.expenses * 0.9) };
  return {
    revenue: { current: curAgg.revenue, previous: prevAgg.revenue || 1 },
    expenses:{ current: curAgg.expenses, previous: prevAgg.expenses || 1 },
    netProfit:{ current: curAgg.net,     previous: (prevAgg.revenue - prevAgg.expenses) || 1 },
  };
}

// ===== Fallback chart data kept for safety =====
const fallbackChartData = [
  { date: "2024-01-01", revenue: 0, expenses: 0 },
  { date: "2024-02-01", revenue: 0, expenses: 0 },
  { date: "2024-03-01", revenue: 0, expenses: 0 },
  { date: "2024-04-01", revenue: 0, expenses: 0 },
  { date: "2024-05-01", revenue: 0, expenses: 0 },
  { date: "2024-06-01", revenue: 0, expenses: 0 },
  { date: "2024-07-01", revenue: 0, expenses: 0 },
];

// Helper functions
const toNumber = (v: unknown, def = 0): number => {
  const n = typeof v === 'string' ? Number(v) : (typeof v === 'number' ? v : NaN);
  return Number.isFinite(n) ? n : def;
};

const formatCurrency = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

const pctChange = (curr: number, prev: number): number | null => {
  if (!Number.isFinite(curr) || !Number.isFinite(prev)) return null;
  if (prev === 0) return null;
  return ((curr - prev) / Math.abs(prev)) * 100;
};

const toApiPeriod = (ui: UiTimeframe): ApiPeriod =>
  ui === 'thisMonth' ? 'this_month' : ui === 'lastMonth' ? 'last_month' : 'ytd';

const changeLabel = (period: UiTimeframe) =>
  period === 'ytd' ? 'from last year' : 'from last month';

const chartConfig = {
  revenue: {
    label: "Revenue",
    color: "hsl(var(--chart-1))",
  },
  expenses: {
    label: "Expenses",
    color: "hsl(var(--chart-2))",
  },
} satisfies ChartConfig;

interface DashboardProps {
  onNavigateToReports?: (filter: string, timeframe: string) => void;
}

/** Demo-only categories card (avoids Supabase calls in demo mode) */
const DemoExpenseCategories: React.FC<{ timeframe: ApiPeriod }> = ({ timeframe }) => {
  const monthIdx = currentMonthIndex;
  const rows = DEMO_MONTH_SERIES;
  const thisMonth = rows[monthIdx - 1]?.expenses ?? 0;
  const lastMonth = rows[monthIdx - 2]?.expenses ?? 0;
  const ytd = rows.reduce((a, r) => a + r.expenses, 0);

  const base =
    timeframe === 'this_month' ? thisMonth :
    timeframe === 'last_month' ? lastMonth : ytd;

  // Simple demo split — must sum to 100%
  const split = [
    { name: 'Materials',      pct: 0.40 },
    { name: 'Labor',          pct: 0.30 },
    { name: 'Equipment',      pct: 0.15 },
    { name: 'Subcontractors', pct: 0.10 },
    { name: 'Misc',           pct: 0.05 },
  ];

  const data = split.map(s => ({ name: s.name, amount: Math.round(base * s.pct) }));

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-bold">Expense Categories (Demo)</CardTitle>
        <CardDescription>
          Showing {timeframe === 'this_month' ? 'This Month' : timeframe === 'last_month' ? 'Last Month' : 'Year-to-Date'} demo split
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {data.map((row) => (
          <div key={row.name} className="flex items-center justify-between rounded-md border p-3">
            <span className="text-sm font-medium">{row.name}</span>
            <span className="text-sm">{formatCurrency(row.amount)}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
};

const Dashboard: React.FC<DashboardProps> = ({ onNavigateToReports }) => {
  const { user, loading: userLoading } = useAppContext();
  const { toast } = useToast();
  const isMobile = useIsMobile();

  // Keep auth fresh in the background to prevent transient 401/403 during tiles/chart loads
  useAuthRefresh();

  // 🔑 Effective identity (honors impersonation)
  const { userId: effUserId, realmId: effRealmId, isImpersonating } = useEffectiveIdentity();
  console.log('[Dashboard] effective identity', { effUserId, effRealmId, isImpersonating });
  const isDemo = !effRealmId; // ← no realm means demo account

  const [timeframe, setTimeframe] = useState<UiTimeframe>('thisMonth');
  const [chartTimeRange, setChartTimeRange] = useState("30d");
  const [loading, setLoading] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState<string | null>(null);

  // Keep a local realmId only for OAuth flows (real user). Data fetches use effRealmId.
  const [realmId, setRealmId] = useState<string | null>(null);

  // Metrics data
  const [revCurr, setRevCurr] = useState(0);
  const [revPrev, setRevPrev] = useState(0);
  const [expCurr, setExpCurr] = useState(0);
  const [expPrev, setExpPrev] = useState(0);
  const [netCurr, setNetCurr] = useState(0);
  const [netPrev, setNetPrev] = useState(0);

  // Chart data
  const [ytdChartData, setYtdChartData] = useState(fallbackChartData);
  const [ytdLoading, setYtdLoading] = useState(false);

  // Computed values
  const revPct = useMemo(() => pctChange(revCurr, revPrev), [revCurr, revPrev]);
  const expPct = useMemo(() => pctChange(expCurr, expPrev), [expCurr, expPrev]);
  const netPct = useMemo(() => pctChange(netCurr, netPrev), [netCurr, netPrev]);
  const profitMargin = useMemo(() => revCurr > 0 ? (netCurr / revCurr) * 100 : 0, [revCurr, netCurr]);

  // Mobile responsive chart time range
  React.useEffect(() => {
    if (isMobile) {
      setChartTimeRange("7d")
    }
  }, [isMobile]);

  // Handle card clicks for navigation
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

  // ===============================
  // OAuth flows (remain tied to real user account)
  // ===============================

  useEffect(() => {
    if (!user?.id) return;

    const pendingRealm = sessionStorage.getItem('pending_qbo_realm');
    const pendingCode = sessionStorage.getItem('pending_qbo_code');
    const pendingRedirect = sessionStorage.getItem('pending_qbo_redirect') || QBO_REDIRECT_URI;
    if (!pendingRealm || !pendingCode) return;

    (async () => {
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

  // Handle Intuit OAuth redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('connected') !== 'qbo') return;

    const code = params.get('code');
    const incomingRealm = params.get('realmId');
    const state = params.get('state');
    const storedState = localStorage.getItem('qbo_oauth_state');

    const clean = () => {
      try { history.replaceState({}, '', window.location.origin + window.location.pathname); } catch {}
      try { localStorage.removeItem('qbo_oauth_state'); } catch {}
    };

    if (storedState && state && storedState !== state) {
      toast({ title: 'QuickBooks', description: 'Security check failed (state mismatch). Please reconnect.', variant: 'destructive' });
      clean();
      return;
    }

    (async () => {
      try {
        if (code && incomingRealm) {
          const { data: { user: authedUser } } = await supabase.auth.getUser();
          if (!authedUser) {
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
          try { sessionStorage.setItem('pending_qbo_realm', incomingRealm); } catch {}
          clean();
          return;
        }
      } finally {
        clean();
      }
    })();
  }, [user?.id, toast]);

  // ===============================
  // Data fetches (use effective identity)
  // ===============================

  // Fetch dashboard metrics
  useEffect(() => {
    let isCancelled = false;
    const run = async () => {
      const period = toApiPeriod(timeframe);

      // === DEMO PATH: no connected realm -> show demo tiles ===
      if (isDemo) {
        const demo = demoTiles(period);
        if (!isCancelled) {
          setRevCurr(demo.revenue.current as number);
          setRevPrev(demo.revenue.previous as number);
          setExpCurr(demo.expenses.current as number);
          setExpPrev(demo.expenses.previous as number);
          setNetCurr(demo.netProfit.current as number);
          setNetPrev(demo.netProfit.previous as number);
          setCompanyName((prev) => prev ?? 'Demo Company');
          setLastSync(null); // not synced yet
        }
        return;
      }

      if (!effUserId) return; // wait for effective identity when connected

      setLoading(true);
      try {
        const { data, error } = await invokeWithAuthSafe<QboDashboardPayload>('qbo-dashboard', {
          body: { period, userId: effUserId, realmId: effRealmId, nonce: Date.now() },
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
          if (payload?.companyName) setCompanyName(payload.companyName);
        }
      } catch (e) {
        console.error('qbo-dashboard fetch failed:', e);
      } finally {
        if (!isCancelled) setLoading(false);
      }
    };
    run();
    return () => { isCancelled = true; };
  }, [timeframe, effUserId, effRealmId, isDemo]);

  // Fetch YTD chart data
  useEffect(() => {
    let isCancelled = false;
    const loadYtd = async () => {
      // === DEMO PATH: no connected realm -> show demo YTD series ===
      if (isDemo) {
        if (!isCancelled) {
          setYtdChartData(DEMO_MONTH_SERIES);
          setYtdLoading(false);
          setCompanyName((prev) => prev ?? 'Demo Company');
          setLastSync(null);
        }
        return;
      }

      if (!effUserId) return;

      setYtdLoading(true);
      try {
        const { data, error } = await invokeWithAuthSafe<QboDashboardPayload>('qbo-dashboard', {
          body: { period: 'ytd', userId: effUserId, realmId: effRealmId, nonce: Date.now() },
        });
        if (error) console.error('qbo-dashboard (ytd series) error:', error);

        const payload: QboDashboardPayload = (data as any) ?? {};
        if (!isCancelled) {
          const series = Array.isArray(payload?.ytdSeries) ? payload.ytdSeries : [];
          setYtdChartData(
            (series.length ? series : DEMO_MONTH_SERIES).map((row) => ({
              date: series.length ? `${thisYear}-${String(row.name).padStart(2, '0')}-01` : row.date,
              revenue: toNumber((row as any).revenue, 0),
              expenses: toNumber((row as any).expenses, 0),
            }))
          );
          if (payload?.lastSyncAt) setLastSync(payload.lastSyncAt);
          if (payload?.companyName && !companyName) setCompanyName(payload.companyName);
        }
      } catch (e) {
        console.error('qbo-dashboard (ytd) fetch failed:', e);
        if (!isCancelled) setYtdChartData(DEMO_MONTH_SERIES);
      } finally {
        if (!isCancelled) setYtdLoading(false);
      }
    };

    loadYtd();
    return () => { isCancelled = true; };
  }, [effUserId, effRealmId, companyName, isDemo]);

  // Load realm ID from profiles (only to support real-user OAuth UI; data fetches use effRealmId)
  useEffect(() => {
    let cancelled = false;
    const loadRealm = async () => {
      if (userLoading || !user?.id || effRealmId) return; // skip if impersonating already provides realm
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
  }, [userLoading, user?.id, effRealmId]);

  // Fetch company name (from effective realm)
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!effUserId || !effRealmId || companyName) return;

      try {
        const { data, error } = await invokeWithAuthSafe<{ companyName?: string }>('qbo-company', {
          body: { userId: effUserId, realmId: effRealmId, nonce: Date.now() },
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
  }, [effUserId, effRealmId, companyName]);

  // Insight text for the banner
  const insightText = useMemo(() => {
    const label = changeLabel(timeframe);
    const revStr = revPct === null ? '—' : `${revPct > 0 ? '+' : ''}${Math.abs(revPct).toFixed(1)}%`;
    const expStr = expPct === null ? '—' : `${expPct > 0 ? '+' : ''}${Math.abs(expPct).toFixed(1)}%`;
    return `Revenue ${revStr} ${label} while expenses ${expPct && expPct < 0 ? 'decreased' : 'changed'} ${expStr}`;
  }, [revPct, expPct, timeframe]);

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex flex-col">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            {companyName || 'Demo Company'}
          </h1>
          <p className="text-sm text-muted-foreground flex items-center gap-2 mt-1">
            Last synced: {lastSync
              ? new Date(lastSync).toLocaleDateString() + ' at ' + new Date(lastSync).toLocaleTimeString()
              : '—'}
            <span className={`inline-block w-2 h-2 rounded-full ${lastSync ? 'bg-green-500' : 'bg-gray-400'}`}></span>
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          <Select value={timeframe} onValueChange={(v: UiTimeframe) => setTimeframe(v)}>
            <SelectTrigger className="w-36" disabled={loading}>
              <Calendar className="w-4 h-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="thisMonth">This Month</SelectItem>
              <SelectItem value="lastMonth">Last Month</SelectItem>
              <SelectItem value="ytd">YTD</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={handleExportSnapshot} variant="outline" size="sm" disabled={loading || ytdLoading}>
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Key Insight */}
      <Card className="border-l-4 border-l-primary bg-primary/5 dark:bg-primary/10">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 text-primary">
              {revPct !== null && revPct > 0 ? (
                <TrendingUpIcon className="w-5 h-5" />
              ) : (
                <TrendingDownIcon className="w-5 h-5" />
              )}
            </div>
            <div>
              <p className="text-sm font-semibold text-primary mb-1">Performance Trend</p>
              <p className="text-primary font-medium">{insightText}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 3 Main Metric Cards */}
      <div className="grid gap-6 md:grid-cols-3">
        <Card className="cursor-pointer transition-colors hover:shadow-lg" onClick={() => handleCardClick('revenue')}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardDescription className="text-gray-600 dark:text-gray-400">REVENUE →</CardDescription>
              <div className="text-green-500">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M4 4a2 2 0 00-2 2v4a2 2 0 002 2V6h10a2 2 0 00-2-2H4zm2 6a2 2 0 012-2h8a2 2 0 012 2v4a2 2 0 01-2 2H8a2 2 0 01-2-2v-4zm6 4a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd"/>
                </svg>
              </div>
            </div>
            <CardTitle className="text-3xl font-bold text-gray-900 dark:text-white">
              {formatCurrency(revCurr)}
            </CardTitle>
            <p className={`text-sm font-medium ${revPct !== null && revPct >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {revPct === null ? `— ${changeLabel(timeframe)}` : `${revPct > 0 ? '+' : ''}${Math.abs(revPct).toFixed(1)}% ${changeLabel(timeframe)}`}
            </p>
          </CardHeader>
        </Card>

        <Card className="cursor-pointer transition-colors hover:shadow-lg" onClick={() => handleCardClick('expenses')}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardDescription className="text-gray-600 dark:text-gray-400">EXPENSES →</CardDescription>
              <div className="text-red-500">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                </svg>
              </div>
            </div>
            <CardTitle className="text-3xl font-bold text-gray-900 dark:text-white">
              {formatCurrency(expCurr)}
            </CardTitle>
            <p className={`text-sm font-medium ${expPct !== null && expPct < 0 ? 'text-green-600' : 'text-red-600'}`}>
              {expPct === null ? `— ${changeLabel(timeframe)}` : `${expPct > 0 ? '+' : ''}${Math.abs(expPct).toFixed(1)}% ${changeLabel(timeframe)}`}
            </p>
          </CardHeader>
        </Card>

        <Card className="cursor-pointer transition-colors hover:shadow-lg" onClick={() => handleCardClick('profit-loss')}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardDescription className="text-gray-600 dark:text-gray-400">NET PROFIT →</CardDescription>
              <div className="text-green-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
              </div>
            </div>
            <CardTitle className="text-3xl font-bold text-gray-900 dark:text-white">
              {formatCurrency(netCurr)}
            </CardTitle>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Margin: {profitMargin.toFixed(1)}%
            </p>
            <p className={`text-sm font-medium ${netPct !== null && netPct >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {netPct === null ? `— vs ${timeframe === 'ytd' ? 'last year' : 'last month'}` : `${netPct > 0 ? '+' : ''}${formatCurrency(Math.abs(netCurr - netPrev))} vs ${timeframe === 'ytd' ? 'last year' : 'last month'}`}
            </p>
          </CardHeader>
        </Card>
      </div>

      {/* Business Health Insights */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-bold text-gray-900 dark:text-white">Business Health</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-3 p-3 rounded-lg bg-green-50 dark:bg-green-900/20">
            <div className="mt-0.5 text-green-600">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/>
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h4 className="font-medium text-sm">Strong Profit Margins</h4>
                <Badge variant="default" className="text-xs">
                  {profitMargin.toFixed(1)}%
                </Badge>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Your {profitMargin.toFixed(1)}% net margin shows healthy operational efficiency
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Chart with Revenue Trend Banner */}
      <Card className="border-2 shadow-lg dark:border-gray-700">
        <CardHeader>
          <div className="bg-green-50 dark:bg-green-900/20 p-3 rounded-lg mb-4 border border-green-200 dark:border-green-800">
            <p className="text-sm text-green-600 dark:text-green-400 font-medium">
              Revenue trend {timeframe === 'ytd' ? 'YTD' : 'recent'}:{' '}
              {revPct === null ? '—' : `${revPct > 0 ? '+' : ''}${Math.abs(revPct).toFixed(1)}%`} {changeLabel(timeframe)}
            </p>
          </div>
          <CardTitle className="text-xl font-bold text-gray-900 dark:text-white">
            Revenue vs Expenses (YTD)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ChartContainer
            config={chartConfig}
            className="aspect-auto h-[350px] w-full"
          >
            <AreaChart data={ytdChartData}>
              <defs>
                <linearGradient id="fillRevenue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="var(--color-revenue)"  stopOpacity={1.0} />
                  <stop offset="95%" stopColor="var(--color-revenue)"  stopOpacity={0.1} />
                </linearGradient>
                <linearGradient id="fillExpenses" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="var(--color-expenses)" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="var(--color-expenses)" stopOpacity={0.1} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={32}
                tickFormatter={(value) => {
                  const date = new Date(value)
                  return date.toLocaleDateString("en-US", { month: "short" })
                }}
              />
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    labelFormatter={(value) => {
                      return new Date(value).toLocaleDateString("en-US", {
                        month: "short",
                        year: "numeric"
                      })
                    }}
                    indicator="dot"
                    formatter={(value: number) => [`${formatCurrency(value)}`, '']}
                  />
                }
              />
              <Area
                dataKey="expenses"
                type="natural"
                fill="url(#fillExpenses)"
                stroke="var(--color-expenses)"
                stackId="a"
              />
              <Area
                dataKey="revenue"
                type="natural"
                fill="url(#fillRevenue)"
                stroke="var(--color-revenue)"
                stackId="a"
              />
            </AreaChart>
          </ChartContainer>
        </CardContent>
      </Card>

      {/* Expense Categories */}
      {isDemo ? (
        <DemoExpenseCategories timeframe={toApiPeriod(timeframe)} />
      ) : (
        <ExpenseCategories
          timeframe={toApiPeriod(timeframe)}
          {...({ userId: effUserId, realmId: effRealmId } as any)}
        />
      )}
    </div>
  );
};

export default Dashboard;
