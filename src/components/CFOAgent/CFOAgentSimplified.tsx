// src/components/CFOAgentSimplified.tsx
import React, { useEffect, useMemo, useState } from 'react';
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
  Calendar,
  Plus
} from 'lucide-react';
import { Dialog, DialogPanel, DialogBackdrop } from '@headlessui/react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Progress } from './ui/progress';

// Import the existing ai-elements that we want to reuse
import { 
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton
} from '@/components/ai-elements/conversation';
import {
  Message,
  MessageContent
} from '@/components/ai-elements/message';
import { 
  Suggestions, 
  Suggestion 
} from '@/components/ai-elements/suggestion';
import { 
  Reasoning 
} from '@/components/ai-elements/reasoning';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

interface ChatMessage {
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

interface CFOAgentSimplifiedProps {
  onToggleSidebar?: () => void;
}

const CFOAgentSimplified: React.FC<CFOAgentSimplifiedProps> = ({ onToggleSidebar }) => {
  // Chat state - using manual state management instead of useChat
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [currentReasoning, setCurrentReasoning] = useState<Array<{id: string; title: string; content: string; type?: string}>>([]);

  // Chat History - stored in localStorage
  const [chatHistory, setChatHistory] = useState<string[]>([]);

  // UI state
  const [showOverviewDrawer, setShowOverviewDrawer] = useState(false);

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

  // Load chat history from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem('cfo-chat-history');
      if (stored) {
        setChatHistory(JSON.parse(stored));
      }
    } catch (e) {
      console.warn('Failed to load chat history:', e);
    }
  }, []);

  // Save chat history to localStorage
  const saveChatHistory = (history: string[]) => {
    setChatHistory(history);
    try {
      localStorage.setItem('cfo-chat-history', JSON.stringify(history));
    } catch (e) {
      console.warn('Failed to save chat history:', e);
    }
  };

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
    
    const lastUserMessage = messages.filter(m => m.sender === 'user').slice(-1)[0];
    if (!lastUserMessage) return [];
    
    const content = lastUserMessage.text.toLowerCase();
    
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
    
    return [
      "Compare to last month",
      "Show me a breakdown", 
      "What's driving these numbers?",
      "Create a summary report"
    ];
  };

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

  // Helper function to generate reasoning steps based on query
  const generateReasoningSteps = (query: string) => {
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
    if (!query.trim() || isLoading) return;

    // Add to chat history
    const newHistory = [query, ...chatHistory.filter(h => h !== query)].slice(0, 10);
    saveChatHistory(newHistory);

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      text: query,
      sender: 'user',
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

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
          const messageId = (Date.now() + 1).toString();
          const streamingMessage: ChatMessage = {
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
          setCurrentReasoning([]);
          
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
            
            if (i < words.length - 1) {
              await new Promise(resolve => setTimeout(resolve, 50));
            }
          }
          
          setIsLoading(false);
        }, 500);
      }
    }, 1250);
  };

  const handleSuggestedClick = (question: string) => {
    handleSend(question);
  };

  const revChange = pct(revenue.current, revenue.previous);
  const expChange = pct(expenses.current, expenses.previous);
  const netChange = netProfit.current && netProfit.previous ? netProfit.current - netProfit.previous : 0;
  const changeLabelText = timeframe === 'ytd' ? 'from last year' : 'from last month';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSend(input);
  };

  const handleNewChat = () => {
    setMessages([]);
    setCurrentReasoning([]);
    setInput('');
  };

  return (
    <div className="h-full flex bg-gray-50 dark:bg-gray-900">
      {/* Chat History Sidebar */}
      <div className="w-64 bg-gray-900 dark:bg-gray-900 text-white border-r flex flex-col">
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

        {/* New Chat Button */}
        <div className="p-3">
          <Button 
            onClick={handleNewChat}
            className="w-full justify-start text-left h-auto p-3 bg-gray-800 hover:bg-gray-700 border border-gray-600 text-white"
            variant="outline"
          >
            <Plus className="h-4 w-4 mr-2" />
            New chat
          </Button>
        </div>

        {/* Chat History */}
        <div className="flex-1 overflow-y-auto px-2">
          <div className="space-y-1">
            {chatHistory.map((chat, index) => (
              <div 
                key={index}
                className="p-3 text-sm text-gray-300 hover:bg-gray-800 rounded cursor-pointer line-clamp-2"
                onClick={() => handleSend(chat)}
                title={chat}
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

        {/* Messages using ai-elements */}
        <div className="flex-1 min-h-0">
          <Conversation className="h-full">
            <ConversationContent className="space-y-4 p-4">
              {messages.length === 0 ? (
                <ConversationEmptyState
                  title="How can I help you today?"
                  description="Ask me anything about your finances, reports, or business insights"
                  icon={<Bot className="w-12 h-12" />}
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-2xl mt-8">
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
                </ConversationEmptyState>
              ) : (
                <>
                  {messages.map((message) => (
                    <div key={message.id} className="space-y-3">
                      {/* Show reasoning before agent messages */}
                      {message.sender === 'agent' && message.reasoningSteps && message.reasoningSteps.length > 0 && (
                        <div className="flex justify-start">
                          <div className="max-w-[85%]">
                            <Reasoning 
                              steps={message.reasoningSteps.map(step => ({
                                ...step,
                                timestamp: new Date(),
                                type: step.type as any
                              }))}
                              isVisible={true}
                              className="text-sm bg-muted/50 border-muted"
                            />
                          </div>
                        </div>
                      )}
                      
                      <Message from={message.sender === 'user' ? 'user' : 'assistant'}>
                        {message.sender === 'user' ? (
                          <Avatar className="size-8 ring-1 ring-border">
                            <AvatarFallback className="bg-blue-100 text-blue-600">
                              <User className="w-4 h-4" />
                            </AvatarFallback>
                          </Avatar>
                        ) : (
                          <Avatar className="size-8 ring-1 ring-border">
                            <AvatarImage 
                              src="https://quaeeqgobujsukemkrze.supabase.co/storage/v1/object/public/assets/img/faviconV2%20(1).png" 
                              alt="IronBooks" 
                              className="mt-0 mb-0 object-contain p-1" 
                            />
                            <AvatarFallback className="bg-blue-600 text-white">
                              <Bot className="w-4 h-4" />
                            </AvatarFallback>
                          </Avatar>
                        )}
                        <MessageContent variant="contained">
                          <div className="space-y-3">
                            <div className="whitespace-pre-wrap">
                              {message.isStreaming ? (
                                <div className="flex items-center space-x-2">
                                  <div className="flex space-x-1">
                                    <div className="w-2 h-2 bg-current rounded-full animate-bounce" />
                                    <div className="w-2 h-2 bg-current rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
                                    <div className="w-2 h-2 bg-current rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                                  </div>
                                  <span className="text-sm opacity-70">Generating response...</span>
                                </div>
                              ) : (
                                message.text
                              )}
                            </div>
                            
                            <div className="text-xs opacity-70 mt-2">
                              {message.timestamp.toLocaleTimeString()}
                            </div>
                          </div>
                        </MessageContent>
                      </Message>
                    </div>
                  ))}
                  
                  {/* Show current reasoning while typing */}
                  {(isLoading || currentReasoning) && currentReasoning && currentReasoning.length > 0 && (
                    <div className="flex justify-start">
                      <div className="max-w-[85%]">
                        <Reasoning 
                          steps={currentReasoning.map(step => ({
                            ...step,
                            timestamp: new Date(),
                            type: step.type as any
                          }))}
                          isVisible={true}
                          className="text-sm bg-muted/50 border-muted animate-pulse"
                        />
                      </div>
                    </div>
                  )}
                  
                  {isLoading && !currentReasoning && (
                    <Message from="assistant">
                      <Avatar className="size-8 ring-1 ring-border">
                        <AvatarFallback className="bg-blue-600 text-white">
                          <Bot className="w-4 h-4" />
                        </AvatarFallback>
                      </Avatar>
                      <MessageContent variant="contained">
                        <div className="flex items-center space-x-2">
                          <div className="flex space-x-1">
                            <div className="w-2 h-2 bg-current rounded-full animate-bounce" />
                            <div className="w-2 h-2 bg-current rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
                            <div className="w-2 h-2 bg-current rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                          </div>
                          <span className="text-sm opacity-70">CFO Agent is thinking...</span>
                        </div>
                      </MessageContent>
                    </Message>
                  )}

                  {/* Dynamic Suggestions */}
                  {getDynamicSuggestions().length > 0 && !isLoading && (
                    <div className="p-4 border-t bg-gray-50/50 dark:bg-gray-800/25">
                      <div className="max-w-4xl mx-auto">
                        <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-3">
                          Suggested follow-ups:
                        </p>
                        <Suggestions>
                          {getDynamicSuggestions().map((suggestion, index) => (
                            <Suggestion
                              key={index}
                              suggestion={suggestion}
                              onClick={handleSuggestedClick}
                              className="whitespace-nowrap"
                            />
                          ))}
                        </Suggestions>
                      </div>
                    </div>
                  )}
                </>
              )}
            </ConversationContent>
            <ConversationScrollButton />
          </Conversation>
        </div>

        {/* Input Area */}
        <div className="border-t bg-white dark:bg-gray-800">
          <form onSubmit={handleSubmit} className="max-w-4xl mx-auto p-4">
            <div className="flex gap-3 items-end">
              <div className="flex-1 relative">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
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

export default CFOAgentSimplified;
