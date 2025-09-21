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
  CardFooter,
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
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group";
import { Area, AreaChart, CartesianGrid, XAxis } from "recharts";
import { supabase } from '@/lib/supabase';
import { useAppContext } from '@/contexts/AppContext';
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

const DashboardNew: React.FC<DashboardProps> = ({ onNavigateToReports }) => {
  const { user, loading: userLoading } = useAppContext();
  const { toast } = useToast();
  const isMobile = useIsMobile();

  const [timeframe, setTimeframe] = useState<UiTimeframe>('thisMonth');
  const [chartTimeRange, setChartTimeRange] = useState("30d");
  const [loading, setLoading] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState<string | null>(null);
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

  // All existing useEffect hooks from the original component
  // Complete QBO connection if we stashed realmId before user.id was ready
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

  // Fetch dashboard metrics
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
  }, [timeframe, userLoading]);

  // Fetch YTD chart data
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
          const series = Array.isArray(payload?.ytdSeries) ? payload.ytdSeries : [];
          setYtdChartData(
            (series.length ? series : fallbackChartData).map((row) => ({
              date: `2024-${String(row.name).padStart(2, '0')}-01`,
              revenue: toNumber((row as any).revenue, 0),
              expenses: toNumber((row as any).expenses, 0),
            }))
          );
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

  // Load realm ID from profiles
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

  // Fetch company name
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

  // Insight text for the banner
  const insightText = useMemo(() => {
    const label = changeLabel(timeframe);
    const revStr = revPct === null ? '—' : `${revPct > 0 ? '+' : ''}${Math.abs(revPct).toFixed(1)}%`;
    const expStr = expPct === null ? '—' : `${expPct > 0 ? '+' : ''}${Math.abs(expPct).toFixed(1)}%`;
    return `Revenue ${revStr} ${label} while expenses ${expPct && expPct < 0 ? 'decreased' : 'changed'} ${expStr}`;
  }, [revPct, expPct, timeframe]);

  return (
    <div className="space-y-6 p-6">
      {/* Clean header with company name and key actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex flex-col">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            {companyName || 'Demo Company'}
          </h1>
          <p className="text-sm text-muted-foreground flex items-center gap-2 mt-1">
            Last synced: {lastSync
              ? new Date(lastSync).toLocaleDateString() + ' at ' + new Date(lastSync).toLocaleTimeString()
              : 'Never'}
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

      {/* 3 Main Metric Cards - Revenue, Expenses, Net Profit */}
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
                  <stop
                    offset="5%"
                    stopColor="var(--color-revenue)"
                    stopOpacity={1.0}
                  />
                  <stop
                    offset="95%"
                    stopColor="var(--color-revenue)"
                    stopOpacity={0.1}
                  />
                </linearGradient>
                <linearGradient id="fillExpenses" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="5%"
                    stopColor="var(--color-expenses)"
                    stopOpacity={0.8}
                  />
                  <stop
                    offset="95%"
                    stopColor="var(--color-expenses)"
                    stopOpacity={0.1}
                  />
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
                  return date.toLocaleDateString("en-US", {
                    month: "short"
                  })
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
      <ExpenseCategories timeframe={toApiPeriod(timeframe)} />
    </div>
  );
};

export default DashboardNew;
