// src/components/CFOAgentVanilla.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { useChat } from 'ai';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { supabase, invokeWithAuth } from '@/lib/supabase';
import { useAppContext } from '@/contexts/AppContext';
import { useToast } from '@/hooks/use-toast';
import { 
  Bot, 
  User, 
  Send, 
  Menu, 
  Settings, 
  ExternalLink, 
  BarChart3,
  TrendingUp,
  DollarSign,
  X,
  Calendar
} from 'lucide-react';
import { Dialog, DialogPanel, DialogBackdrop } from '@headlessui/react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Progress } from './ui/progress';

type UiTimeframe = 'thisMonth' | 'lastMonth' | 'ytd';
type DashPeriod = 'this_month' | 'last_month' | 'ytd';

// QuickBooks OAuth config (same as before)
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

  return `${QBO_AUTHORIZE_URL}?client_id=${encodeURIComponent(QBO_CLIENT_ID)}&redirect_uri=${encodeURIComponent(QBO_REDIRECT_URI)}&response_type=code&scope=${encodeURIComponent(QBO_SCOPES)}&state=${encodeURIComponent(state)}&prompt=consent`;
}

function toApiPeriod(tf: UiTimeframe): DashPeriod {
  return tf === 'thisMonth' ? 'this_month' : tf === 'lastMonth' ? 'last_month' : 'ytd';
}

function fmt(n?: number | null) {
  if (n == null) return '$0';
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

function pct(curr?: number | null, prev?: number | null) {
  if (!prev || prev === 0 || curr == null) return 0;
  return ((curr - prev) / prev) * 100;
}

interface CFOAgentVanillaProps {
  onToggleSidebar?: () => void;
}

const CFOAgentVanilla: React.FC<CFOAgentVanillaProps> = ({ onToggleSidebar }) => {
  // Chat using vanilla AI SDK
  const {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    isLoading,
    setMessages,
    append
  } = useChat({
    api: '/api/chat', // We'll need to create this endpoint
    initialMessages: [],
  });

  // UI state
  const [showOverviewDrawer, setShowOverviewDrawer] = useState(false);
  const [chatHistory, setChatHistory] = useState<string[]>([]);

  // User & toast
  const { user } = useAppContext();
  const { toast } = useToast();

  // QBO status
  const [qboConnected, setQboConnected] = useState(false);
  const [qboRealmId, setQboRealmId] = useState<string | null>(null);

  // Company name
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

  // Suggested questions
  const suggestedQuestions = [
    "Show me my top expenses this month",
    "How's my profit margin trending?",
    "What's my cash flow forecast?",
    "Analyze my revenue growth"
  ];

  // Dynamic suggestions based on conversation
  const getDynamicSuggestions = () => {
    if (messages.length === 0 || isLoading) return [];
    
    const lastUserMessage = messages.filter(m => m.role === 'user').slice(-1)[0];
    if (!lastUserMessage) return [];
    
    // Context-aware suggestions based on the last interaction
    const content = lastUserMessage.content.toLowerCase();
    
    if (content.includes('expense')) {
      return [
        "Compare to last month",
        "Show top 5 categories", 
        "Which expenses can we reduce?",
        "Export expense report"
      ];
    } else if (content.includes('revenue') || content.includes('profit')) {
      return [
        "Show growth trends",
        "Compare to budget",
        "Forecast next quarter",
        "Revenue breakdown by source"
      ];
    } else if (content.includes('cash flow')) {
      return [
        "Show cash flow forecast",
        "Identify payment delays",
        "Working capital analysis",
        "Monthly cash trends"
      ];
    }
    
    // Default follow-up suggestions
    return [
      "Compare to last month",
      "Show me a breakdown", 
      "What's driving these numbers?",
      "Create a summary report"
    ];
  };

  // Save chat to history when messages change
  useEffect(() => {
    if (messages.length > 0) {
      const userMessages = messages.filter(m => m.role === 'user');
      if (userMessages.length > 0) {
        const lastUserMessage = userMessages[userMessages.length - 1].content;
        setChatHistory(prev => {
          if (!prev.includes(lastUserMessage)) {
            return [lastUserMessage, ...prev].slice(0, 10); // Keep last 10 chats
          }
          return prev;
        });
      }
    }
  }, [messages]);

  // All the QBO setup logic (same as before but condensed)
  useEffect(() => {
    const loadProfile = async () => {
      if (!user?.id) return;
      const { data } = await supabase
        .from('profiles')
        .select('qbo_realm_id, qbo_connected')
        .eq('id', user.id)
        .single();
      if (data) {
        setQboConnected(Boolean(data.qbo_connected));
        setQboRealmId(data.qbo_realm_id ?? null);
      }
    };
    loadProfile();
  }, [user?.id]);

  // Load metrics when period changes
  useEffect(() => {
    const fetchMetrics = async () => {
      if (!user?.id) return;
      try {
        setLoadingMetrics(true);
        const { data, error } = await invokeWithAuth('qbo-dashboard', {
          body: { period, realmId: qboRealmId, userId: user.id },
        });
        if (error) throw error;

        setRevenue(data?.revenue ?? { current: null, previous: null });
        setExpenses(data?.expenses ?? { current: null, previous: null });
        setNetProfit(data?.netProfit ?? { current: null, previous: null });

        if (data?.companyName) {
          setCompanyName(data.companyName);
        }
      } catch (e: any) {
        if (e?.message?.includes('qbo_reauth_required')) {
          setQboConnected(false);
          setQboRealmId(null);
          toast({ title: 'QuickBooks Connection Expired', description: 'Please reconnect your account.', variant: 'destructive' });
        }
      } finally {
        setLoadingMetrics(false);
      }
    };
    fetchMetrics();
  }, [user?.id, period, qboRealmId, toast]);

  const handleConnectQuickBooks = () => {
    const url = buildQboAuthUrl();
    window.location.assign(url);
  };

  const handleSuggestedClick = (question: string) => {
    append({ role: 'user', content: question });
  };

  const revChange = pct(revenue.current, revenue.previous);
  const expChange = pct(expenses.current, expenses.previous);
  const netChange = netProfit.current && netProfit.previous ? netProfit.current - netProfit.previous : 0;
  const changeLabelText = timeframe === 'ytd' ? 'from last year' : 'from last month';

  return (
    <div className="h-full flex bg-gray-50 dark:bg-gray-900">
      {/* Chat History Sidebar */}
      <div className="w-64 bg-gray-900 text-white border-r flex flex-col">
        <div className="p-4 border-b border-gray-700">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">CFO Agent</h2>
            {onToggleSidebar && (
              <Button variant="ghost" size="sm" onClick={onToggleSidebar} className="text-gray-400 hover:text-white p-1">
                <Menu className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        {/* Chat History */}
        <div className="flex-1 overflow-y-auto p-2">
          <div className="mb-4">
            <Button 
              onClick={() => setMessages([])}
              className="w-full justify-start text-left h-auto p-3 bg-gray-800 hover:bg-gray-700 border border-gray-600"
              variant="outline"
            >
              + New chat
            </Button>
          </div>
          
          <div className="space-y-2">
            {chatHistory.map((chat, index) => (
              <div 
                key={index}
                className="p-2 text-sm text-gray-300 hover:bg-gray-800 rounded cursor-pointer truncate"
                onClick={() => handleSuggestedClick(chat)}
              >
                {chat}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Top Bar */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-white dark:bg-gray-800">
          <div className="flex items-center space-x-3">
            <h1 className="text-lg font-semibold text-gray-900 dark:text-white">
              {companyName || 'CFO Agent'}
            </h1>
          </div>
          
          <div className="flex items-center space-x-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowOverviewDrawer(true)}
              className="flex items-center gap-2"
            >
              <BarChart3 className="h-4 w-4" />
              Overview
            </Button>
            
            {!qboConnected && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleConnectQuickBooks}
                className="flex items-center gap-2"
              >
                <ExternalLink className="h-4 w-4" />
                Connect QB
              </Button>
            )}
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-4xl mx-auto p-4">
            {messages.length === 0 ? (
              /* Empty State */
              <div className="flex flex-col items-center justify-center h-full text-center py-12">
                <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center mb-4">
                  <Bot className="h-8 w-8 text-white" />
                </div>
                <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-2">
                  How can I help you today?
                </h2>
                <p className="text-gray-600 dark:text-gray-300 text-lg mb-8">
                  Ask me anything about your finances, reports, or business insights
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-2xl">
                  {suggestedQuestions.map((question, index) => {
                    const icons = [TrendingUp, DollarSign, BarChart3, TrendingUp];
                    const Icon = icons[index];
                    return (
                      <Button
                        key={index}
                        variant="outline"
                        className="justify-start text-left h-auto p-4 hover:bg-gray-50 dark:hover:bg-gray-700"
                        onClick={() => handleSuggestedClick(question)}
                      >
                        <Icon className="w-5 h-5 mr-3 text-blue-600" />
                        <span className="text-sm font-medium">{question}</span>
                      </Button>
                    );
                  })}
                </div>
              </div>
            ) : (
              /* Messages */
              <>
                {messages.map((message) => {
                  const isUser = message.role === 'user';
                  return (
                    <div key={message.id} className={`flex gap-4 p-4 ${isUser ? 'bg-transparent' : 'bg-gray-50 dark:bg-gray-800/50'}`}>
                      {/* Avatar */}
                      <div className="flex-shrink-0 w-8 h-8">
                        {isUser ? (
                          <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
                            <User className="w-4 h-4 text-white" />
                          </div>
                        ) : (
                          <div className="w-8 h-8 bg-green-600 rounded-full flex items-center justify-center">
                            <Bot className="w-4 h-4 text-white" />
                          </div>
                        )}
                      </div>
                      
                      {/* Message Content */}
                      <div className="flex-1 min-w-0">
                        <div className="prose prose-gray dark:prose-invert max-w-none">
                          <div className="whitespace-pre-wrap text-gray-900 dark:text-gray-100">
                            {message.content}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* Dynamic Suggestions */}
                {getDynamicSuggestions().length > 0 && !isLoading && (
                  <div className="p-4 border-t bg-gray-50/50 dark:bg-gray-800/25">
                    <div className="max-w-4xl mx-auto">
                      <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-3">
                        Suggested follow-ups:
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {getDynamicSuggestions().map((suggestion, index) => (
                          <Button
                            key={index}
                            variant="outline"
                            size="sm"
                            onClick={() => handleSuggestedClick(suggestion)}
                            className="text-xs"
                          >
                            {suggestion}
                          </Button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Input Area */}
        <div className="border-t bg-white dark:bg-gray-800">
          <form onSubmit={handleSubmit} className="max-w-4xl mx-auto p-4">
            <div className="flex gap-3 items-end">
              <div className="flex-1 relative">
                <textarea
                  value={input}
                  onChange={handleInputChange}
                  placeholder="Ask me about cash flow, profits, expenses, or KPIs..."
                  className="w-full resize-none border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-3 pr-12 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400"
                  rows={1}
                  disabled={isLoading}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      handleSubmit(e);
                    }
                  }}
                />
                <div className="absolute right-2 bottom-2">
                  <Button
                    type="submit"
                    size="sm"
                    disabled={!input.trim() || isLoading}
                    className="p-2 h-8 w-8"
                  >
                    <Send className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </div>
          </form>
        </div>
      </div>

      {/* Overview Drawer */}
      <Dialog open={showOverviewDrawer} onClose={() => setShowOverviewDrawer(false)} className="relative z-50">
        <DialogBackdrop className="fixed inset-0 bg-black/30" />
        
        <div className="fixed inset-0 flex items-center justify-end">
          <DialogPanel className="w-full max-w-md h-full bg-white dark:bg-gray-800 shadow-xl overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Financial Overview
              </h2>
              <button
                onClick={() => setShowOverviewDrawer(false)}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
              >
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>
            
            <div className="p-4 space-y-6">
              {/* Timeframe Selector */}
              <div>
                <Select value={timeframe} onValueChange={(v: UiTimeframe) => setTimeframe(v)}>
                  <SelectTrigger className="w-full" disabled={loadingMetrics}>
                    <Calendar className="w-4 h-4 mr-2" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="thisMonth">This Month</SelectItem>
                    <SelectItem value="lastMonth">Last Month</SelectItem>
                    <SelectItem value="ytd">Year to Date</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Metrics Cards */}
              <div className="space-y-4">
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
                  <p className={`text-xs mt-1 ${revChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {loadingMetrics ? '—' : `${revChange.toFixed(1)}% ${changeLabelText}`}
                  </p>
                </Card>

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
                  <p className={`text-xs mt-1 ${expChange <= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {loadingMetrics ? '—' : `${expChange.toFixed(1)}% ${changeLabelText}`}
                  </p>
                </Card>

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
                  <p className={`text-xs mt-1 ${netChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {loadingMetrics ? '—' : `${fmt(Math.abs(netChange)).replace('$', '')} vs ${timeframe === 'ytd' ? 'last year' : 'last month'}`}
                  </p>
                </Card>
              </div>
            </div>
          </DialogPanel>
        </div>
      </Dialog>
    </div>
  );
};

export default CFOAgentVanilla;
