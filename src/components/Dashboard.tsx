// src/components/DashboardNew.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';
import { TrendingDownIcon, TrendingUpIcon, Calendar, Download, RotateCcw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import { Area, AreaChart, CartesianGrid, XAxis } from 'recharts';
import { supabase, invokeWithAuthSafe } from '@/lib/supabase';
import { useAppContext } from '@/contexts/AppContext';
import { useEffectiveIdentity } from '@/lib/impersonation';
import { useAuthRefresh } from '@/hooks/useAuthRefresh';
import ExpenseCategories from './ExpenseCategories';
import CurrentPosition from "@/components/CurrentPosition"; // ⬅️ (unchanged)
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type UiTimeframe = 'ytd' | 'thisYear' | 'lastYear' | 'thisMonth' | 'lastMonth' | 'custom';
type ApiPeriod = 'ytd' | 'this_year' | 'last_year' | 'this_month' | 'last_month';

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
  companyName?: string | null;
}

const QBO_REDIRECT_URI = 'https://app.ironbooks.com/?connected=qbo';

// ===== DEMO DATA (Jan–Sep of current year) =====
const thisYear = new Date().getFullYear();
const currentMonthIndex = Math.min(new Date().getMonth() + 1, 9);
const DEMO_MONTH_SERIES: { date: string; revenue: number; expenses: number }[] = [
  { date: `${thisYear}-01-01`, revenue: 120_000, expenses: 85_000 },
  { date: `${thisYear}-02-01`, revenue: 130_000, expenses: 90_000 },
  { date: `${thisYear}-03-01`, revenue: 125_000, expenses: 92_000 },
  { date: `${thisYear}-04-01`, revenue: 140_000, expenses: 100_000 },
  { date: `${thisYear}-05-01`, revenue: 150_000, expenses: 110_000 },
  { date: `${thisYear}-06-01`, revenue: 160_000, expenses: 115_000 },
  { date: `${thisYear}-07-01`, revenue: 170_000, expenses: 120_000 },
  { date: `${thisYear}-08-01`, revenue: 165_000, expenses: 118_000 },
  { date: `${thisYear}-09-01`, revenue: 180_000, expenses: 130_000 },
].slice(0, currentMonthIndex);

// Demo helpers
const monthRow = (i: number) => DEMO_MONTH_SERIES[i - 1] ?? { revenue: 0, expenses: 0 };
const sumSlice = (startIdx: number, endIdx: number) => {
  const slice = DEMO_MONTH_SERIES.slice(Math.max(0, startIdx - 1), Math.max(0, endIdx));
  const revenue = slice.reduce((a, r) => a + r.revenue, 0);
  const expenses = slice.reduce((a, r) => a + r.expenses, 0);
  return { revenue, expenses, net: revenue - expenses };
};
const quarterOfMonth = (m: number) => Math.ceil(m / 3);
const quarterBounds = (q: number) => {
  const start = (q - 1) * 3 + 1;
  const end = q * 3;
  return { start, end };
};

function demoTiles(period: ApiPeriod) {
  const mIdx = currentMonthIndex;

  if (period === 'this_month') {
    const cur = monthRow(mIdx);
    const prev = monthRow(Math.max(1, mIdx - 1));
    return {
      revenue: { current: cur.revenue, previous: prev.revenue || 1 },
      expenses: { current: cur.expenses, previous: prev.expenses || 1 },
      netProfit: { current: cur.revenue - cur.expenses, previous: (prev.revenue - prev.expenses) || 1 },
    };
  }
  if (period === 'last_month') {
    const cur = monthRow(Math.max(1, mIdx - 1));
    const prev = monthRow(Math.max(1, mIdx - 2));
    return {
      revenue: { current: cur.revenue, previous: prev.revenue || 1 },
      expenses: { current: cur.expenses, previous: prev.expenses || 1 },
      netProfit: { current: cur.revenue - cur.expenses, previous: (prev.revenue - prev.expenses) || 1 },
    };
  }
  if (period === 'this_quarter') {
    const thisQ = quarterOfMonth(mIdx);
    const { start, end } = quarterBounds(thisQ);
    const prevQ = Math.max(1, thisQ - 1);
    const { start: pStart, end: pEnd } = quarterBounds(prevQ);
    const cur = sumSlice(start, Math.min(end, mIdx));
    const prev = sumSlice(pStart, pEnd);
    return {
      revenue: { current: cur.revenue, previous: prev.revenue || 1 },
      expenses: { current: cur.expenses, previous: prev.expenses || 1 },
      netProfit: { current: cur.net, previous: prev.net || 1 },
    };
  }
  if (period === 'last_quarter') {
    const thisQ = quarterOfMonth(mIdx);
    const lastQ = Math.max(1, thisQ - 1);
    const prevQ = Math.max(1, lastQ - 1);
    const { start: lStart, end: lEnd } = quarterBounds(lastQ);
    const { start: pStart, end: pEnd } = quarterBounds(prevQ);
    const cur = sumSlice(lStart, Math.min(lEnd, mIdx));
    const prev = sumSlice(pStart, pEnd);
    return {
      revenue: { current: cur.revenue, previous: prev.revenue || 1 },
      expenses: { current: cur.expenses, previous: prev.expenses || 1 },
      netProfit: { current: cur.net, previous: prev.net || 1 },
    };
  }

  const curAgg = sumSlice(1, mIdx);
  const prevAgg = { revenue: Math.round(curAgg.revenue * 0.9), expenses: Math.round(curAgg.expenses * 0.9) };
  return {
    revenue: { current: curAgg.revenue, previous: prevAgg.revenue || 1 },
    expenses: { current: curAgg.expenses, previous: prevAgg.expenses || 1 },
    netProfit: { current: curAgg.net, previous: (prevAgg.revenue - prevAgg.expenses) || 1 },
  };
}

// Fallback chart
const fallbackChartData = [
  { date: '2024-01-01', revenue: 0, expenses: 0 },
  { date: '2024-02-01', revenue: 0, expenses: 0 },
  { date: '2024-03-01', revenue: 0, expenses: 0 },
  { date: '2024-04-01', revenue: 0, expenses: 0 },
  { date: '2024-05-01', revenue: 0, expenses: 0 },
  { date: '2024-06-01', revenue: 0, expenses: 0 },
  { date: '2024-07-01', revenue: 0, expenses: 0 },
];

// Helpers
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
const toApiPeriod = (ui: Exclude<UiTimeframe, 'custom'>): ApiPeriod =>
  ui === 'thisMonth' ? 'this_month'
    : ui === 'lastMonth' ? 'last_month'
      : ui === 'thisYear' ? 'this_year'
        : ui === 'lastYear' ? 'last_year'
          : 'ytd';
const changeLabel = (period: UiTimeframe) =>
  period === 'ytd' || period === 'thisYear' ? 'from last year'
    : period === 'lastYear' ? 'from year before'
      : period === 'custom' ? 'vs selected range'
        : 'from last month';

const periodTitle = (tf: UiTimeframe) =>
  tf === 'ytd' ? 'YTD'
    : tf === 'thisYear' ? 'This Year'
      : tf === 'lastYear' ? 'Last Year'
        : tf === 'thisMonth' ? 'This Month'
          : tf === 'lastMonth' ? 'Last Month'
            : 'Custom';

const fmtDate = (d: Date) =>
  d.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });

const getRangeForTimeframe = (
  tf: UiTimeframe,
  fromDate: string | null,
  toDate: string | null
  ) => {
  const now = new Date();

  if (tf === 'custom' && fromDate && toDate) {
    return { start: fromDate, end: toDate };
  }

  if (tf === 'thisMonth') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { start: fmtDate(start), end: fmtDate(end) };
  }

  if (tf === 'lastMonth') {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 0);
    return { start: fmtDate(start), end: fmtDate(end) };
  }

  if (tf === 'thisYear') {
    const start = new Date(now.getFullYear(), 0, 1);
    const end = new Date(now.getFullYear(), 11, 31);
    return { start: fmtDate(start), end: fmtDate(end) };
  }

  if (tf === 'lastYear') {
    const start = new Date(now.getFullYear() - 1, 0, 1);
    const end = new Date(now.getFullYear() - 1, 11, 31);
    return { start: fmtDate(start), end: fmtDate(end) };
  }

  const start = new Date(now.getFullYear(), 0, 1);
  return { start: fmtDate(start), end: fmtDate(now) };
};

const chartConfig = {
  revenue: { label: 'Revenue', color: 'hsl(var(--chart-1))' },
  expenses: { label: 'Expenses', color: 'hsl(var(--chart-2))' },
} satisfies ChartConfig;

interface DashboardProps {
  onNavigateToReports?: (filter: string, timeframe: string) => void;
}

const DemoExpenseCategories: React.FC<{ timeframe: ApiPeriod }> = ({ timeframe }) => {
  const monthIdx = currentMonthIndex;
  const rows = DEMO_MONTH_SERIES;

  const thisMonth = rows[monthIdx - 1]?.expenses ?? 0;
  const lastMonth = rows[monthIdx - 2]?.expenses ?? 0;

  const thisQ = quarterOfMonth(monthIdx);
  const { start: qStart, end: qEnd } = quarterBounds(thisQ);
  const lastQ = Math.max(1, thisQ - 1);
  const { start: lqStart, end: lqEnd } = quarterBounds(lastQ);

  const thisQuarter = sumSlice(qStart, Math.min(qEnd, monthIdx)).expenses;
  const prevQuarter = sumSlice(lqStart, lqEnd).expenses;

  const ytd = rows.reduce((a, r) => a + r.expenses, 0);

  const base =
    timeframe === 'this_month' ? thisMonth
      : timeframe === 'last_month' ? lastMonth
        : timeframe === 'this_quarter' ? thisQuarter
          : timeframe === 'last_quarter' ? prevQuarter
            : ytd;

  const split = [
    { name: 'Materials', pct: 0.40 },
    { name: 'Labor', pct: 0.30 },
    { name: 'Equipment', pct: 0.15 },
    { name: 'Subcontractors', pct: 0.10 },
    { name: 'Misc', pct: 0.05 },
  ];

  const data = split.map(s => ({ name: s.name, amount: Math.round(base * s.pct) }));

  const tfLabel =
    timeframe === 'this_month' ? 'This Month'
      : timeframe === 'last_month' ? 'Last Month'
        : timeframe === 'this_quarter' ? 'This Quarter'
          : timeframe === 'last_quarter' ? 'Last Quarter'
            : 'Year-to-Date';

  return (
    <Card className="bg-card border border-border/20">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-bold">Expense Categories (Demo)</CardTitle>
        <CardDescription className="text-muted-foreground">Showing {tfLabel} demo split</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {data.map(row => (
          <div
            key={row.name}
            className="flex items-center justify-between rounded-md border border-border/30 bg-muted/40 p-3"
          >
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

  useAuthRefresh();

  const { userId: effUserId, realmId: effRealmId, isImpersonating } = useEffectiveIdentity();
  console.log('[Dashboard] effective identity', { effUserId, effRealmId, isImpersonating });
  const isDemo = !effRealmId;

  const [timeframe, setTimeframe] = useState<UiTimeframe>('ytd');

  // custom range state (YYYY-MM-DD)
  const [fromDate, setFromDate] = useState<string | null>(null);
  const [toDate, setToDate] = useState<string | null>(null);

  const [chartTimeRange, setChartTimeRange] = useState('30d');
  const [loading, setLoading] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [needsQboReconnect, setNeedsQboReconnect] = useState(false);

  const [realmId, setRealmId] = useState<string | null>(null);

  const [revCurr, setRevCurr] = useState(0);
  const [revPrev, setRevPrev] = useState(0);
  const [expCurr, setExpCurr] = useState(0);
  const [expPrev, setExpPrev] = useState(0);
  const [netCurr, setNetCurr] = useState(0);
  const [netPrev, setNetPrev] = useState(0);

  const [ytdChartData, setYtdChartData] = useState(fallbackChartData);
  const [ytdLoading, setYtdLoading] = useState(false);

  // ✅ NEW: readiness flag so CurrentPosition waits until KPIs are loaded for a real realm
  const [kpisReady, setKpisReady] = useState(false);

  // NEW: dashboard-level refresh state + handler
  const [refreshing, setRefreshing] = useState(false);
  const handleRefreshQuickBooks = async () => {
    if (!effRealmId) {
      toast({ title: 'QuickBooks', description: 'No connected realm to refresh.', variant: 'destructive' });
      return;
    }
    try {
      setRefreshing(true);

      // 1) Reset monthlies + queue (SECURITY DEFINER RPC)
      const { error: rpcErr } = await supabase.rpc('reset_realm_pnl_and_queue', {
        p_realm_id: effRealmId,
      });
      if (rpcErr) {
        console.error('[Dashboard Refresh] RPC failed:', rpcErr);
        toast({ title: 'QuickBooks', description: rpcErr.message || 'Reset failed', variant: 'destructive' });
        return;
      }

      // 2) Kick P&L / BS sync
      const { error: fnErr } = await supabase.functions.invoke('qbo-pnl-sync', {
        body: { realmId: effRealmId },
      });
      if (fnErr) {
        console.error('[Dashboard Refresh] qbo-pnl-sync failed:', fnErr);
        toast({ title: 'QuickBooks', description: 'Reset done, but sync start failed. Try again.', variant: 'destructive' });
        return;
      }

      toast({ title: 'QuickBooks', description: `Refresh started for ${effRealmId}` });
    } catch (e) {
      console.error('[Dashboard Refresh] unexpected error:', e);
      toast({ title: 'QuickBooks', description: 'Unexpected error. See console.', variant: 'destructive' });
    } finally {
      setRefreshing(false);
    }
  };

  const revPct = useMemo(() => pctChange(revCurr, revPrev), [revCurr, revPrev]);
  const expPct = useMemo(() => pctChange(expCurr, expPrev), [expCurr, expPrev]);
  const netPct = useMemo(() => pctChange(netCurr, netPrev), [netCurr, netPrev]);
  const profitMargin = useMemo(() => (revCurr > 0 ? (netCurr / revCurr) * 100 : 0), [revCurr, netCurr]);

  useEffect(() => {
    if (isMobile) setChartTimeRange('7d');
  }, [isMobile]);

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
  // OAuth flows (real user)
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
        } catch { }
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
          body: { realmId: pendingRealm, userId: user.id, mode: 'full' },
        });
      }

      try {
        sessionStorage.removeItem('pending_qbo_realm');
        sessionStorage.removeItem('pending_qbo_code');
        sessionStorage.removeItem('pending_qbo_redirect');
      } catch { }
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
      try { history.replaceState({}, '', window.location.origin + window.location.pathname); } catch { }
      try { localStorage.removeItem('qbo_oauth_state'); } catch { }
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
            try { sessionStorage.setItem('pending_qbo_code', code); } catch { }
            try { sessionStorage.setItem('pending_qbo_realm', incomingRealm); } catch { }
            try { sessionStorage.setItem('pending_qbo_redirect', QBO_REDIRECT_URI); } catch { }
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
              body: { realmId: incomingRealm, userId: user.id, mode: 'full' },
            });
          }
        } else if (incomingRealm && !user?.id) {
          try { sessionStorage.setItem('pending_qbo_realm', incomingRealm); } catch { }
          clean();
          return;
        }
      } finally {
        clean();
      }
    })();
  }, [user?.id, toast]);

  // ===============================
  // Data fetches (effective identity)
  // ===============================

  // 🔁 Reset KPIs readiness whenever identity or time window changes
  useEffect(() => {
    setKpisReady(false);
  }, [effRealmId, effUserId, timeframe, fromDate, toDate]);

  // Metrics
  useEffect(() => {
    let isCancelled = false;
    const run = async () => {
      const isCustom = timeframe === 'custom';
      const customValid = isCustom && !!fromDate && !!toDate && fromDate <= toDate;
      const tfMeta = getRangeForTimeframe(timeframe, fromDate, toDate);

      // If custom selected but dates incomplete/invalid → don't fetch yet
      if (isCustom && !customValid) return;

      // Build body: either preset period or custom range
      let body: any;
      if (isCustom) {
        body = { mode: 'custom', from_date: fromDate, to_date: toDate };
      } else {
        body = { period: toApiPeriod(timeframe as Exclude<UiTimeframe, 'custom'>) };
      }

      if (isDemo) {
        const demo = demoTiles(body.period ?? 'ytd');
        if (!isCancelled) {
          setRevCurr(demo.revenue.current as number);
          setRevPrev(demo.revenue.previous as number);
          setExpCurr(demo.expenses.current as number);
          setExpPrev(demo.expenses.previous as number);
          setNetCurr(demo.netProfit.current as number);
          setNetPrev(demo.netProfit.previous as number);
          setCompanyName(prev => prev ?? 'Demo Company');
          setLastSync(null);
          // NOTE: do not set kpisReady in demo mode
        }
        return;
      }

      if (!effUserId) return;

      setLoading(true);
      try {
        const { data, error } = await invokeWithAuthSafe<QboDashboardPayload>('qbo-dashboard', {
          body: {
            ...body,
            userId: effUserId,
            realmId: effRealmId,
            nonce: Date.now(),
          },
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

          // ✅ KPIs have loaded for a real realm — allow CurrentPosition to render
          if (effRealmId) setKpisReady(true);
        }
      } catch (e) {
        console.error('qbo-dashboard fetch failed:', e);
      } finally {
        if (!isCancelled) setLoading(false);
      }
    };
    run();
    return () => { isCancelled = true; };
  }, [timeframe, fromDate, toDate, effUserId, effRealmId, isDemo]);

  // YTD chart
  useEffect(() => {
    let isCancelled = false;
    {/*Start loadYtd */}
const loadYtd = async () => {
  const now = new Date();
  const currentMonth = now.getMonth() + 1; // 1–12

  if (isDemo) {
    if (!isCancelled) {
      const filteredDemo = DEMO_MONTH_SERIES.filter(row => {
        const d = new Date(row.date);
        return !(
          d.getFullYear() === now.getFullYear() &&
          d.getMonth() + 1 === currentMonth
        );
      });

      setYtdChartData(filteredDemo.length ? filteredDemo : DEMO_MONTH_SERIES);
      setYtdLoading(false);
      setCompanyName(prev => prev ?? 'Demo Company');
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
    const series = Array.isArray(payload?.ytdSeries) ? payload.ytdSeries : [];

    if (!isCancelled) {
      // Build the 12 month "date spine" (12 months ago → last month)
      const months: { date: string; revenue: number; expenses: number }[] = [];

      for (let i = 12; i >= 1; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1); // local ok
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        months.push({ date: `${yyyy}-${mm}-01`, revenue: 0, expenses: 0 });
      }

      if (series.length === 12) {
        setYtdChartData(
          months.map((m, idx) => ({
            date: m.date,
            revenue: toNumber(series[idx]?.revenue, 0),
            expenses: toNumber(series[idx]?.expenses, 0),
          }))
        );
      } else {
        // fallback
        setYtdChartData(DEMO_MONTH_SERIES);
      }

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


    {/* End loadYtd */}
    loadYtd();
    return () => { isCancelled = true; };
  }, [effUserId, effRealmId, companyName, isDemo]);

  // Load realm for OAuth UI (not used for data)
  useEffect(() => {
    let cancelled = false;
    const loadRealm = async () => {
      if (userLoading || !user?.id || effRealmId) return;
      const { data, error } = await supabase
        .from('profiles')
        .select('qbo_realm_id')
        .eq('id', user.id)
        .single();
      if (!cancelled && !error && data?.qbo_realm_id) setRealmId(data.qbo_realm_id);
    };
    loadRealm();
    return () => { cancelled = true; };
  }, [userLoading, user?.id, effRealmId]);

  // Company name / reconnect hint
  useEffect(() => {
    let cancelled = false;

    const fetchProfileCompany = async () => {
      if (!effUserId) return;
      try {
        const { data } = await supabase
          .from('profiles')
          .select('company')
          .eq('id', effUserId)
          .maybeSingle();
        if (!cancelled && data?.company) {
          setCompanyName(data.company);
        }
      } catch { }
    };

    const run = async () => {
      if (!effUserId || !effRealmId) return;

      try {
        const { data, error } = await invokeWithAuthSafe<{ companyName?: string }>('qbo-company', {
          body: { userId: effUserId, realmId: effRealmId, nonce: Date.now() },
        });

        if (error) {
          setNeedsQboReconnect(true);
          await fetchProfileCompany();
          return;
        }

        if (!cancelled && data?.companyName) {
          setCompanyName(data.companyName);
          setNeedsQboReconnect(false);
        } else {
          await fetchProfileCompany();
        }
      } catch {
        setNeedsQboReconnect(true);
        await fetchProfileCompany();
      }
    };

    run();
    return () => { cancelled = true; };
  }, [effUserId, effRealmId]);

  const insightText = useMemo(() => {
    const label = changeLabel(timeframe);
    const revStr = revPct === null ? '—' : `${revPct > 0 ? '+' : ''}${Math.abs(revPct).toFixed(1)}%`;
    const expStr = expPct === null ? '—' : `${expPct > 0 ? '+' : ''}${Math.abs(expPct).toFixed(1)}%`;
    return `Revenue ${revStr} ${label} while expenses ${expPct && expPct < 0 ? 'decreased' : 'changed'} ${expStr}`;
  }, [revPct, expPct, timeframe]);

  const goReconnectQBO = () => {
    try {
      const url = '/settings?tab=integrations';
      window.open(url, '_blank');
    } catch { }
  };

  const isCustom = timeframe === 'custom';
  const customValid = isCustom && !!fromDate && !!toDate && fromDate <= toDate;

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold text-foreground">
              {companyName || 'Demo Company'}
            </h1>
            {needsQboReconnect && (
              <Badge
                variant="destructive"
                className="cursor-pointer"
                onClick={goReconnectQBO}
                title="QuickBooks token expired. Click to reconnect."
              >
                Reconnect QuickBooks
              </Badge>
            )}
          </div>

          {/* Refresh button before "Last synced" (hidden in demo) */}
          {effRealmId && (
            <div className="mt-2">
              <Button
                onClick={handleRefreshQuickBooks}
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                disabled={refreshing}
                title="Delete monthlies, reset queue, and restart sync for this realm"
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                {refreshing ? 'Refreshing…' : 'Refresh'}
              </Button>
            </div>
          )}

          <p className="text-sm text-muted-foreground flex items-center gap-2 mt-1">
            Last synced{' '}
            {lastSync
              ? new Date(lastSync).toLocaleDateString() + ' at ' + new Date(lastSync).toLocaleTimeString()
              : '—'}
            <span className={`inline-block w-2 h-2 rounded-full ${lastSync ? 'bg-green-500' : 'bg-gray-500/70'}`} />
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Select
            value={timeframe}
            onValueChange={(v) => {
              const val = v as UiTimeframe;
              setTimeframe(val);
              if (val !== 'custom') {
                setFromDate(null);
                setToDate(null);
              }
            }}
          >
            <SelectTrigger className="w-44 bg-card border border-border/30 hover:bg-muted/40">
              <Calendar className="w-4 h-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-popover border border-border/30">
                <SelectItem value="ytd">YTD</SelectItem>
                <SelectItem value="thisYear">This Year</SelectItem>
                <SelectItem value="lastYear">Last Year</SelectItem>
                <SelectItem value="thisMonth">This Month</SelectItem>
                <SelectItem value="lastMonth">Last Month</SelectItem>
                <SelectItem value="custom">Custom…</SelectItem>
              </SelectContent>
          </Select>

          {/* From/To inputs only for Custom */}
          {isCustom && (
            <div className="flex items-center gap-2">
              <input
                type="date"
                className="h-9 rounded-md border border-border/30 bg-card px-2 text-sm"
                value={fromDate ?? ''}
                onChange={(e) => setFromDate(e.target.value || null)}
                placeholder="From"
              />
              <span className="text-muted-foreground text-xs">to</span>
              <input
                type="date"
                className="h-9 rounded-md border border-border/30 bg-card px-2 text-sm"
                value={toDate ?? ''}
                onChange={(e) => setToDate(e.target.value || null)}
                placeholder="To"
              />
            </div>
          )}

          <Button
            onClick={handleExportSnapshot}
            variant="outline"
            size="sm"
            disabled={loading || ytdLoading || (isCustom && !customValid)}
            className="bg-card border border-border/30 hover:bg-muted/40"
            title={isCustom && !customValid ? 'Select a valid From/To first' : 'Export snapshot'}
          >
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Key Insight */}
      <Card className="bg-primary/5 border border-border/20 border-l border-l-primary/40">
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
              <p className="text-foreground font-medium">{insightText}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 3 Main Metric Cards */}
      <div className="grid gap-6 md:grid-cols-3">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Card
              className="cursor-pointer bg-card border border-border/20 shadow-sm transition-all hover:bg-muted/30 hover:border-border/30"
              onClick={() => handleCardClick('revenue')}
            >
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardDescription className="text-muted-foreground">
                    REVENUE →
                  </CardDescription>
                  <div className="text-green-500">
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fillRule="evenodd"
                        d="M4 4a2 2 0 00-2 2v4a2 2 0 002 2V6h10a2 2 0 00-2-2H4zm2 6a2 2 0 012-2h8a2 2 0 012 2v4a2 2 0 01-2 2H8a2 2 0 01-2-2v-4zm6 4a2 2 0 100-4 2 2 0 000 4z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                </div>
        
                <CardTitle className="text-3xl font-bold text-foreground">
                  {formatCurrency(revCurr)}
                </CardTitle>
        
                <p className={`text-sm font-medium ${revPct !== null && revPct >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                  {revPct === null
                    ? `— ${changeLabel(timeframe)}`
                    : `${revPct > 0 ? '+' : ''}${Math.abs(revPct).toFixed(1)}% ${changeLabel(timeframe)}`}
                </p>
              </CardHeader>
            </Card>
          </TooltipTrigger>
        
          <TooltipContent className="bg-popover border border-border/30 p-3 w-64">
            <div className="space-y-1">
              <div className="text-xs font-semibold text-muted-foreground">
                {periodTitle(timeframe)} • Revenue
              </div>
        
              <div className="text-xs text-muted-foreground">
                {tfMeta.start} — {tfMeta.end}
              </div>
        
              <div className="text-sm font-semibold">
                Amount: {formatCurrency(revCurr)}
              </div>
            </div>
          </TooltipContent>
        </Tooltip>
        </TooltipProvider>

        <Card
          className="cursor-pointer bg-card border border-border/20 shadow-sm transition-all hover:bg-muted/30 hover:border-border/30"
          onClick={() => handleCardClick('expenses')}
        >
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardDescription className="text-muted-foreground">EXPENSES →</CardDescription>
              <div className="text-red-500">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                </svg>
              </div>
            </div>
            <CardTitle className="text-3xl font-bold text-foreground">
              {formatCurrency(expCurr)}
            </CardTitle>
            <p className={`text-sm font-medium ${expPct !== null && expPct < 0 ? 'text-green-600' : 'text-red-500'}`}>
              {expPct === null
                ? `— ${changeLabel(timeframe)}`
                : `${expPct > 0 ? '+' : ''}${Math.abs(expPct).toFixed(1)}% ${changeLabel(timeframe)}`}
            </p>
          </CardHeader>
        </Card>

        <Card
          className="cursor-pointer bg-card border border-border/20 shadow-sm transition-all hover:bg-muted/30 hover:border-border/30"
          onClick={() => handleCardClick('profit-loss')}
        >
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardDescription className="text-muted-foreground">NET PROFIT →</CardDescription>
              <div className="text-green-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
              </div>
            </div>
            <CardTitle className="text-3xl font-bold text-foreground">
              {formatCurrency(netCurr)}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Margin: {profitMargin.toFixed(1)}%
            </p>
            <p className={`text-sm font-medium ${netPct !== null && netPct >= 0 ? 'text-green-600' : 'text-red-500'}`}>
              {netPct === null
                ? `— vs ${timeframe === 'ytd'
                  ? 'last year'
                  : timeframe === 'thisQuarter' || timeframe === 'lastQuarter'
                    ? 'last quarter'
                    : timeframe === 'custom'
                      ? 'selected range'
                      : 'last month'
                }`
                : `${netPct > 0 ? '+' : ''}${formatCurrency(Math.abs(netCurr - netPrev))} vs ${timeframe === 'ytd'
                  ? 'last year'
                  : timeframe === 'thisQuarter' || timeframe === 'lastQuarter'
                    ? 'last quarter'
                    : timeframe === 'custom'
                      ? 'selected range'
                      : 'last month'
                }`}
            </p>
          </CardHeader>
        </Card>
      </div>

      {/* Current Position (Bank, Cash on Hand, Receivables)
          ⛔️ Defer until KPIs resolve with a real effRealmId */}
      { /*
      {effRealmId && kpisReady && (
        <CurrentPosition
          realmId={effRealmId}
          className="bg-card border border-border/20 shadow-sm"
        />
      )}
      */ }
    

      {/* Chart */}
      <Card className="bg-card border border-border/20 shadow-sm">
        <CardHeader>
          <div className="bg-success/10 p-3 rounded-lg mb-4 border border-success/30">
            <p className="text-sm text-green-600 font-medium">
              Revenue trend {timeframe === 'ytd' ? 'YTD' : 'recent'}:{' '}
              {revPct === null ? '—' : `${revPct > 0 ? '+' : ''}${Math.abs(revPct).toFixed(1)}%`} {changeLabel(timeframe)}
            </p>
          </div>
          <CardTitle className="text-xl font-bold text-foreground">
            Revenue vs Expenses (Last 12 Months)

          </CardTitle>
        </CardHeader>
        <CardContent>
          <ChartContainer config={chartConfig} className="aspect-auto h-[350px] w-full">
            <AreaChart data={ytdChartData}>
              <defs>
                <linearGradient id="fillRevenue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-revenue)" stopOpacity={1.0} />
                  <stop offset="95%" stopColor="var(--color-revenue)" stopOpacity={0.1} />
                </linearGradient>
                <linearGradient id="fillExpenses" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-expenses)" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="var(--color-expenses)" stopOpacity={0.1} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} strokeOpacity={0.2} />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={32}
                tickFormatter={(value) => {
                  const date = new Date(value);
                  return date.toLocaleDateString('en-US', { month: 'short' });
                }}
              />
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    className="bg-popover border border-border/30"
                    labelFormatter={(value) =>
                      new Date(value).toLocaleDateString('en-US', {
                        month: 'short',
                        year: 'numeric',
                      })
                    }
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
        <DemoExpenseCategories timeframe={toApiPeriod((timeframe === 'custom' ? 'ytd' : timeframe) as Exclude<UiTimeframe, 'custom'>)} />
      ) : (
        <ExpenseCategories
          timeframe={toApiPeriod((timeframe === 'custom' ? 'ytd' : timeframe) as Exclude<UiTimeframe, 'custom'>)}
          mode={timeframe === 'custom' ? 'custom' : 'preset'}
          fromDate={timeframe === 'custom' ? fromDate || undefined : undefined}
          toDate={timeframe === 'custom' ? toDate || undefined : undefined}
          className="bg-card border border-border/20"
        />
      )}
    </div>
  );
};

export default Dashboard;
