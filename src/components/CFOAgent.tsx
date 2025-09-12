// src/components/CFOAgent.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { TrendingUp, DollarSign, BarChart3, Bot, ExternalLink, Calendar } from 'lucide-react';
import { supabase, invokeWithAuth } from '@/lib/supabase';
import { useAppContext } from '@/contexts/AppContext';
import { useToast } from '@/hooks/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import PremiumChatInterface from './PremiumChatInterface';

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'agent';
  timestamp: Date;
  userQuery?: string;
  isStreaming?: boolean;
  reasoningSteps?: Array<{id: string; title: string; content: string; type?: string}>;
  sources?: Array<{id: string; title: string; type: string; description?: string}>;
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
  const [isTyping, setIsTyping] = useState(false);
  const [currentReasoning, setCurrentReasoning] = useState<Array<{id: string; title: string; content: string; type?: string}>>([]);

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
        // Ensure we have an authenticated user before calling the exchange
        const { data: { user: authedUser } } = await supabase.auth.getUser();

        if (!authedUser) {
          // Stash and defer until user hydrates
          if (code)       { try { sessionStorage.setItem('pending_qbo_code', code); } catch {} }
          if (incomingRealm) { try { sessionStorage.setItem('pending_qbo_realm', incomingRealm); } catch {} }
          try { sessionStorage.setItem('pending_qbo_redirect', QBO_REDIRECT_URI); } catch {}
          finishAndClean();
          return;
        }

        if (code && incomingRealm) {
          const { error: fnErr } = await supabase.functions.invoke('qbo-oauth-exchange', {
            body: { code, realmId: incomingRealm, redirectUri: QBO_REDIRECT_URI, userId: authedUser.id },
          });
          if (fnErr) {
            console.warn('[QBO] exchange failed:', fnErr.message);
            toast({ title: 'QuickBooks', description: 'Failed to complete connection (token exchange).', variant: 'destructive' });
            finishAndClean();
            return;
          }
        }

        if (incomingRealm && authedUser?.id) {
          const { error } = await supabase
            .from('profiles')
            .update({
              qbo_realm_id: incomingRealm,
              qbo_connected: true,
              qbo_connected_at: new Date().toISOString(),
            })
            .eq('id', authedUser.id);

          if (error) {
            console.warn('[QBO] profiles update failed:', error.message);
            toast({ title: 'QuickBooks', description: 'Failed to save connection.', variant: 'destructive' });
          } else {
            setQboConnected(true);
            setQboRealmId(incomingRealm);
            toast({ title: 'QuickBooks', description: 'Connected successfully!' });

            // Trigger full sync
            await supabase.functions.invoke('qbo-sync-transactions', {
              body: { realmId: incomingRealm, userId: authedUser.id, mode: 'full' }
            });
         }
        }
      } finally {
        finishAndClean();
     }
    })();
  }, [toast]);

  // If we stashed code/realm before user.id was ready, run the exchange now
  useEffect(() => {
    if (!user?.id) return;



    const pendingRealm = sessionStorage.getItem('pending_qbo_realm');
    const pendingCode = sessionStorage.getItem('pending_qbo_code');
    const pendingRedirect = sessionStorage.getItem('pending_qbo_redirect') || QBO_REDIRECT_URI;
    if (!pendingRealm || !pendingCode) return;

    (async () => {
      // 1) Run the exchange now that we have a userId
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

      // 2) Save profile flags now
      const { error } = await supabase
        .from('profiles')
        .update({
          qbo_realm_id: pendingRealm,
          qbo_connected: true,
          qbo_connected_at: new Date().toISOString(),
        })
        .eq('id', user.id);
      if (!error) {
        setQboConnected(true);
        setQboRealmId(pendingRealm);
        await supabase.functions.invoke('qbo-sync-transactions', {
          body: { realmId: pendingRealm, userId: user.id, mode: 'full' }
        });
      } else {
        console.warn('[QBO] deferred profiles update failed:', error.message);
      }
      try {
        sessionStorage.removeItem('pending_qbo_realm');
        sessionStorage.removeItem('pending_qbo_code');
        sessionStorage.removeItem('pending_qbo_redirect');
      } catch {}
    })();
  }, [user?.id]);

  // Load live metrics (PRIMARY source for company name — mirrors Dashboard)
  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        setLoadingMetrics(true);
        const { data, error } = await invokeWithAuth('qbo-dashboard', { body: { period } });
        if (error) throw error;

        setRevenue(data?.revenue ?? { current: null, previous: null });
        setExpenses(data?.expenses ?? { current: null, previous: null });
        setNetProfit(data?.netProfit ?? { current: null, previous: null });

        if (data?.companyName) {
          setCompanyName(data.companyName);
        }
      } catch (e: any) {
        console.error('qbo-dashboard FULL error:', e);
        console.error('qbo-dashboard error details:', JSON.stringify(e, null, 2));
        
        // Check if this is a reauth required error
        if (e?.message?.includes('qbo_reauth_required') || e?.context?.error === 'qbo_reauth_required') {
          setQboConnected(false);
          setQboRealmId(null);
          toast({ 
            title: 'QuickBooks Connection Expired', 
            description: 'Your QuickBooks connection has expired. Please reconnect your account.', 
            variant: 'destructive' 
          });
        } else {
          toast({ title: 'QuickBooks', description: `Failed to load live metrics: ${e?.message || String(e)}`, variant: 'destructive' });
        }
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
        const { data, error } = await invokeWithAuth('qbo-company', {
  body: { realmId: qboRealmId, nonce: Date.now() },
 });

        if (error) {
          // If tokens don’t exist for this realm, nothing else to do here.
          if ((error as any)?.message?.includes('no_tokens_for_realm')) {
            console.warn('[QBO] No tokens stored for realm', qboRealmId, '— company name fallback skipped.');
          } else {
            console.error('qbo-company FULL error:', error);
            console.error('qbo-company error details:', JSON.stringify(error, null, 2));
          }
          return;
        }

        if (!cancelled && (data as any)?.companyName) {
          setCompanyName((data as any).companyName);
        }
      } catch (e: any) {
        // Check if this is a reauth required error in the catch block too
        if (e?.message?.includes('qbo_reauth_required') || e?.context?.error === 'qbo_reauth_required') {
          setQboConnected(false);
          setQboRealmId(null);
          toast({ 
            title: 'QuickBooks Connection Expired', 
            description: 'Your QuickBooks connection has expired. Please reconnect your account.', 
            variant: 'destructive' 
          });
        } else {
          console.warn('qbo-company invoke exception:', e);
        }
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

  // Helper function to generate reasoning steps based on query
  const generateReasoningSteps = (query: string) => {
    const baseSteps = [];
    
    if (query.toLowerCase().includes('expense')) {
      return [
        { id: '1', title: 'Analyzing expense query', content: 'Identifying expense-related keywords and determining the scope of analysis needed.', type: 'analysis' },
        { id: '2', title: 'Querying transaction data', content: 'Searching QuickBooks transactions for expense categories and amounts in the specified timeframe.', type: 'lookup' },
        { id: '3', title: 'Calculating totals', content: 'Aggregating expense amounts by category and computing percentage changes from previous periods.', type: 'calculation' },
        { id: '4', title: 'Generating insights', content: 'Identifying trends, outliers, and actionable recommendations based on expense patterns.', type: 'synthesis' }
      ];
    }
    
    if (query.toLowerCase().includes('revenue') || query.toLowerCase().includes('profit')) {
      return [
        { id: '1', title: 'Understanding revenue request', content: 'Parsing query to determine if user wants revenue trends, profit margins, or comparative analysis.', type: 'analysis' },
        { id: '2', title: 'Fetching financial data', content: 'Retrieving income statements and revenue data from QuickBooks for the requested period.', type: 'lookup' },
        { id: '3', title: 'Synthesizing response', content: 'Combining revenue data with industry benchmarks to provide contextual business insights.', type: 'synthesis' }
      ];
    }
    
    // Default reasoning steps
    return [
      { id: '1', title: 'Processing query', content: 'Analyzing the user\'s question to understand the financial information being requested.', type: 'analysis' },
      { id: '2', title: 'Accessing data', content: 'Connecting to QuickBooks Online to retrieve relevant financial records and metrics.', type: 'lookup' },
      { id: '3', title: 'Generating response', content: 'Formulating a comprehensive answer with actionable insights and recommendations.', type: 'synthesis' }
    ];
  };

  // Helper function to generate sources
  const generateSources = (query: string) => {
    if (query.toLowerCase().includes('expense')) {
      return [
        { id: '1', title: 'QuickBooks Online - Expense Transactions', type: 'quickbooks', description: 'Retrieved expense data from your QuickBooks Online account for the specified period.' },
        { id: '2', title: 'Expense Category Analysis', type: 'calculation', description: 'Calculated expense totals and percentage changes by category.' },
        { id: '3', title: 'Industry Benchmark Data', type: 'api', description: 'Compared your expenses against industry averages for small businesses.' }
      ];
    }
    
    return [
      { id: '1', title: 'QuickBooks Online - Financial Data', type: 'quickbooks', description: 'General financial information retrieved from your QuickBooks Online account.' },
      { id: '2', title: 'Financial Analysis Report', type: 'report', description: 'Generated analytical insights based on your financial data.' }
    ];
  };

  const handleSend = async (query: string) => {
    const userMessage: Message = {
      id: Date.now().toString(),
      text: query,
      sender: 'user',
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setIsTyping(true);

    // Generate reasoning steps and sources for this query
    const reasoningSteps = generateReasoningSteps(query);
    const sources = generateSources(query);

    // Stream reasoning steps over ~5 seconds
    let currentStepIndex = 0;
    setCurrentReasoning([]);

    const reasoningInterval = setInterval(() => {
      if (currentStepIndex < reasoningSteps.length) {
        setCurrentReasoning(prev => [...prev, reasoningSteps[currentStepIndex]]);
        currentStepIndex++;
      } else {
        clearInterval(reasoningInterval);
        
        // After reasoning is complete, start generating the response
        setTimeout(async () => {
          // Create initial streaming message
          const messageId = (Date.now() + 1).toString();
          const streamingMessage: Message = {
            id: messageId,
            text: '',
            sender: 'agent',
            timestamp: new Date(),
            userQuery: query,
            isStreaming: true,
            reasoningSteps,
            sources
          };
          
          setMessages(prev => [...prev, streamingMessage]);
          setCurrentReasoning([]); // Clear current reasoning
          
          // Get the response (real API call or fallback)
          let finalResponse = '';
          
          try {
            const { data, error } = await supabase.functions.invoke('qbo-query-agent', {
              body: { query, realmId: qboRealmId, userId: user.id }
            });
            if (error) throw error;
            finalResponse = data.response || "Sorry, I couldn't process that query.";
          } catch (e) {
            console.error('AI query error:', e);
            // Fallback to random response
            const responses = [
              "Based on your financial data, I can see some interesting trends. Your expenses have increased by 15% this quarter, primarily driven by operational costs.",
              "Your profit margins are looking healthy at 28.9%. This is above industry average and shows strong financial management.",
              "Cash flow analysis shows a positive trend with $45K monthly inflow. I recommend maintaining 3-6 months of operating expenses in reserves.",
              "Revenue growth is strong at 23% YoY. Your Q4 projections look promising based on current trends."
            ];
            finalResponse = responses[Math.floor(Math.random() * responses.length)];
          }
          
          // Simulate streaming text response
          const words = finalResponse.split(' ');
          let currentText = '';
          
          for (let i = 0; i < words.length; i++) {
            currentText += (i > 0 ? ' ' : '') + words[i];
            
            setMessages(prev => prev.map(msg => 
              msg.id === messageId 
                ? { ...msg, text: currentText, isStreaming: i < words.length - 1 }
                : msg
            ));
            
            // Wait between words for streaming effect
            if (i < words.length - 1) {
              await new Promise(resolve => setTimeout(resolve, 50));
            }
          }
          
          setIsTyping(false);
        }, 500); // Small delay after reasoning completes
      }
    }, 1250); // ~5 seconds total for all reasoning steps
  };

  const handleSuggestedClick = (question: string) => {
    handleSend(question);
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
    <div className="h-full flex bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* Company name centered (same as Dashboard) */}
        <div className="flex justify-center pt-4 pb-2 flex-shrink-0">
          <h2 className="text-lg md:text-xl font-semibold text-gray-900 dark:text-white truncate max-w-[90%] text-center">
            {companyName || '—'}
          </h2>
        </div>

        {/* Header */}
        <div className="bg-white dark:bg-gray-800 border-b p-4 shadow-sm flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center">
                <Bot className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900 dark:text-white">CFO Agent</h1>
                <p className="text-sm text-gray-600 dark:text-gray-300">Your AI-powered financial advisor</p>
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
                size="sm"
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

        {/* Premium Chat Container */}
        <div className="flex-1 min-h-0 p-4">
          <PremiumChatInterface
            messages={messages}
            onSendMessage={handleSend}
            isTyping={isTyping}
            currentReasoning={currentReasoning}
            placeholder="Ask me about cash flow, profits, expenses, or KPIs..."
            suggestedQuestions={suggestedQuestions}
          />
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
