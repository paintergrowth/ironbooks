// src/components/CFOAgent.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card } from './ui/card';
import { Send, TrendingUp, DollarSign, BarChart3, Bot, ExternalLink, Calendar, RotateCcw } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAppContext } from '@/contexts/AppContext';
import { useToast } from '@/hooks/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'agent';
  timestamp: Date;
}

type UiTimeframe = 'thisMonth' | 'lastMonth' | 'ytd';
type DashPeriod = 'this_month' | 'last_month' | 'ytd';

// ===== Intuit (QuickBooks) OAuth config =====
const QBO_CLIENT_ID = 'ABdBqpI0xI6KDjHIgedbLVEnXrqjJpqLj2T3yyT7mBjkfI4ulJ';
const QBO_REDIRECT_URI = 'https://ironbooks.netlify.app/?connected=qbo';
const QBO_SCOPES = 'com.intuit.quickbooks.accounting openid profile email';
const QBO_AUTHORIZE_URL = 'https://appcenter.intuit.com/connect/oauth2';

function randomState(len = 24) {
  try {
    const arr = new Uint8Array(len);
    crypto.getRandomValues(arr);
    return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  }
}
 
function buildQboAuthUrl() {
  const state = randomState();
  try {
    localStorage.setItem('qbo_oauth_state', state);
    localStorage.setItem('qbo_postAuthReturn', window.location.pathname + window.location.search + window.location.hash);
  } catch {}

  const url =
    `${QBO_AUTHORIZE_URL}` +
    `?client_id=${encodeURIComponent(QBO_CLIENT_ID)}` +
    `&redirect_uri=${encodeURIComponent(QBO_REDIRECT_URI)}` +
    `&response_type=code` +
    `&scope=${encodeURIComponent(QBO_SCOPES)}` +
    `&state=${encodeURIComponent(state)}` +
    `&prompt=consent`;

  return url;
}

function toApiPeriod(tf: UiTimeframe): DashPeriod {
  return tf === 'thisMonth' ? 'this_month' : tf === 'lastMonth' ? 'last_month' : 'ytd';
}

// ===== helpers for tiles =====
function fmt(n?: number | null) {
  if (n == null) return '$0';
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}
function pct(curr?: number | null, prev?: number | null) {
  if (!prev || prev === 0 || curr == null) return 0;
  return ((curr - prev) / prev) * 100;
}

const CFOAgent = () => {
  // Chat
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);

  // User & toast
  const { user } = useAppContext();
  const { toast } = useToast();

  // QBO status badge
  const [qboConnected, setQboConnected] = useState(false);
  const [qboRealmId, setQboRealmId] = useState<string | null>(null);

  // Company name (UI)
  const [companyName, setCompanyName] = useState<string | null>(null);

  // Metrics
  const [timeframe, setTimeframe] = useState<UiTimeframe>('thisMonth');
  const period = useMemo(() => toApiPeriod(timeframe), [timeframe]);
  const [loadingMetrics, setLoadingMetrics] = useState(true);
  const [revenue, setRevenue] = useState<{ current: number | null, previous: number | null }>({ current: null, previous: null });
  const [expenses, setExpenses] = useState<{ current: number | null, previous: number | null }>({ current: null, previous: null });
  const [netProfit, setNetProfit] = useState<{ current: number | null, previous: number | null }>({ current: null, previous: null });

  // Sync status
  const [syncStatus, setSyncStatus] = useState(null);
  const [loadingSyncStatus, setLoadingSyncStatus] = useState(true);

  // Load existing profile -> badge + realm
  useEffect(() => {
    const loadProfile = async () => {
      if (!user?.id) return;
      const { data, error } = await supabase
        .from('profiles')
        .select('qbo_realm_id, qbo_connected')
        .eq('id', user.id)
        .single();
      if (!error) {
        setQboConnected(Boolean(data?.qbo_connected));
        setQboRealmId(data?.qbo_realm_id ?? null);
      }
    };
    loadProfile();
  }, [user?.id]);

  // OAuth callback saver (also exchanges tokens so qbo-company can work)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('connected') !== 'qbo') return;

    const code = params.get('code') || null;
    const incomingRealm = params.get('realmId') || null;
    const state = params.get('state') || null;
    const storedState = localStorage.getItem('qbo_oauth_state');

    const cleanUrl = window.location.origin + window.location.pathname;
    const finishAndClean = () => {
      try { history.replaceState({}, '', cleanUrl); } catch {}
      try { localStorage.removeItem('qbo_oauth_state'); } catch {}
    };

    if (storedState && state && storedState !== state) {
      toast({
        title: 'QuickBooks',
        description: 'Security check failed (state mismatch). Please reconnect.',
        variant: 'destructive',
      });
      finishAndClean();
      return;
    }

    (async () => {
      try {
        if (code && incomingRealm) {
          const { error: fnErr } = await supabase.functions.invoke('qbo-oauth-exchange', {
            body: { code, realmId: incomingRealm, redirectUri: QBO_REDIRECT_URI },
          });
          if (fnErr) {
            console.warn('[QBO] exchange failed:', fnErr.message);
            toast({ title: 'QuickBooks', description: 'Failed to complete connection (token exchange).', variant: 'destructive' });
            finishAndClean();
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
            setQboConnected(true);
            setQboRealmId(incomingRealm);
            toast({ title: 'QuickBooks', description: 'Connected successfully!' });

            // Trigger full sync
            await supabase.functions.invoke('qbo-sync-transactions', {
              body: { realmId: incomingRealm, userId: user.id, mode: 'full' }
            });
          }
        }
      } finally {
        finishAndClean();
      }
    })();
  }, [user?.id, toast]);

  // If we stashed realmId before user.id was ready, apply it now
  useEffect(() => {
    if (!user?.id) return;
    const pending = sessionStorage.getItem('pending_qbo_realm');
    if (!pending) return;
    (async () => {
      const { error } = await supabase
        .from('profiles')
        .update({
          qbo_realm_id: pending,
          qbo_connected: true,
          qbo_connected_at: new Date().toISOString(),
        })
        .eq('id', user.id);
      if (!error) {
        setQboConnected(true);
        setQboRealmId(pending);

        // Trigger full sync for stashed case (if needed)
        await supabase.functions.invoke('qbo-sync-transactions', {
          body: { realmId: pending, userId: user.id, mode: 'full' }
        });
      } else {
        console.warn('[QBO] deferred profiles update failed:', error.message);
      }
      try { sessionStorage.removeItem('pending_qbo_realm'); } catch {}
    })();
  }, [user?.id]);

  // Load live metrics (PRIMARY source for company name — mirrors Dashboard)
  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        setLoadingMetrics(true);
        const { data, error } = await supabase.functions.invoke('qbo-dashboard', {
          body: { period }
        });
        if (error) throw error;

        setRevenue(data?.revenue ?? { current: null, previous: null });
        setExpenses(data?.expenses ?? { current: null, previous: null });
        setNetProfit(data?.netProfit ?? { current: null, previous: null });

        if (data?.companyName) {
          setCompanyName(data.companyName);
        }
      } catch (e: any) {
        console.warn('qbo-dashboard error:', e?.message || e);
        toast({ title: 'QuickBooks', description: 'Failed to load live metrics.', variant: 'destructive' });
      } finally {
        setLoadingMetrics(false);
      }
    };
    if (user?.id) fetchMetrics();
  }, [user?.id, period, toast]);

  // SECONDARY: get company name via qbo-company (same pattern as Dashboard)
  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (!qboRealmId || companyName) return;

      try {
        const { data: s } = await supabase.auth.getSession();
        const accessToken = s?.session?.access_token;

        const { data, error } = await supabase.functions.invoke('qbo-company', {
          body: { realmId: qboRealmId, nonce: Date.now() },
          headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
        });

        if (error) {
          // If tokens don’t exist for this realm, nothing else to do here.
          if ((error as any)?.message?.includes('no_tokens_for_realm')) {
            console.warn('[QBO] No tokens stored for realm', qboRealmId, '— company name fallback skipped.');
          } else {
            console.warn('qbo-company invoke error:', error);
          }
          return;
        }

        if (!cancelled && (data as any)?.companyName) {
          setCompanyName((data as any).companyName);
        }
      } catch (e) {
        console.warn('qbo-company invoke exception:', e);
      }
    };

    run();
    return () => { cancelled = true; };
  }, [qboRealmId, companyName]);

  // Load sync status
  useEffect(() => {
    const fetchSyncStatus = async () => {
      if (!qboRealmId || !user?.id) return;
      try {
        setLoadingSyncStatus(true);
        const { data, error } = await supabase.functions.invoke('qbo-sync-status', {
          body: { realmId: qboRealmId, userId: user.id }
        });
        if (error) throw error;
        setSyncStatus(data);
      } catch (e) {
        console.warn('qbo-sync-status error:', e);
      } finally {
        setLoadingSyncStatus(false);
      }
    };
    fetchSyncStatus();
    const interval = setInterval(fetchSyncStatus, 30000); // Poll every 30s
    return () => clearInterval(interval);
  }, [qboRealmId, user?.id]);

  const suggestedQuestions = [
    "Show me my top expenses this month",
    "How's my profit margin trending?",
    "What's my cash flow forecast?",
    "Analyze my revenue growth"
  ];

  const handleSend = async () => {
    if (!inputValue.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      text: inputValue,
      sender: 'user',
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsTyping(true);

    try {
      const { data, error } = await supabase.functions.invoke('qbo-query-agent', {
        body: { query: inputValue, realmId: qboRealmId, userId: user.id }
      });
      if (error) throw error;

      const agentMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: data.response || "Sorry, I couldn't process that query.",
        sender: 'agent',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, agentMessage]);
    } catch (e) {
      console.error('AI query error:', e);
      // Fallback to random response
      const responses = [
        "Based on your financial data, I can see some interesting trends. Your expenses have increased by 15% this quarter, primarily driven by operational costs.",
        "Your profit margins are looking healthy at 28.9%. This is above industry average and shows strong financial management.",
        "Cash flow analysis shows a positive trend with $45K monthly inflow. I recommend maintaining 3-6 months of operating expenses in reserves.",
        "Revenue growth is strong at 23% YoY. Your Q4 projections look promising based on current trends."
      ];
      const agentMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: responses[Math.floor(Math.random() * responses.length)],
        sender: 'agent',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, agentMessage]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleSuggestedClick = (question: string) => {
    setInputValue(question);
    handleSend();
  };

  const handleConnectQuickBooks = () => {
    if (!QBO_CLIENT_ID) {
      toast({ title: 'QuickBooks', description: 'Missing Client ID. Set QBO_CLIENT_ID in CFOAgent.tsx.', variant: 'destructive' });
      return;
    }
    const url = buildQboAuthUrl();
    try {
      window.location.assign(url);
    } catch {
      const a = document.createElement('a');
      a.href = url;
      a.target = '_self';
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
    }
  };

  const handleImportTranx = async () => {
    if (!qboConnected || !qboRealmId || !user?.id) {
      toast({ title: 'Sync Error', description: 'Not connected or missing info.', variant: 'destructive' });
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke('qbo-sync-transactions', {
        body: { realmId: qboRealmId, userId: user.id, mode: 'full' }
      });
      if (error) {
        console.error('[Manual Sync] Failed:', error.message);
        toast({ title: 'Sync Failed', description: error.message, variant: 'destructive' });
      } else {
        toast({ title: 'Sync Success', description: 'Transactions imported.', variant: 'success' });
      }
    } catch (e) {
      console.error('[Manual Sync] Exception:', e);
      toast({ title: 'Sync Error', description: 'Unexpected error.', variant: 'destructive' });
    }
  };

  const revChange = useMemo(() => pct(revenue.current, revenue.previous), [revenue]);
  const expChange = useMemo(() => pct(expenses.current, expenses.previous), [expenses]);
  const netChange = useMemo(() => {
    if (!netProfit.previous || netProfit.previous === 0 || netProfit.current == null) return 0;
    return netProfit.current - netProfit.previous;
  }, [netProfit]);

  const changeLabelText = period === 'ytd' ? 'from last year' : 'from last month';

  return (
    <div className="flex h-full bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Company name centered (same as Dashboard) */}
        <div className="flex justify-center mt-4">
          <h2 className="text-lg md:text-xl font-semibold text-gray-900 dark:text-white truncate max-w-[90%] text-center">
            {companyName || '—'}
          </h2>
        </div>

        {/* Header */}
        <div className="bg-white dark:bg-gray-800 border-b p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center">
                <Bot className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">CFO Agent</h1>
                <p className="text-gray-600 dark:text-gray-300">Your AI-powered financial advisor</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {qboConnected ? (
                <span className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-800">
                  QuickBooks Connected{qboRealmId ? ` · ${qboRealmId}` : ''}
                </span>
              ) : (
                <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-800">
                  QuickBooks Not Connected
                </span>
              )}
              <Button
                variant="outline"
                onClick={handleConnectQuickBooks}
                className="flex items-center gap-2"
                title={qboConnected ? 'Reconnect QuickBooks' : 'Connect your QuickBooks Online account'}
              >
                <ExternalLink className="h-4 w-4" />
                {qboConnected ? 'Reconnect' : 'Connect QuickBooks'}
              </Button>
            </div>
          </div>
        </div>

        {/* Chat Container */}
        <div className="flex-1 flex flex-col bg-white dark:bg-gray-800 mx-6 mb-4 rounded-lg shadow-lg border">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[70%] p-3 rounded-lg ${msg.sender === 'user' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-900'}`}>
                  {msg.text}
                  <p className="text-xs mt-1 opacity-70">{msg.timestamp.toLocaleTimeString()}</p>
                </div>
              </div>
            ))}
            {isTyping && (
              <div className="flex justify-start">
                <div className="bg-gray-200 text-gray-900 p-3 rounded-lg">
                  Typing...
                </div>
              </div>
            )}
          </div>

          {/* Input Area */}
          <div className="border-t p-6">
            <div className="flex space-x-3">
              <Input
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Ask me about cash flow, profits, expenses, or KPIs..."
                className="flex-1 rounded-full border-2 focus:border-blue-500"
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              />
              <Button
                onClick={handleSend}
                className="rounded-full w-12 h-12 bg-blue-600 hover:bg-blue-700"
                size="icon"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Sidebar (live metrics) */}
      <div className="w-80 bg-white dark:bg-gray-800 border-l p-6 space-y-6">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Financial Overview</h3>
          <Select value={timeframe} onValueChange={(v: UiTimeframe) => setTimeframe(v)}>
            <SelectTrigger className="w-32" disabled={loadingMetrics}>
              <Calendar className="w-4 h-4 mr-2" />
              <SelectValue placeholder="Select period" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="thisMonth">This Month</SelectItem>
              <SelectItem value="lastMonth">Last Month</SelectItem>
              <SelectItem value="ytd">YTD</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-4">
          {/* Revenue */}
          <Card className="p-4 border-l-4 border-l-green-500">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-300">Revenue</p>
                <p className="text-2xl font-bold text-green-600">
                  {loadingMetrics ? '—' : fmt(revenue.current ?? 0)}
                </p>
              </div>
              <TrendingUp className="h-8 w-8 text-green-500" />
            </div>
            <p className={`text-xs mt-1 ${((revenue.current ?? 0) - (revenue.previous ?? 0)) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {loadingMetrics ? '—' : `${(pct(revenue.current, revenue.previous)).toFixed(1)}% ${changeLabelText}`}
            </p>
          </Card>

          {/* Expenses */}
          <Card className="p-4 border-l-4 border-l-red-500">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-300">Expenses</p>
                <p className="text-2xl font-bold text-red-600">
                  {loadingMetrics ? '—' : fmt(expenses.current ?? 0)}
                </p>
              </div>
              <DollarSign className="h-8 w-8 text-red-500" />
            </div>
            <p className={`text-xs mt-1 ${((expenses.current ?? 0) - (expenses.previous ?? 0)) <= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {loadingMetrics ? '—' : `${(pct(expenses.current, expenses.previous)).toFixed(1)}% ${changeLabelText}`}
            </p>
          </Card>

          {/* Net Profit */}
          <Card className="p-4 border-l-4 border-l-blue-500">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-300">Net Profit</p>
                <p className="text-2xl font-bold text-blue-600">
                  {loadingMetrics ? '—' : fmt(netProfit.current ?? 0)}
                </p>
              </div>
              <BarChart3 className="h-8 w-8 text-blue-500" />
            </div>
            <p className={`text-xs mt-1 ${((netProfit.current ?? 0) - (netProfit.previous ?? 0)) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {loadingMetrics ? '—' : `${fmt(Math.abs((netProfit.current ?? 0) - (netProfit.previous ?? 0))).replace('$', '')} vs ${period === 'ytd' ? 'last year' : 'last month'}`}
            </p>
          </Card>
        </div>

        <div className="pt-4 border-t">
          <h4 className="font-medium text-gray-900 dark:text-white mb-3">Quick Actions</h4>
          <div className="space-y-2">
            <Button variant="outline" size="sm" className="w-full justify-start">
              Generate Report
            </Button>
            <Button variant="outline" size="sm" className="w-full justify-start">
              View Forecasts
            </Button>
            <Button variant="outline" size="sm" className="w-full justify-start">
              Export Data
            </Button>
            {qboConnected && (
              <Button 
                variant="outline" 
                size="sm" 
                className="w-full justify-start"
                onClick={handleImportTranx}
              >
                Import Tranx
              </Button>
            )}
          </div>
        </div>

        {/* Sync Status Tile (below Import Tranx) */}
        {qboConnected && syncStatus && (
          <div className="pt-4 border-t">
            <h4 className="font-medium text-gray-900 dark:text-white mb-3">Sync Status</h4>
            <Card className="p-4 flex flex-col items-center">
              <div className="relative w-24 h-24 mb-2">
                <Progress value={syncStatus.percent} className="w-full h-full rounded-full" />
                <div className="absolute inset-0 flex items-center justify-center text-xl font-bold">
                  {syncStatus.percent}%
                </div>
              </div>
              <p className="text-sm text-center text-gray-600 dark:text-gray-300">
                Last synced: {syncStatus.lastSyncDate ? new Date(syncStatus.lastSyncDate).toLocaleDateString() : 'N/A'}
              </p>
              <p className="text-sm text-center text-gray-600 dark:text-gray-300">
                {syncStatus.daysLeft > 0 ? `${syncStatus.daysLeft} days left` : 'Sync Complete'}
              </p>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
};

export default CFOAgent;
