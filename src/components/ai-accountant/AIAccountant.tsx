// src/components/ai-accountant/AIAccountant.tsx
import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Send, Plus, Search, Settings2, Sparkles, BarChart3, FileText, Calculator,
  RotateCcw, ThumbsUp, ThumbsDown, Copy, Trash2, CheckCircle, XCircle,
  ExternalLink, AlertCircle, X, Loader2, Mic, MicOff, Volume2, VolumeX
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Response } from '@/components/ai-elements/response';
import { Actions, Action } from '@/components/ai-elements/actions';
import { Reasoning, ReasoningTrigger, ReasoningContent } from '@/components/ai-elements/reasoning';
import { useChatHistory } from '@/hooks/useChatHistory';
import { useAppContext } from '@/contexts/AppContext';
import { useQBOStatus } from '@/hooks/useQBOStatus';
import { useToast } from '@/hooks/use-toast';
import { supabase, invokeWithAuthSafe, fetchSSEWithAuth } from '@/lib/supabase';
import { useImpersonation } from '@/lib/impersonation';
import { useAuthRefresh } from '@/hooks/useAuthRefresh';

// NEW: charting libs for rich rendering
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, Legend,
  BarChart, Bar, AreaChart, Area, PieChart, Pie, Cell
} from 'recharts';

interface Message {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp: Date;
  isStreaming?: boolean;
  reasoningSteps?: Array<{ id: string; title: string; content: string; type?: string }>;
  sources?: Array<{ id: string; title: string; type: string; description?: string }>;
}

interface AIAccountantProps {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
}

const AUTO_SEND_ON_END = true;           // Voice input: auto-send transcript when speech ends
const AUTO_READ_NEW_RESPONSES = true;   // TTS: auto-read assistant replies when they finish streaming
const TTS_RATE = 1.0;                    // 0.1 - 10
const TTS_PITCH = 1.0;                   // 0 - 2
const TTS_LANG = 'en-US';                // preferred language for voice selection

// ---------- Rich rendering helpers ----------
type ChartConfig =
  | { type: 'line' | 'area' | 'bar'; x: string; y: string[]; data: any[]; stacked?: boolean; yLabel?: string }
  | { type: 'pie'; nameKey: string; valueKey: string; data: any[] };

type TableConfig = { columns?: { key: string; label?: string }[]; rows?: any[]; data?: any[] };
type KPIConfig = { label: string; value: string; delta?: string; color?: 'green'|'red'|'amber'|'blue'|'slate' };

const parseFencedBlocks = (text: string) => {
  const blocks: Array<{ kind: 'chart'|'table'|'kpi'|'text'; payload: any | string }> = [];
  const regex = /```(\w+)\s*([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const [full, tag, body] = match;
    if (match.index > lastIndex) {
      const before = text.slice(lastIndex, match.index).trim();
      if (before) blocks.push({ kind: 'text', payload: before });
    }
    const lower = tag.toLowerCase();
    if (['chart', 'table', 'kpi'].includes(lower)) {
      try {
        const json = JSON.parse(body.trim());
        blocks.push({ kind: lower as any, payload: json });
      } catch {
        // If JSON parse fails, keep as plain text
        blocks.push({ kind: 'text', payload: full });
      }
    } else {
      // Unknown block -> keep as plain
      blocks.push({ kind: 'text', payload: full });
    }
    lastIndex = match.index + full.length;
  }
  const remaining = text.slice(lastIndex).trim();
  if (remaining) blocks.push({ kind: 'text', payload: remaining });
  return blocks;
};

const KPI: React.FC<{ config: KPIConfig }> = ({ config }) => {
  const colorMap: Record<string, string> = {
    green: 'text-green-700 bg-green-50 dark:text-green-200 dark:bg-green-900/20',
    red: 'text-red-700 bg-red-50 dark:text-red-200 dark:bg-red-900/20',
    amber: 'text-amber-700 bg-amber-50 dark:text-amber-200 dark:bg-amber-900/20',
    blue: 'text-blue-700 bg-blue-50 dark:text-blue-200 dark:bg-blue-900/20',
    slate: 'text-slate-700 bg-slate-50 dark:text-slate-200 dark:bg-slate-800/40',
  };
  const badge = colorMap[config.color || 'slate'];
  return (
    <Card className="p-4 border-0 shadow-sm dark:bg-slate-900/60">
      <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">{config.label}</div>
      <div className="text-3xl font-semibold">{config.value}</div>
      {config.delta && (
        <div className={`inline-block mt-2 px-2 py-0.5 rounded-md text-xs ${badge}`}>
          {config.delta}
        </div>
      )}
    </Card>
  );
};

const SmartTable: React.FC<{ config: TableConfig }> = ({ config }) => {
  const rows = config.rows || config.data || [];
  const cols = config.columns && config.columns.length
    ? config.columns
    : (rows[0] ? Object.keys(rows[0]).map(k => ({ key: k, label: k })) : []);

  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b dark:border-slate-700">
            {cols.map(c => (
              <th key={c.key} className="text-left py-2 pr-4 font-medium text-muted-foreground">{c.label || c.key}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r: any, i: number) => (
            <tr key={i} className="border-b last:border-0 dark:border-slate-800">
              {cols.map(c => (
                <td key={c.key} className="py-2 pr-4">
                  {String(r[c.key] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const SmartChart: React.FC<{ config: ChartConfig }> = ({ config }) => {
  const cardCls = "p-3 border-0 shadow-sm dark:bg-slate-900/60";
  if (config.type === 'pie') {
    const { data, nameKey, valueKey } = config;
    return (
      <Card className={cardCls}>
        <div className="w-full h-72">
          <ResponsiveContainer>
            <PieChart>
              <Pie data={data} nameKey={nameKey} dataKey={valueKey} outerRadius={110} label />
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </Card>
    );
  }

  const { type, x, y, data, stacked, yLabel } = config as Extract<ChartConfig, { type: 'line'|'area'|'bar' }>;
  const commonAxes = (
    <>
      <XAxis dataKey={x} />
      <YAxis label={yLabel ? { value: yLabel, angle: -90, position: 'insideLeft' } : undefined} />
      <Tooltip />
      <Legend />
    </>
  );

  return (
    <Card className={cardCls}>
      <div className="w-full h-80">
        <ResponsiveContainer>
          {type === 'line' && (
            <LineChart data={data}>
              {commonAxes}
              {y.map((k, i) => (
                <Line key={k} type="monotone" dataKey={k} dot={false} strokeWidth={2} />
              ))}
            </LineChart>
          )}
          {type === 'area' && (
            <AreaChart data={data}>
              {commonAxes}
              {y.map((k) => (
                <Area key={k} type="monotone" dataKey={k} stackId={stacked ? 'a' : undefined} strokeWidth={2} fillOpacity={0.3} />
              ))}
            </AreaChart>
          )}
          {type === 'bar' && (
            <BarChart data={data}>
              {commonAxes}
              {y.map((k) => (
                <Bar key={k} dataKey={k} stackId={stacked ? 'a' : undefined} />
              ))}
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </Card>
  );
};

const RichMessage: React.FC<{ content: string }> = ({ content }) => {
  const blocks = parseFencedBlocks(content);

  // If everything is plain text, fall back to your existing <Response/>
  const hasRich = blocks.some(b => b.kind !== 'text');
  if (!hasRich) {
    return (
      <div className="prose prose-sm max-w-none dark:prose-invert">
        <Response>{content}</Response>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {blocks.map((b, idx) => {
        if (b.kind === 'text') {
          return (
            <div key={idx} className="prose prose-sm max-w-none dark:prose-invert">
              <Response>{b.payload as string}</Response>
            </div>
          );
        }
        if (b.kind === 'kpi') {
          return <KPI key={idx} config={b.payload as KPIConfig} />;
        }
        if (b.kind === 'table') {
          return (
            <Card key={idx} className="p-3 border-0 shadow-sm dark:bg-slate-900/60">
              <SmartTable config={b.payload as TableConfig} />
            </Card>
          );
        }
        if (b.kind === 'chart') {
          return <SmartChart key={idx} config={b.payload as ChartConfig} />;
        }
        return null;
      })}
    </div>
  );
};

// ---------- Component ----------
const AIAccountant: React.FC<AIAccountantProps> = ({ sidebarOpen, setSidebarOpen }) => {
  const { user } = useAppContext();
  const { toast } = useToast();

  // Keep auth fresh in background (prevents random 401s after tab idle)
  useAuthRefresh();

  // Disable page scrolling when component mounts
  useEffect(() => {
    const originalStyle = window.getComputedStyle(document.body).overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = originalStyle; };
  }, []);

  // ---- Impersonation / Effective identity ----
  const { isImpersonating, target } = useImpersonation();
  const [realRealmId, setRealRealmId] = useState<string | null>(null);
  const [fullName, setFullName] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState<string | null>(null);

  const qboStatus = useQBOStatus();

  const effUserId = isImpersonating ? (target?.userId ?? null) : (user?.id ?? null);
  const effRealmId = isImpersonating
    ? (target?.realmId ?? null)
    : (qboStatus?.realm_id ?? null);

  // ⬇️⬇️⬇️  **PATCH 1: scope chat history to effective identity**  ⬇️⬇️⬇️
  // These props are intentionally minimal; the hook should re-run when they change.
  const {
    sessions,
    currentSession,
    messages: chatMessages,
    loading,
    createSession,
    selectSession,
    saveMessage,
    updateSessionTitle,
    deleteSession,
  } = useChatHistory({
    ownerUserId: effUserId ?? undefined,
    realmId: effRealmId ?? undefined,
  });
  // ⬆️⬆️⬆️  **PATCH 1 END**  ⬆️⬆️⬆️

  const [inputValue, setInputValue] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [displayLimits, setDisplayLimits] = useState({ today: 10, yesterday: 5, week: 5, older: 5 });
  const [isTyping, setIsTyping] = useState(false);
  const [currentReasoning, setCurrentReasoning] = useState<Array<{ id: string; title: string; content: string; type?: string }>>([]);

  // Local streaming messages (separate from database-backed chat history)
  const [streamingMessages, setStreamingMessages] = useState<Message[]>([]);

  // Load REAL user's realm (used when not impersonating)
  useEffect(() => {
    (async () => {
      if (!user?.id) return;
      const { data, error } = await supabase
        .from('profiles')
        .select('qbo_realm_id, full_name')
        .eq('id', user.id)
        .single();
      if (!error) {
        // NOTE: we no longer rely on realRealmId for effRealmId (qboStatus already exposes it),
        // but we keep full name behavior unchanged.
        const name = (data?.full_name ?? '').trim();
        setFullName(name.length ? name : null);
      }
    })();
  }, [user?.id]);

  // Fetch company name for the EFFECTIVE identity (auth-safe)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!effUserId || !effRealmId) return;
      try {
        const { data, error } = await invokeWithAuthSafe<{ companyName?: string }>('qbo-company', {
          body: { userId: effUserId, realmId: effRealmId, nonce: Date.now() },
        });
        if (!error && !cancelled && data?.companyName) {
          setCompanyName(data.companyName);
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [effUserId, effRealmId]);

  // QuickBooks OAuth config (same as CFO Agent)
  const QBO_CLIENT_ID = 'ABdBqpI0xI6KDjHIgedbLVEnXrqjJpqLj2T3yyT7mBjkfI4ulJ';
  const QBO_REDIRECT_URI = 'https://ironbooks.netlify.app/?connected=qbo';
  const QBO_SCOPES = 'com.intuit.quickbooks.accounting openid profile email';
  const QBO_AUTHORIZE_URL = 'https://appcenter.intuit.com/connect/oauth2';

  const buildQboAuthUrl = () => {
    const state = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    try {
      localStorage.setItem('qbo_oauth_state', state);
      localStorage.setItem('qbo_postAuthReturn', window.location.pathname + window.location.search + window.location.hash);
    } catch {}
    return `${QBO_AUTHORIZE_URL}?client_id=${encodeURIComponent(QBO_CLIENT_ID)}&redirect_uri=${encodeURIComponent(QBO_REDIRECT_URI)}&response_type=code&scope=${encodeURIComponent(QBO_SCOPES)}&state=${encodeURIComponent(state)}&prompt=consent`;
  };

  const handleConnectQuickBooks = () => {
    if (!QBO_CLIENT_ID) {
      toast({ title: 'QuickBooks', description: 'Missing Client ID configuration.', variant: 'destructive' });
      return;
    }
    const url = buildQboAuthUrl();
    window.location.assign(url);
  };

  const handleSyncTransactions = async () => {
    if (!qboStatus.connected || !qboStatus.realm_id || !user?.id) {
      toast({ title: 'Sync Error', description: 'QuickBooks not connected or missing info.', variant: 'destructive' });
      return;
    }
    try {
      const { data, error } = await supabase.functions.invoke('qbo-sync-transactions', {
        body: { realmId: qboStatus.realm_id, userId: user.id, mode: 'full' }
      });
      if (error) {
        console.error('[Manual Sync] Failed:', error.message);
        toast({ title: 'Sync Failed', description: error.message, variant: 'destructive' });
      } else {
        toast({ title: 'Sync Success', description: 'Transactions imported successfully!' });
      }
    } catch (e) {
      console.error('[Manual Sync] Exception:', e);
      toast({ title: 'Sync Error', description: 'Unexpected error during sync.', variant: 'destructive' });
    }
  };

  const samplePrompts = [
    'How are my financials trending?',
    'What was my revenue last month?',
    'What is my projected revenue for current year?',
    'What are my key expenses?',
  ];

  const actionButtons = [
    { icon: Sparkles, label: 'Analyze', color: 'bg-purple-100 hover:bg-purple-200 text-purple-700 dark:bg-purple-900/30 dark:hover:bg-purple-900/40 dark:text-purple-200' },
    { icon: BarChart3, label: 'Reports', color: 'bg-blue-100 hover:bg-blue-200 text-blue-700 dark:bg-blue-900/30 dark:hover:bg-blue-900/40 dark:text-blue-200' },
    { icon: FileText, label: 'Documents', color: 'bg-green-100 hover:bg-green-200 text-green-700 dark:bg-green-900/30 dark:hover:bg-green-900/40 dark:text-green-200' },
    { icon: Calculator, label: 'Calculate', color: 'bg-orange-100 hover:bg-orange-200 text-orange-700 dark:bg-orange-900/30 dark:hover:bg-orange-900/40 dark:text-orange-200' },
  ];

  const handleSendMessage = async () => {
    if (!inputValue.trim() || !user) return;

    if (isRecording) stopMic();
    stopTTS(); // stop reading if the user sends something new

    // Resolve identity *fresh* at send-time to avoid momentary nulls
    const { data: authUserData } = await supabase.auth.getUser();
    const sendUserId = isImpersonating
      ? (target?.userId ?? null)
      : (authUserData?.user?.id ?? user?.id ?? null);
    const sendRealmId = isImpersonating
      ? (target?.realmId ?? null)
      : (qboStatus?.realm_id ?? null);

    if (!sendUserId || !sendRealmId) {
      toast({
        title: 'Connect QuickBooks',
        description: 'Please connect your QuickBooks (or wait for your company/realm to load) before chatting.',
        variant: 'destructive'
      });
      setIsTyping(false);
      return;
    }

    const messageContent = inputValue.trim();
    setInputValue('');
    setInterim('');

    // Create new session if none exists
    let session = currentSession;
    if (!session) {
      // ⬇️⬇️⬇️  **PATCH 2: create session with effective identity**  ⬇️⬇️⬇️
      session = await createSession('New Chat', {
        ownerUserId: sendUserId,
        realmId: sendRealmId,
      });
      // ⬆️⬆️⬆️  **PATCH 2 END**  ⬆️⬆️⬆️
      if (!session) return;
    }

    // Save user message
    await saveMessage('user', messageContent, 0, 0, 0, session.id);

    // Add user message to streaming state for immediate display
    const userMessage: Message = {
      id: Date.now().toString(),
      content: messageContent,
      role: 'user',
      timestamp: new Date()
    };
    setStreamingMessages(prev => [...prev, userMessage]);

    if (!currentSession) selectSession(session);

    // Auto title
    if (session.title === 'New Chat' && allMessages.length === 0) {
      const title = messageContent.length > 50 ? messageContent.substring(0, 47) + '...' : messageContent;
      updateSessionTitle(session.id, title);
    }

    setIsTyping(true);

    const reasoningSteps = generateReasoningSteps(messageContent);
    const sources = generateSources(messageContent);

    let currentStepIndex = 0;
    setCurrentReasoning([]);

    const reasoningInterval = setInterval(() => {
      if (currentStepIndex < reasoningSteps.length) {
        setCurrentReasoning(prev => [...prev, reasoningSteps[currentStepIndex]]);
        currentStepIndex++;
      } else {
        clearInterval(reasoningInterval);

        setTimeout(async () => {
          const messageId = (Date.now() + 1).toString();

          // Create streaming assistant message
          const streamingMessage: Message = {
            id: messageId,
            content: '',
            role: 'assistant',
            timestamp: new Date(),
            isStreaming: true,
            reasoningSteps,
            sources
          };
          setStreamingMessages(prev => [...prev, streamingMessage]);
          setCurrentReasoning([]);

          try {
            await callAgentStreaming(messageContent, messageId, session.id, sendUserId, sendRealmId);
            if (AUTO_READ_NEW_RESPONSES) {
              queueMicrotask(() => {
                const msg = getMsgById(messageId);
                if (msg?.content) speakText(msg.content, messageId);
              });
            }
          } catch (e) {
            console.warn('Streaming failed, falling back:', e);
            try {
              const finalResponse = await callAgentOnce(messageContent, sendUserId, sendRealmId);
              const words = finalResponse.split(' ');
              let currentText = '';
              for (let i = 0; i < words.length; i++) {
                currentText += (i > 0 ? ' ' : '') + words[i];
                setStreamingMessages(prev => prev.map(msg =>
                  msg.id === messageId
                    ? { ...msg, content: currentText, isStreaming: i < words.length - 1 }
                    : msg
                ));
                if (i < words.length - 1) {
                  await new Promise(resolve => setTimeout(resolve, 30));
                }
              }
              await saveMessage('assistant', finalResponse, 0, 0, 0, session.id);
              setIsTyping(false);
              if (AUTO_READ_NEW_RESPONSES) {
                queueMicrotask(() => speakText(finalResponse, messageId));
              }
            } catch (e2) {
              console.error('AI query error:', e2);

              let fallbackResponse = `I'm having trouble accessing your financial data right now. Please check your QuickBooks connection and try again.`;
              if (e2 instanceof Error) {
                if (e2.message.includes('QuickBooks not connected')) {
                  fallbackResponse = `🔗 **QuickBooks Not Connected**\n\nI need access to your QuickBooks data to provide financial insights. Please connect your QuickBooks account using the button in the sidebar.`;
                } else if (e2.message.includes('authorization expired') || e2.message.includes('qbo_reauth_required')) {
                  fallbackResponse = `🔄 **QuickBooks Authorization Expired**\n\nYour QuickBooks connection has expired. Please reconnect your account to continue accessing your financial data.`;
                }
              }

              setStreamingMessages(prev => prev.map(msg =>
                msg.id === messageId ? { ...msg, content: fallbackResponse, isStreaming: false } : msg
              ));
              await saveMessage('assistant', fallbackResponse, 0, 0, 0, session.id);
              setIsTyping(false);
              if (AUTO_READ_NEW_RESPONSES) {
                queueMicrotask(() => speakText(fallbackResponse, messageId));
              }
            }
          }
        }, 500);
      }
    }, 1250);
  };

  const [isRecording, setIsRecording] = useState(false);
  const [hasSpeechSupport, setHasSpeechSupport] = useState(false);
  const [interim, setInterim] = useState('');
  const recognitionRef = useRef<any | null>(null);

  // Init Web Speech API (STT)
  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      setHasSpeechSupport(true);
      const rec = new SpeechRecognition();
      rec.lang = 'en-US';
      rec.continuous = true;
      rec.interimResults = true;

      rec.onstart = () => setIsRecording(true);
      rec.onend = () => {
        setIsRecording(false);
        if (AUTO_SEND_ON_END && !isTyping) {
          const text = (inputValue + ' ' + interim).trim();
          if (text.length) {
            setInputValue(text);
            setInterim('');
            setTimeout(() => handleSendMessage(), 10);
          }
        }
      };
      rec.onerror = (e: any) => {
        setIsRecording(false);
        if (e?.error === 'not-allowed' || e?.error === 'service-not-allowed') {
          toast({ title: 'Microphone access denied', description: 'Enable mic permissions in your browser settings and try again.', variant: 'destructive' });
        } else if (e?.error !== 'aborted') {
          toast({ title: 'Voice error', description: 'Unable to transcribe speech right now.', variant: 'destructive' });
        }
      };
      rec.onresult = (event: any) => {
        let interimText = '';
        let finalChunk = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const res = event.results[i];
          if (res.isFinal) finalChunk += res[0].transcript;
          else interimText += res[0].transcript;
        }
        if (finalChunk) setInputValue((prev) => (prev ? prev + ' ' : '') + finalChunk.trim());
        setInterim(interimText);
      };

      recognitionRef.current = rec;
    } else {
      setHasSpeechSupport(false);
    }

    return () => { try { recognitionRef.current?.stop?.(); } catch {} };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startMic = async () => {
    if (!hasSpeechSupport) {
      toast({ title: 'Voice not supported', description: 'Your browser does not support speech recognition.', variant: 'destructive' });
      return;
    }
    if (isRecording) return;
    try {
      setInterim('');
      recognitionRef.current?.start();
    } catch {}
  };
  const stopMic = () => { try { recognitionRef.current?.stop(); } catch {} };

  // ==== Text-to-Speech (TTS) ====
  const synthRef = useRef<SpeechSynthesis | null>(typeof window !== 'undefined' ? window.speechSynthesis : null);
  const [ttsSupported, setTtsSupported] = useState<boolean>(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);

  // TTS ready unlock for auto-read consistency
  const [ttsReady, setTtsReady] = useState(false);
  const unlockTTS = React.useCallback(() => {
    const s = window.speechSynthesis;
    if (!s || ttsReady) return;
    const u = new SpeechSynthesisUtterance(' ');
    u.volume = 0;
    u.rate = 1;
    u.onend = () => {
      try { s.resume(); } catch {}
      setTtsReady(true);
    };
    try { s.cancel(); s.speak(u); } catch {}
  }, [ttsReady]);
  useEffect(() => {
    const handler = () => unlockTTS();
    window.addEventListener('click', handler, { once: true, capture: true });
    window.addEventListener('keydown', handler, { once: true, capture: true });
    window.addEventListener('touchstart', handler, { once: true, capture: true });
    return () => {
      window.removeEventListener('click', handler as any, { capture: true } as any);
      window.removeEventListener('keydown', handler as any, { capture: true } as any);
      window.removeEventListener('touchstart', handler as any, { capture: true } as any);
    };
  }, [unlockTTS]);

  // Load voices
  useEffect(() => {
    const synth = synthRef.current;
    if (!synth) return;
    const loadVoices = () => {
      const v = synth.getVoices ? synth.getVoices() : [];
      setVoices(v);
      setTtsSupported(!!v.length || 'speechSynthesis' in window);
    };
    loadVoices();
    if (typeof synth.onvoiceschanged !== 'undefined') {
      synth.onvoiceschanged = loadVoices;
    }
    return () => { if (synth) synth.onvoiceschanged = null as any; };
  }, []);

  const stopTTS = () => {
    try { synthRef.current?.cancel(); }
    finally {
      setIsSpeaking(false);
      setSpeakingMessageId(null);
      utteranceRef.current = null;
    }
  };

  const pickVoice = () => {
    const byLang = voices.filter(v => (v.lang || '').toLowerCase().startsWith(TTS_LANG.toLowerCase()));
    const preferredNames = ['Google US English', 'Samantha', 'Alex', 'Microsoft Aria Online (Natural) - English (United States)'];
    const preferred = byLang.find(v => preferredNames.includes(v.name)) || byLang[0] || voices[0] || null;
    return preferred || null;
  };

  const speakText = (text: string, messageId: string) => {
    if (!('speechSynthesis' in window)) {
      toast({ title: 'Playback not supported', description: 'Your browser does not support text-to-speech.', variant: 'destructive' });
      return;
    }
    if (!text?.trim()) return;

    const s = speechSynthesis;

    const trySpeak = () => {
      stopTTS();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = TTS_RATE;
      u.pitch = TTS_PITCH;
      const voice = pickVoice();
      if (voice) { u.voice = voice; u.lang = voice.lang || TTS_LANG; } else { u.lang = TTS_LANG; }
      u.onstart = () => { setIsSpeaking(true); setSpeakingMessageId(messageId); };
      u.onend = () => { setIsSpeaking(false); setSpeakingMessageId(null); utteranceRef.current = null; };
      u.onerror = () => { setIsSpeaking(false); setSpeakingMessageId(null); utteranceRef.current = null; };
      utteranceRef.current = u;
      try { s.resume(); } catch {}
      s.speak(u);
    };

    if (!ttsReady || voices.length === 0) {
      const onVoices = () => {
        setTimeout(() => {
          try { speechSynthesis.onvoiceschanged = null as any; } catch {}
          trySpeak();
        }, 0);
      };
      try { speechSynthesis.onvoiceschanged = onVoices; } catch {}
      setTimeout(onVoices, 250);
    } else {
      trySpeak();
    }
  };

  useEffect(() => () => stopTTS(), []); // stop speech on unmount

  // Combine database messages with streaming messages for display
  const allMessages = React.useMemo(() => {
    const dbMessages: Message[] = chatMessages.map(msg => ({
      id: msg.id,
      content: msg.content,
      role: msg.role,
      timestamp: new Date(msg.created_at)
    }));
    const newStreamingMessages = streamingMessages.filter(streamMsg =>
      !dbMessages.find(dbMsg => dbMsg.content === streamMsg.content && dbMsg.role === streamMsg.role)
    );
    return [...dbMessages, ...newStreamingMessages].sort((a, b) =>
      a.timestamp.getTime() - b.timestamp.getTime()
    );
  }, [chatMessages, streamingMessages]);

  // Clear streaming messages when session changes
  React.useEffect(() => {
    setStreamingMessages([]);
    stopTTS();
  }, [currentSession?.id]);

  const [companyConnectedShown, setCompanyConnectedShown] = useState(false);

  // QuickBooks connect helpers (unchanged)
  const buildQboAuthUrlMemo = buildQboAuthUrl;

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

  // ----- Streaming caller (auth-safe SSE, then JSON fallback simulation) -----
  const callAgentStreaming = async (
    query: string,
    messageId: string,
    sessionId: string,
    userId: string,
    realmId: string
  ) => {
    await new Promise<void>((resolve, reject) => {
      let accumulatedText = '';

      fetchSSEWithAuth(
        'qbo-query-agent',
        { query, realmId, userId, stream: true },
        (chunk) => {
          accumulatedText += chunk;
          setStreamingMessages(prev => prev.map(msg =>
            msg.id === messageId
              ? { ...msg, content: accumulatedText, isStreaming: true }
              : msg
          ));
        },
        async () => {
          await saveMessage('assistant', accumulatedText, 0, 0, 0, sessionId);
          setStreamingMessages(prev => prev.map(msg =>
            msg.id === messageId ? { ...msg, isStreaming: false } : msg
          ));
          setIsTyping(false);
          resolve();
        },
        (err) => { reject(err); }
      );
    });
  };

  // Non-streaming fallback (auth-safe)
  const callAgentOnce = async (query: string, userId: string, realmId: string) => {
    const { data, error } = await invokeWithAuthSafe<{ response?: string }>('qbo-query-agent', {
      body: { query, realmId, userId },
    });
    if (error) throw (typeof error === 'object' ? new Error(error.message || 'Invoke error') : new Error(String(error)));
    const text = data?.response;
    return (typeof text === 'string' && text.trim().length > 0)
      ? text
      : "Sorry, I couldn't process that query.";
  };

  const formatTime = (date: Date) => {
    const now = new Date();
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h ago`;
    return `${Math.floor(diffInMinutes / 1440)}d ago`;
  };

  return (
    <div className="h-full flex bg-background overflow-hidden">
      {/* Main Chat Area */}
      <div className="flex-1 relative h-full">
        {/* Chat Messages Area - Absolute positioned with bottom margin for input */}
        <div className="absolute inset-0 bottom-24 overflow-y-auto">
          {allMessages.length === 0 ? (
            // Welcome Screen
            <div className="h-full flex flex-col items-center justify-center p-8 space-y-8">
              <div className="text-center space-y-4">
                <h1 className="text-4xl font-semibold text-foreground">
                  {fullName ? `${fullName}, How may I help you today?` : 'How may I help you today?'}
                </h1>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-4">
                {actionButtons.map((action, index) => (
                  <Button
                    key={index}
                    variant="outline"
                    className={`flex items-center gap-2 px-4 py-2 ${action.color} border-0 dark:hover:border-slate-600`}
                  >
                    <action.icon size={16} />
                    {action.label}
                  </Button>
                ))}
              </div>

              {/* Sample Prompts */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-2xl w-full">
                {samplePrompts.map((prompt, index) => (
                  <Button
                    key={index}
                    variant="outline"
                    className="text-left justify-start h-auto p-4 whitespace-normal bg-muted/50 hover:bg-muted dark:bg-slate-900/60 dark:hover:bg-slate-900/70 dark:border-slate-700"
                    onClick={() => setInputValue(prompt)}
                  >
                    {prompt}
                  </Button>
                ))}
              </div>
            </div>
          ) : (
            // Chat Messages
            <div className="space-y-6 max-w-2xl mx-auto p-4 pb-8">
              {allMessages.map((message) => (
                <div key={message.id}>
                  {message.role === 'user' ? (
                    // User messages - keep in bubbles on the right
                    <div className="flex justify-end">
                      <div className="max-w-[70%] rounded-lg px-3 py-2 bg-primary text-primary-foreground">
                        <p className="text-sm">{message.content}</p>
                      </div>
                    </div>
                  ) : (
                    // AI messages — now rendered via RichMessage (tables/charts/KPIs supported)
                    <div className="group space-y-3">
                      <RichMessage content={message.content} />

                      {/* Action buttons for AI responses (includes TTS play/stop) */}
                      <Actions className="opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                        <Action
                          tooltip={speakingMessageId === message.id && isSpeaking ? 'Stop reading' : 'Read aloud'}
                          onClick={() => {
                            if (!ttsSupported) {
                              toast({ title: 'Playback not supported', description: 'Your browser does not support text-to-speech.', variant: 'destructive' });
                              return;
                            }
                            if (speakingMessageId === message.id && isSpeaking) {
                              stopTTS();
                            } else {
                              speakText(message.content, message.id);
                            }
                          }}
                        >
                          {speakingMessageId === message.id && isSpeaking ? <VolumeX size={16} /> : <Volume2 size={16} />}
                        </Action>
                        <Action tooltip="Regenerate response" onClick={() => handleRegenerateResponse(message.id)}>
                          <RotateCcw size={16} />
                        </Action>
                        <Action tooltip="Copy message" onClick={() => handleCopyMessage(message.content)}>
                          <Copy size={16} />
                        </Action>
                        <Action tooltip="Good response" onClick={() => handleThumbsUp(message.id)}>
                          <ThumbsUp size={16} />
                        </Action>
                        <Action tooltip="Bad response" onClick={() => handleThumbsDown(message.id)}>
                          <ThumbsDown size={16} />
                        </Action>
                      </Actions>
                    </div>
                  )}
                </div>
              ))}

              {/* Show reasoning/thinking indicator when loading */}
              {(isTyping || loading) && (
                <div className="group space-y-3">
                  <Reasoning isStreaming={isTyping || loading} defaultOpen={true}>
                    <ReasoningTrigger>
                      <div className="flex items-center gap-2 animate-pulse">
                        <div className="w-2 h-2 bg-primary rounded-full animate-pulse"></div>
                        <span className="dark:text-slate-200">
                          {currentReasoning.length > 0
                            ? currentReasoning[currentReasoning.length - 1].title
                            : "Analyzing your financial data..."
                          }
                        </span>
                      </div>
                    </ReasoningTrigger>
                    <ReasoningContent>
                      {currentReasoning.length > 0 ? (
                        <div className="space-y-2">
                          {currentReasoning.map((step) => (
                            <div key={step.id} className="flex items-start gap-2">
                              <div className="w-2 h-2 bg-green-500 rounded-full mt-1.5 flex-shrink-0"></div>
                              <div>
                                <div className="text-sm font-medium">{step.title}</div>
                                <div className="text-xs text-muted-foreground dark:text-slate-300/90">{step.content}</div>
                              </div>
                            </div>
                          ))}
                          {isTyping && currentReasoning.length > 0 && (
                            <div className="flex items-start gap-2">
                              <div className="w-2 h-2 bg-primary rounded-full animate-pulse mt-1.5 flex-shrink-0"></div>
                              <div className="text-sm text-muted-foreground animate-pulse dark:text-slate-300/90">
                                Generating response...
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="dark:text-slate-300/90">
                          I'm examining your QuickBooks data to provide accurate financial insights and recommendations tailored to your business.
                        </span>
                      )}
                    </ReasoningContent>
                  </Reasoning>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Chat Input - Absolutely positioned at bottom */}
        <div className="absolute bottom-0 left-0 right-0 border-t bg-background p-4 z-10 dark:border-slate-700">
          <div className="max-w-2xl mx-auto">
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <Input
                  value={inputValue + (interim ? (inputValue ? ' ' : '') + interim : '')}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder={isRecording ? "Listening..." : "Type your message here..."}
                  className={`pr-24 dark:bg-slate-900/60 dark:border-slate-700 dark:placeholder:text-slate-400 ${isRecording ? 'ring-2 ring-primary/50' : ''}`}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                />

                {/* Mic button */}
                <Button
                  type="button"
                  size="sm"
                  variant={isRecording ? 'default' : 'outline'}
                  className={`absolute right-10 top-1 h-8 w-8 p-0 ${isRecording ? 'animate-pulse' : ''}`}
                  onClick={() => (isRecording ? stopMic() : startMic())}
                  title={hasSpeechSupport ? (isRecording ? 'Stop' : 'Speak') : 'Voice not supported'}
                  disabled={!hasSpeechSupport}
                >
                  {isRecording ? <MicOff size={16} /> : <Mic size={16} />}
                </Button>

                {/* Send button */}
                <Button
                  size="sm"
                  className="absolute right-1 top-1 h-8 w-8 p-0"
                  onClick={handleSendMessage}
                  disabled={!inputValue.trim() && !interim.trim()}
                  title="Send"
                >
                  <Send size={14} />
                </Button>
              </div>
            </div>

            {/* Caption (kept simple; you can switch to auto-read text if preferred) */}
            <div className="mt-2 text-xs text-muted-foreground">
              {hasSpeechSupport
                ? (isRecording ? 'Listening… speak now. Click the mic to stop.' : (AUTO_READ_NEW_RESPONSES ? 'Tip: Tap the mic and start talking. I’ll read replies aloud automatically. Use the speaker to replay/pause.' : 'Tip: Tap the mic and start talking. Click the speaker on any reply to hear it.'))
                : 'Voice input is not supported in this browser.'}
            </div>
          </div>
        </div>
      </div>

      {/* Desktop Right Sidebar - Chat History */}
      <div className="w-96 border-l bg-muted/20 flex flex-col flex-shrink-0 overflow-hidden hidden md:flex dark:bg-slate-900/60 dark:border-slate-700">
        {/* Sidebar Header */}
        <div className="p-4 border-b dark:border-slate-700">
          {/* QuickBooks Connection Status & Actions */}
          {!qboStatus.connected ? (
            <div className="mb-3 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
              <div className="flex items-start gap-2 mb-2">
                <AlertCircle size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-amber-900 dark:text-amber-100">QuickBooks Required</p>
                  <p className="text-amber-700 dark:text-amber-200 text-xs">Connect to access financial data</p>
                </div>
              </div>
              <Button size="sm" className="w-full" onClick={handleConnectQuickBooks}>
                <ExternalLink size={14} className="mr-2" />
                Connect QuickBooks
              </Button>
            </div>
          ) : (
            <div className="mb-3 p-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
              <div className="flex items-center justify-between">
                <div className="text-xs text-green-700 dark:text-green-300">
                  <div className="font-medium flex items-center gap-1">
                    <CheckCircle size={12} className="text-green-800" />
                    Connected
                  </div>
                  <div className="text-green-600 dark:text-green-400">
                    {companyName || qboStatus.company_name || 'QuickBooks'}
                  </div>
                </div>
              </div>
            </div>
          )}

          <Button className="w-full" onClick={handleNewChat}>
            <Plus size={16} className="mr-2" />
            New Chat
          </Button>
        </div>

        {/* Search */}
        <div className="p-4 border-b dark:border-slate-700">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={isImpersonating ? "Search their chats..." : "Search your chats..."}
              className="pl-9 dark:bg-slate-900/60 dark:border-slate-700 dark:placeholder:text-slate-400"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {/* Chat History */}
        <ScrollArea className="flex-1 min-h-0 max-h-[calc(100vh-285px)]">
          <div className="py-4 pr-6 pl-1">
            <div className="space-y-1 max-w-full overflow-hidden">
              {loading && <div className="text-sm text-muted-foreground px-2 dark:text-slate-300/90">Loading...</div>}

              {(() => {
                const groups = groupSessionsByDate(sessions.filter(session =>
                  session.title.toLowerCase().includes(searchQuery.toLowerCase())
                ));
                return (
                  <>
                    {groups.today.length > 0 && (
                      <>
                        <div className="text-xs font-medium text-muted-foreground px-2 py-1 dark:text-slate-300/90">Today</div>
                        {groups.today.slice(0, displayLimits.today).map((session) => (
                          <Card
                            key={session.id}
                            className={`p-3 mr-1 cursor-pointer hover:bg-muted/50 border-0 group dark:bg-slate-900/60 dark:hover:bg-slate-900/70 ${currentSession?.id === session.id ? 'bg-muted dark:border dark:border-slate-700' : 'bg-transparent dark:border-slate-700'}`}
                            onClick={() => selectSession(session)}
                          >
                            <div className="space-y-1">
                              <div className="flex items-center justify-between">
                                <div className="font-medium text-sm truncate flex-1">{session.title}</div>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="opacity-0 group-hover:opacity-100 h-6 w-6 p-0"
                                  onClick={(e) => { e.stopPropagation(); deleteSession(session.id); }}
                                >
                                  <Trash2 size={12} />
                                </Button>
                              </div>
                              <div className="text-xs text-muted-foreground dark:text-slate-300/90">
                                {formatTime(new Date(session.updated_at))}
                              </div>
                            </div>
                          </Card>
                        ))}
                        {groups.today.length > displayLimits.today && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="w-full mt-2 text-xs text-muted-foreground dark:text-slate-300/90"
                            onClick={() => loadMoreSessions('today')}
                          >
                            Load {Math.min(10, groups.today.length - displayLimits.today)} more from today
                          </Button>
                        )}
                      </>
                    )}

                    {groups.yesterday.length > 0 && (
                      <>
                        <div className="text-xs font-medium text-muted-foreground px-2 py-1 mt-4 dark:text-slate-300/90">Yesterday</div>
                        {groups.yesterday.slice(0, displayLimits.yesterday).map((session) => (
                          <Card
                            key={session.id}
                            className={`p-3 mr-1 cursor-pointer hover:bg-muted/50 border-0 group dark:bg-slate-900/60 dark:hover:bg-slate-900/70 ${currentSession?.id === session.id ? 'bg-muted dark:border dark:border-slate-700' : 'bg-transparent dark:border-slate-700'}`}
                            onClick={() => selectSession(session)}
                          >
                            <div className="space-y-1">
                              <div className="flex items-center justify-between">
                                <div className="font-medium text-sm truncate flex-1">{session.title}</div>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="opacity-0 group-hover:opacity-100 h-6 w-6 p-0"
                                  onClick={(e) => { e.stopPropagation(); deleteSession(session.id); }}
                                >
                                  <Trash2 size={12} />
                                </Button>
                              </div>
                              <div className="text-xs text-muted-foreground dark:text-slate-300/90">
                                {formatTime(new Date(session.updated_at))}
                              </div>
                            </div>
                          </Card>
                        ))}
                        {groups.yesterday.length > displayLimits.yesterday && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="w-full mt-2 text-xs text-muted-foreground dark:text-slate-300/90"
                            onClick={() => loadMoreSessions('yesterday')}
                          >
                            Load {Math.min(10, groups.yesterday.length - displayLimits.yesterday)} more from yesterday
                          </Button>
                        )}
                      </>
                    )}

                    {groups.week.length > 0 && (
                      <>
                        <div className="text-xs font-medium text-muted-foreground px-2 py-1 mt-4 dark:text-slate-300/90">Last 7 Days</div>
                        {groups.week.slice(0, displayLimits.week).map((session) => (
                          <Card
                            key={session.id}
                            className={`p-3 mr-1 cursor-pointer hover:bg-muted/50 border-0 group dark:bg-slate-900/60 dark:hover:bg-slate-900/70 ${currentSession?.id === session.id ? 'bg-muted dark:border dark:border-slate-700' : 'bg-transparent dark:border-slate-700'}`}
                            onClick={() => selectSession(session)}
                          >
                            <div className="space-y-1">
                              <div className="flex items-center justify-between">
                                <div className="font-medium text-sm truncate flex-1">{session.title}</div>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="opacity-0 group-hover:opacity-100 h-6 w-6 p-0"
                                  onClick={(e) => { e.stopPropagation(); deleteSession(session.id); }}
                                >
                                  <Trash2 size={12} />
                                </Button>
                              </div>
                              <div className="text-xs text-muted-foreground dark:text-slate-300/90">
                                {formatTime(new Date(session.updated_at))}
                              </div>
                            </div>
                          </Card>
                        ))}
                        {groups.week.length > displayLimits.week && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="w-full mt-2 text-xs text-muted-foreground dark:text-slate-300/90"
                            onClick={() => loadMoreSessions('week')}
                          >
                            Load {Math.min(10, groups.week.length - displayLimits.week)} more from this week
                          </Button>
                        )}
                      </>
                    )}

                    {groups.older.length > 0 && (
                      <>
                        <div className="text-xs font-medium text-muted-foreground px-2 py-1 mt-4 dark:text-slate-300/90">Older</div>
                        {groups.older.slice(0, displayLimits.older).map((session) => (
                          <Card
                            key={session.id}
                            className={`p-3 mr-1 cursor-pointer hover:bg-muted/50 border-0 group dark:bg-slate-900/60 dark:hover:bg-slate-900/70 ${currentSession?.id === session.id ? 'bg-muted dark:border dark:border-slate-700' : 'bg-transparent dark:border-slate-700'}`}
                            onClick={() => selectSession(session)}
                          >
                            <div className="space-y-1">
                              <div className="flex items-center justify-between">
                                <div className="font-medium text-sm truncate flex-1">{session.title}</div>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="opacity-0 group-hover:opacity-100 h-6 w-6 p-0"
                                  onClick={(e) => { e.stopPropagation(); deleteSession(session.id); }}
                                >
                                  <Trash2 size={12} />
                                </Button>
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {formatTime(new Date(session.updated_at))}
                              </div>
                            </div>
                          </Card>
                        ))}
                        {groups.older.length > displayLimits.older && (
                          <Button variant="ghost" size="sm" className="w-full mt-2 text-xs text-muted-foreground dark:text-slate-300/90" onClick={() => loadMoreSessions('older')}>
                            Load more
                          </Button>
                        )}
                      </>
                    )}

                    {!loading && sessions.length === 0 && (
                      <div className="text-sm text-muted-foreground px-2 py-4 text-center dark:text-slate-300/90">
                        No chat history yet
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        </ScrollArea>
      </div>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div className="md:hidden fixed inset-0 z-30 bg-black/50" onClick={() => setSidebarOpen(false)}>
          <div className="absolute right-0 top-0 h-full w-80 bg-background border-l flex flex-col overflow-hidden dark:bg-slate-900/60 dark:border-slate-700" onClick={(e) => e.stopPropagation()}>
            {/* Mobile Close Button */}
            <div className="flex justify-between items-center p-4 border-b dark:border-slate-700">
              <h3 className="font-semibold">Chat History</h3>
              <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(false)}>
                <X size={20} />
              </Button>
            </div>

            {/* Mobile Sidebar Content - Same as desktop */}
            <div className="p-4 border-b dark:border-slate-700">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  {qboStatus.connected ? (
                    <Badge variant="default" className="text-xs bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-200 dark:border-green-800">
                      <CheckCircle size={12} className="mr-1" />
                      Connected
                      {qboStatus.loading && <Loader2 size={10} className="ml-1 animate-spin" />}
                    </Badge>
                  ) : (
                    <Badge variant="destructive" className="text-xs">
                      <XCircle size={12} className="mr-1" />
                      Not Connected
                      {qboStatus.loading && <Loader2 size={10} className="ml-1 animate-spin" />}
                    </Badge>
                  )}
                </div>
                <Button size="sm" variant="outline" className="dark:bg-slate-900/60 dark:border-slate-700">
                  <Settings2 size={16} />
                </Button>
              </div>

              {/* QuickBooks Connection Status & Actions */}
              {!qboStatus.connected ? (
                <div className="mb-3 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                  <div className="flex items-start gap-2 mb-2">
                    <AlertCircle size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
                    <div className="text-sm">
                      <p className="font-medium text-amber-900 dark:text-amber-100">QuickBooks Required</p>
                      <p className="text-amber-700 dark:text-amber-200 text-xs">Connect to access financial data</p>
                    </div>
                  </div>
                  <Button size="sm" className="w-full" onClick={handleConnectQuickBooks}>
                    <ExternalLink size={14} className="mr-2" />
                    Connect QuickBooks
                  </Button>
                </div>
              ) : (
                <div className="mb-3 p-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div className="text-xs text-green-700 dark:text-green-300">
                      <div className="font-medium">Connected</div>
                      <div className="text-green-600 dark:text-green-400">
                        {companyName || qboStatus.company_name || 'QuickBooks'}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleSyncTransactions}
                      className="h-7 px-2 text-xs dark:bg-slate-900/60 dark:border-slate-700"
                      disabled={qboStatus.loading}
                    >
                      {qboStatus.loading && <Loader2 size={12} className="mr-1 animate-spin" />}
                      Sync Data
                    </Button>
                  </div>
                </div>
              )}

              <Button className="w-full" onClick={() => { handleNewChat(); setSidebarOpen(false); }}>
                <Plus size={16} className="mr-2" />
                New Chat
              </Button>
            </div>

            {/* Search */}
            <div className="px-4 pb-4">
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder={isImpersonating ? "Search their chats..." : "Search your chats..."}
                  className="pl-9 dark:bg-slate-900/60 dark:border-slate-700 dark:placeholder:text-slate-400"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>

            {/* Chat History */}
            <ScrollArea className="flex-1 min-h-0 max-h=[calc(100vh-325px)]">
              <div className="p-2">
                <div className="space-y-1">
                  {loading && <div className="text-sm text-muted-foreground px-2 dark:text-slate-300/90">Loading...</div>}

                  {/* Today */}
                  {groupSessionsByDate(sessions.filter(s => s.title.toLowerCase().includes(searchQuery.toLowerCase()))).today.length > 0 && (
                    <>
                      <div className="text-xs font-medium text-muted-foreground px-2 py-1 dark:text-slate-300/90">Today</div>
                      {groupSessionsByDate(sessions.filter(s => s.title.toLowerCase().includes(searchQuery.toLowerCase()))).today.slice(0, displayLimits.today).map((session) => (
                        <Card
                          key={session.id}
                          className={`p-3 mr-1 cursor-pointer hover:bg-muted/50 border-0 group dark:bg-slate-900/60 dark:hover:bg-slate-900/70 ${currentSession?.id === session.id ? 'bg-muted dark:border dark:border-slate-700' : 'bg-transparent dark:border-slate-700'}`}
                          onClick={() => { selectSession(session); setSidebarOpen(false); }}
                        >
                          <div className="space-y-1">
                            <div className="flex items-center justify-between">
                              <div className="font-medium text-sm truncate flex-1">{session.title}</div>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="opacity-0 group-hover:opacity-100 h-6 w-6 p-0"
                                onClick={(e) => { e.stopPropagation(); deleteSession(session.id); }}
                              >
                                <Trash2 size={12} />
                              </Button>
                            </div>
                            <div className="text-xs text-muted-foreground truncate dark:text-slate-300/90">
                              {formatTime(new Date(session.updated_at))}
                            </div>
                          </div>
                        </Card>
                      ))}
                      {groupSessionsByDate(sessions.filter(s => s.title.toLowerCase().includes(searchQuery.toLowerCase()))).today.length > displayLimits.today && (
                        <Button variant="ghost" size="sm" className="w-full text-xs dark:text-slate-300/90" onClick={() => loadMoreSessions('today')}>
                          Show more from today
                        </Button>
                      )}
                    </>
                  )}

                  {/* Yesterday */}
                  {groupSessionsByDate(sessions.filter(s => s.title.toLowerCase().includes(searchQuery.toLowerCase()))).yesterday.length > 0 && (
                    <>
                      <div className="text-xs font-medium text-muted-foreground px-2 py-1 dark:text-slate-300/90">Yesterday</div>
                      {groupSessionsByDate(sessions.filter(s => s.title.toLowerCase().includes(searchQuery.toLowerCase()))).yesterday.slice(0, displayLimits.yesterday).map((session) => (
                        <Card
                          key={session.id}
                          className={`p-3 mr-1 cursor-pointer hover:bg-muted/50 border-0 group dark:bg-slate-900/60 dark:hover:bg-slate-900/70 ${currentSession?.id === session.id ? 'bg-muted dark:border dark:border-slate-700' : 'bg-transparent dark:border-slate-700'}`}
                          onClick={() => { selectSession(session); setSidebarOpen(false); }}
                        >
                          <div className="space-y-1">
                            <div className="flex items-center justify-between">
                              <div className="font-medium text-sm truncate flex-1">{session.title}</div>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="opacity-0 group-hover:opacity-100 h-6 w-6 p-0"
                                onClick={(e) => { e.stopPropagation(); deleteSession(session.id); }}
                              >
                                <Trash2 size={12} />
                              </Button>
                            </div>
                            <div className="text-xs text-muted-foreground truncate dark:text-slate-300/90">
                              {formatTime(new Date(session.updated_at))}
                            </div>
                          </div>
                        </Card>
                      ))}
                      {groupSessionsByDate(sessions.filter(s => s.title.toLowerCase().includes(searchQuery.toLowerCase()))).yesterday.length > displayLimits.yesterday && (
                        <Button variant="ghost" size="sm" className="w-full text-xs dark:text-slate-300/90" onClick={() => loadMoreSessions('yesterday')}>
                          Show more from yesterday
                        </Button>
                      )}
                    </>
                  )}

                  {/* This Week */}
                  {groupSessionsByDate(sessions.filter(s => s.title.toLowerCase().includes(searchQuery.toLowerCase()))).week.length > 0 && (
                    <>
                      <div className="text-xs font-medium text-muted-foreground px-2 py-1 dark:text-slate-300/90">This Week</div>
                      {groupSessionsByDate(sessions.filter(s => s.title.toLowerCase().includes(searchQuery.toLowerCase()))).week.slice(0, displayLimits.week).map((session) => (
                        <Card
                          key={session.id}
                          className={`p-3 mr-1 cursor-pointer hover:bg-muted/50 border-0 group dark:bg-slate-900/60 dark:hover:bg-slate-900/70 ${currentSession?.id === session.id ? 'bg-muted dark:border dark:border-slate-700' : 'bg-transparent dark:border-slate-700'}`}
                          onClick={() => { selectSession(session); setSidebarOpen(false); }}
                        >
                          <div className="space-y-1">
                            <div className="flex items-center justify-between">
                              <div className="font-medium text-sm truncate flex-1">{session.title}</div>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="opacity-0 group-hover:opacity-100 h-6 w-6 p-0"
                                onClick={(e) => { e.stopPropagation(); deleteSession(session.id); }}
                              >
                                <Trash2 size={12} />
                              </Button>
                            </div>
                            <div className="text-xs text-muted-foreground truncate dark:text-slate-300/90">
                              {formatTime(new Date(session.updated_at))}
                            </div>
                          </div>
                        </Card>
                      ))}
                      {groupSessionsByDate(sessions.filter(s => s.title.toLowerCase().includes(searchQuery.toLowerCase()))).week.length > displayLimits.week && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full mt-2 text-xs text-muted-foreground dark:text-slate-300/90"
                          onClick={() => loadMoreSessions('week')}
                        >
                          Show more from this week
                        </Button>
                      )}
                    </>
                  )}

                  {/* Older */}
                  {groupSessionsByDate(sessions.filter(s => s.title.toLowerCase().includes(searchQuery.toLowerCase()))).older.length > 0 && (
                    <>
                      <div className="text-xs font-medium text-muted-foreground px-2 py-1 mt-4 dark:text-slate-300/90">Older</div>
                      {groupSessionsByDate(sessions.filter(s => s.title.toLowerCase().includes(searchQuery.toLowerCase()))).older.slice(0, displayLimits.older).map((session) => (
                        <Card
                          key={session.id}
                          className={`p-3 mr-1 cursor-pointer hover:bg-muted/50 border-0 group dark:bg-slate-900/60 dark:hover:bg-slate-900/70 ${currentSession?.id === session.id ? 'bg-muted dark:border dark:border-slate-700' : 'bg-transparent dark:border-slate-700'}`}
                          onClick={() => { selectSession(session); setSidebarOpen(false); }}
                        >
                          <div className="space-y-1">
                            <div className="flex items-center justify-between">
                              <div className="font-medium text-sm truncate flex-1">{session.title}</div>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="opacity-0 group-hover:opacity-100 h-6 w-6 p-0"
                                onClick={(e) => { e.stopPropagation(); deleteSession(session.id); }}
                              >
                                <Trash2 size={12} />
                              </Button>
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {formatTime(new Date(session.updated_at))}
                            </div>
                          </div>
                        </Card>
                      ))}
                      {groupSessionsByDate(sessions.filter(s => s.title.toLowerCase().includes(searchQuery.toLowerCase()))).older.length > displayLimits.older && (
                        <Button variant="ghost" size="sm" className="w-full mt-2 text-xs text-muted-foreground dark:text-slate-300/90" onClick={() => loadMoreSessions('older')}>
                          Load more
                        </Button>
                      )}
                    </>
                  )}

                  {!loading && sessions.length === 0 && (
                    <div className="text-sm text-muted-foreground px-2 py-4 text-center dark:text-slate-300/90">
                      No chat history yet
                    </div>
                  )}
                </div>
              </div>
            </ScrollArea>
          </div>
        </div>
      )}
    </div>
  );
};

// (helper used above; kept identical)
function groupSessionsByDate(sessions: any[]) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

  const groups = { today: [] as any[], yesterday: [] as any[], week: [] as any[], older: [] as any[] };

  sessions.forEach(session => {
    const sessionDate = new Date(session.updated_at);
    if (sessionDate >= today) groups.today.push(session);
    else if (sessionDate >= yesterday) groups.yesterday.push(session);
    else if (sessionDate >= weekAgo) groups.week.push(session);
    else groups.older.push(session);
  });

  return groups;
}

export default AIAccountant;
