// src/components/ai-accountant/AIAccountant.tsx
import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Send, Plus, Search, Settings2, Sparkles, BarChart3, FileText, Calculator, RotateCcw, ThumbsUp, ThumbsDown, Copy, Trash2, CheckCircle, XCircle, ExternalLink, AlertCircle, Menu, X, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Response } from '@/components/ai-elements/response';
import { Actions, Action } from '@/components/ai-elements/actions';
import { Reasoning, ReasoningTrigger, ReasoningContent } from '@/components/ai-elements/reasoning';
import { useChatHistory } from '@/hooks/useChatHistory';
import { useAppContext } from '@/contexts/AppContext';
import { useQBOStatus } from '@/hooks/useQBOStatus';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';

interface AIAccountantProps {
    sidebarOpen: boolean;
    setSidebarOpen: (open: boolean) => void;
}

const AIAccountant: React.FC<AIAccountantProps> = ({ sidebarOpen, setSidebarOpen }) => {
    const { user } = useAppContext();
    const { toast } = useToast();
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
        callQBOAgent
    } = useChatHistory();
    const qboStatus = useQBOStatus();

    const [inputValue, setInputValue] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [displayLimits, setDisplayLimits] = useState({
        today: 10,
        yesterday: 5,
        week: 5,
        older: 5
    });

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
        } catch { }

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
        "How does AI work?",
        "Analyze my cash flow patterns",
        "What are the key financial metrics I should track?",
        "Help me categorize these expenses"
    ];

    const actionButtons = [
        { icon: Sparkles, label: "Analyze", color: "bg-purple-100 hover:bg-purple-200 text-purple-700" },
        { icon: BarChart3, label: "Reports", color: "bg-blue-100 hover:bg-blue-200 text-blue-700" },
        { icon: FileText, label: "Documents", color: "bg-green-100 hover:bg-green-200 text-green-700" },
        { icon: Calculator, label: "Calculate", color: "bg-orange-100 hover:bg-orange-200 text-orange-700" }
    ];

    const handleSendMessage = async () => {
        if (!inputValue.trim() || !user) return;

        const messageContent = inputValue;
        setInputValue('');

        // Create new session if none exists
        let session = currentSession;
        if (!session) {
            session = await createSession('New Chat');
            if (!session) return;
        }

        // Save user message with session ID to avoid race condition
        await saveMessage('user', messageContent, 0, 0, 0, session.id);

        // Set current session after saving the first message to prevent race condition
        if (!currentSession) {
            selectSession(session);
        }

        // Auto-generate session title from first user message if it's still "New Chat"
        if (session.title === 'New Chat' && chatMessages.length === 0) {
            const title = messageContent.length > 50
                ? messageContent.substring(0, 47) + '...'
                : messageContent;
            updateSessionTitle(session.id, title);
        }

        // Call QBO Agent for AI response
        try {
            const { response, metadata } = await callQBOAgent(messageContent);

            await saveMessage(
                'assistant',
                response,
                metadata?.tokens_in || 0,
                metadata?.tokens_out || 0,
                metadata?.cost || 0,
                session.id
            );
        } catch (error) {
            console.error('Error getting AI response:', error);

            let fallbackResponse = `I'm having trouble accessing your financial data right now. Please check your QuickBooks connection and try again.`;

            if (error instanceof Error) {
                if (error.message.includes('QuickBooks not connected')) {
                    fallbackResponse = `🔗 **QuickBooks Not Connected**\n\nI need access to your QuickBooks data to provide financial insights. Please connect your QuickBooks account using the button in the sidebar.`;
                } else if (error.message.includes('authorization expired') || error.message.includes('qbo_reauth_required')) {
                    fallbackResponse = `🔄 **QuickBooks Authorization Expired**\n\nYour QuickBooks connection has expired. Please reconnect your account to continue accessing your financial data.`;
                }
            }

            await saveMessage('assistant', fallbackResponse, 0, 0, 0, session.id);
        }
    };

    const handleCopyMessage = (content: string) => {
        navigator.clipboard.writeText(content);
    };

    const handleRegenerateResponse = async (messageId: string) => {
        // In a real implementation, this would regenerate the AI response
        console.log('Regenerating response for message:', messageId);
        // You would call the AI API again and update the message
    };

    const handleThumbsUp = (messageId: string) => {
        console.log('Thumbs up for message:', messageId);
        // Could save feedback to database
    };

    const handleThumbsDown = (messageId: string) => {
        console.log('Thumbs down for message:', messageId);
        // Could save feedback to database
    };

    const handleNewChat = async () => {
        await createSession('New Chat');
    };

    const filteredSessions = sessions.filter(session =>
        session.title.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const groupSessionsByDate = (sessions: typeof filteredSessions) => {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
        const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

        const groups = {
            today: [] as typeof sessions,
            yesterday: [] as typeof sessions,
            week: [] as typeof sessions,
            older: [] as typeof sessions
        };

        sessions.forEach(session => {
            const sessionDate = new Date(session.updated_at);
            if (sessionDate >= today) {
                groups.today.push(session);
            } else if (sessionDate >= yesterday) {
                groups.yesterday.push(session);
            } else if (sessionDate >= weekAgo) {
                groups.week.push(session);
            } else {
                groups.older.push(session);
            }
        });

        return groups;
    };

    const sessionGroups = groupSessionsByDate(filteredSessions);

    const loadMoreSessions = (group: 'today' | 'yesterday' | 'week' | 'older') => {
        setDisplayLimits(prev => ({
            ...prev,
            [group]: prev[group] + 10
        }));
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
            <div className="flex-1 relative">
            {/* Chat Messages Area - Absolute positioned with bottom margin for input */}
            <div className="absolute inset-0 bottom-18 overflow-y-scroll">
                    {chatMessages.length === 0 ? (
                        // Welcome Screen
                        <div className="h-full flex flex-col items-center justify-center p-8 space-y-8">
                            <div className="text-center space-y-4">
                                <h1 className="text-4xl font-semibold text-foreground">
                                    How can I help you, Adam?
                                </h1>
                            </div>

                            {/* Action Buttons */}
                            <div className="flex gap-4">
                                {actionButtons.map((action, index) => (
                                    <Button
                                        key={index}
                                        variant="outline"
                                        className={`flex items-center gap-2 px-4 py-2 ${action.color} border-0`}
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
                                        className="text-left justify-start h-auto p-4 whitespace-normal bg-muted/50 hover:bg-muted"
                                        onClick={() => setInputValue(prompt)}
                                    >
                                        {prompt}
                                    </Button>
                                ))}
                            </div>
                        </div>
                    ) : (
                        // Chat Messages
                        <div className="space-y-6 max-w-4xl mx-auto p-4">
                            {chatMessages.map((message) => (
                                <div key={message.id}>
                                    {message.role === 'user' ? (
                                        // User messages - keep in bubbles on the right
                                        <div className="flex justify-end">
                                            <div className="max-w-[70%] rounded-lg p-4 bg-primary text-primary-foreground">
                                                <p>{message.content}</p>
                                            </div>
                                        </div>
                                    ) : (
                                        // AI messages - unbubbled with Response component
                                        <div className="group space-y-3">
                                            <div className="prose prose-sm max-w-none dark:prose-invert">
                                                <Response>
                                                    {message.content}
                                                </Response>
                                            </div>

                                            {/* Action buttons for AI responses */}
                                            <Actions className="opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                                                <Action
                                                    tooltip="Regenerate response"
                                                    onClick={() => handleRegenerateResponse(message.id)}
                                                >
                                                    <RotateCcw size={16} />
                                                </Action>
                                                <Action
                                                    tooltip="Copy message"
                                                    onClick={() => handleCopyMessage(message.content)}
                                                >
                                                    <Copy size={16} />
                                                </Action>
                                                <Action
                                                    tooltip="Good response"
                                                    onClick={() => handleThumbsUp(message.id)}
                                                >
                                                    <ThumbsUp size={16} />
                                                </Action>
                                                <Action
                                                    tooltip="Bad response"
                                                    onClick={() => handleThumbsDown(message.id)}
                                                >
                                                    <ThumbsDown size={16} />
                                                </Action>
                                            </Actions>
                                        </div>
                                    )}
                                </div>
                            ))}

                            {/* Show reasoning/thinking indicator when loading */}
                            {loading && (
                                <div className="group space-y-3">
                                    <Reasoning isStreaming={loading} defaultOpen={true}>
                                        <ReasoningTrigger>
                                            <div className="flex items-center gap-2 animate-pulse">
                                                <div className="w-2 h-2 bg-primary rounded-full animate-pulse"></div>
                                                <span>Analyzing your financial data...</span>
                                            </div>
                                        </ReasoningTrigger>
                                        <ReasoningContent>
                                            I'm examining your QuickBooks data to provide accurate financial insights and recommendations tailored to your business.
                                        </ReasoningContent>
                                    </Reasoning>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Chat Input - Absolutely positioned at bottom */}
                <div className="absolute bottom-0 left-0 right-0 border-t bg-background p-4">
                    <div className="max-w-4xl mx-auto">
                        <div className="flex gap-2">
                            <div className="flex-1 relative">
                                <Input
                                    value={inputValue}
                                    onChange={(e) => setInputValue(e.target.value)}
                                    placeholder="Type your message here..."
                                    className="pr-12"
                                    onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                                />
                                <Button
                                    size="sm"
                                    className="absolute right-1 top-1 h-8 w-8 p-0"
                                    onClick={handleSendMessage}
                                    disabled={!inputValue.trim()}
                                >
                                    <Send size={14} />
                                </Button>
                            </div>
                        </div>

                        {/* Model Selector */}
                        {/* <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
                            <Badge variant="outline" className="text-xs">
                                GPT-5
                            </Badge>
                            <span>•</span>
                            <span>Optimized for accounting tasks</span>
                        </div> */}
                    </div>
                </div>
            </div>

            {/* Desktop Right Sidebar - Chat History */}
            <div className="w-80 border-l bg-muted/20 flex flex-col flex-shrink-0 overflow-hidden hidden md:flex">
                {/* Sidebar Header */}
                <div className="p-4 border-b">
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                            {qboStatus.connected ? (
                                <Badge variant="default" className="text-xs bg-green-100 text-green-800 border-green-200">
                                    <CheckCircle size={12} className="mr-1" />
                                    {qboStatus.company_name || 'QuickBooks'}
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
                        <Button size="sm" variant="outline">
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
                            <Button
                                size="sm"
                                className="w-full"
                                onClick={handleConnectQuickBooks}
                            >
                                <ExternalLink size={14} className="mr-2" />
                                Connect QuickBooks
                            </Button>
                        </div>
                    ) : (
                        <div className="mb-3 p-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                            <div className="flex items-center justify-between">
                                <div className="text-xs text-green-700 dark:text-green-300">
                                    <div className="font-medium">Connected</div>
                                    <div className="text-green-600 dark:text-green-400">{qboStatus.company_name || 'QuickBooks'}</div>
                                </div>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={handleSyncTransactions}
                                    className="h-7 px-2 text-xs"
                                    disabled={qboStatus.loading}
                                >
                                    {qboStatus.loading && <Loader2 size={12} className="mr-1 animate-spin" />}
                                    Sync Data
                                </Button>
                            </div>
                        </div>
                    )}

                    <Button className="w-full" onClick={handleNewChat}>
                        <Plus size={16} className="mr-2" />
                        New Chat
                    </Button>
                </div>

                {/* Search */}
                <div className="p-4 border-b">
                    <div className="relative">
                        <Search size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
                        <Input
                            placeholder="Search your chats..."
                            className="pl-9"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                </div>

                {/* Chat History */}
                <ScrollArea className="flex-1 min-h-0 max-h-[calc(100vh-325px)]">
                    <div className="p-2">
                        <div className="space-y-1">
                            {loading && <div className="text-sm text-muted-foreground px-2">Loading...</div>}

                            {sessionGroups.today.length > 0 && (
                                <>
                                    <div className="text-xs font-medium text-muted-foreground px-2 py-1">Today</div>
                                    {sessionGroups.today.slice(0, displayLimits.today).map((session) => (
                                        <Card
                                            key={session.id}
                                            className={`p-3 cursor-pointer hover:bg-muted/50 border-0 group ${currentSession?.id === session.id ? 'bg-muted' : 'bg-transparent'
                                                }`}
                                            onClick={() => selectSession(session)}
                                        >
                                            <div className="space-y-1">
                                                <div className="flex items-center justify-between">
                                                    <div className="font-medium text-sm truncate flex-1">{session.title}</div>
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        className="opacity-0 group-hover:opacity-100 h-6 w-6 p-0"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            deleteSession(session.id);
                                                        }}
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
                                    {sessionGroups.today.length > displayLimits.today && (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="w-full mt-2 text-xs text-muted-foreground"
                                            onClick={() => loadMoreSessions('today')}
                                        >
                                            Load {Math.min(10, sessionGroups.today.length - displayLimits.today)} more from today
                                        </Button>
                                    )}
                                </>
                            )}

                            {sessionGroups.yesterday.length > 0 && (
                                <>
                                    <div className="text-xs font-medium text-muted-foreground px-2 py-1 mt-4">Yesterday</div>
                                    {sessionGroups.yesterday.slice(0, displayLimits.yesterday).map((session) => (
                                        <Card
                                            key={session.id}
                                            className={`p-3 cursor-pointer hover:bg-muted/50 border-0 group ${currentSession?.id === session.id ? 'bg-muted' : 'bg-transparent'
                                                }`}
                                            onClick={() => selectSession(session)}
                                        >
                                            <div className="space-y-1">
                                                <div className="flex items-center justify-between">
                                                    <div className="font-medium text-sm truncate flex-1">{session.title}</div>
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        className="opacity-0 group-hover:opacity-100 h-6 w-6 p-0"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            deleteSession(session.id);
                                                        }}
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
                                    {sessionGroups.yesterday.length > displayLimits.yesterday && (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="w-full mt-2 text-xs text-muted-foreground"
                                            onClick={() => loadMoreSessions('yesterday')}
                                        >
                                            Load {Math.min(10, sessionGroups.yesterday.length - displayLimits.yesterday)} more from yesterday
                                        </Button>
                                    )}
                                </>
                            )}

                            {sessionGroups.week.length > 0 && (
                                <>
                                    <div className="text-xs font-medium text-muted-foreground px-2 py-1 mt-4">Last 7 Days</div>
                                    {sessionGroups.week.slice(0, displayLimits.week).map((session) => (
                                        <Card
                                            key={session.id}
                                            className={`p-3 cursor-pointer hover:bg-muted/50 border-0 group ${currentSession?.id === session.id ? 'bg-muted' : 'bg-transparent'
                                                }`}
                                            onClick={() => selectSession(session)}
                                        >
                                            <div className="space-y-1">
                                                <div className="flex items-center justify-between">
                                                    <div className="font-medium text-sm truncate flex-1">{session.title}</div>
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        className="opacity-0 group-hover:opacity-100 h-6 w-6 p-0"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            deleteSession(session.id);
                                                        }}
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
                                    {sessionGroups.week.length > displayLimits.week && (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="w-full mt-2 text-xs text-muted-foreground"
                                            onClick={() => loadMoreSessions('week')}
                                        >
                                            Load {Math.min(10, sessionGroups.week.length - displayLimits.week)} more from this week
                                        </Button>
                                    )}
                                </>
                            )}

                            {sessionGroups.older.length > 0 && (
                                <>
                                    <div className="text-xs font-medium text-muted-foreground px-2 py-1 mt-4">Older</div>
                                    {sessionGroups.older.slice(0, displayLimits.older).map((session) => (
                                        <Card
                                            key={session.id}
                                            className={`p-3 cursor-pointer hover:bg-muted/50 border-0 group ${currentSession?.id === session.id ? 'bg-muted' : 'bg-transparent'
                                                }`}
                                            onClick={() => selectSession(session)}
                                        >
                                            <div className="space-y-1">
                                                <div className="flex items-center justify-between">
                                                    <div className="font-medium text-sm truncate flex-1">{session.title}</div>
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        className="opacity-0 group-hover:opacity-100 h-6 w-6 p-0"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            deleteSession(session.id);
                                                        }}
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
                                    {sessionGroups.older.length > displayLimits.older && (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="w-full mt-2 text-xs text-muted-foreground"
                                            onClick={() => loadMoreSessions('older')}
                                        >
                                            Load {Math.min(10, sessionGroups.older.length - displayLimits.older)} more older chats
                                        </Button>
                                    )}
                                </>
                            )}

                            {!loading && sessions.length === 0 && (
                                <div className="text-sm text-muted-foreground px-2 py-4 text-center">
                                    No chat history yet
                                </div>
                            )}
                        </div>
                    </div>
                </ScrollArea>
            </div>

            {/* Mobile Sidebar Overlay */}
            {sidebarOpen && (
                <div className="md:hidden fixed inset-0 z-30 bg-black/50" onClick={() => setSidebarOpen(false)}>
                    <div className="absolute right-0 top-0 h-full w-80 bg-background border-l flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
                        {/* Mobile Close Button */}
                        <div className="flex justify-between items-center p-4 border-b">
                            <h3 className="font-semibold">Chat History</h3>
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setSidebarOpen(false)}
                            >
                                <X size={20} />
                            </Button>
                        </div>
                        
                        {/* Mobile Sidebar Content - Same as desktop */}
                        <div className="p-4 border-b">
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                    {qboStatus.connected ? (
                                        <Badge variant="default" className="text-xs bg-green-100 text-green-800 border-green-200">
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
                                <Button size="sm" variant="outline">
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
                                    <Button
                                        size="sm"
                                        className="w-full"
                                        onClick={handleConnectQuickBooks}
                                    >
                                        <ExternalLink size={14} className="mr-2" />
                                        Connect QuickBooks
                                    </Button>
                                </div>
                            ) : (
                                <div className="mb-3 p-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                                    <div className="flex items-center justify-between">
                                        <div className="text-xs text-green-700 dark:text-green-300">
                                            <div className="font-medium">Connected</div>
                                            <div className="text-green-600 dark:text-green-400">{qboStatus.company_name || 'QuickBooks'}</div>
                                        </div>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={handleSyncTransactions}
                                            className="h-7 px-2 text-xs"
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
                                    placeholder="Search your chats..."
                                    className="pl-9"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                />
                            </div>
                        </div>

                        {/* Chat History */}
                        <ScrollArea className="flex-1 min-h-0 max-h-[calc(100vh-325px)]">
                            <div className="p-2">
                                <div className="space-y-1">
                                    {loading && <div className="text-sm text-muted-foreground px-2">Loading...</div>}

                                    {sessionGroups.today.length > 0 && (
                                        <>
                                            <div className="text-xs font-medium text-muted-foreground px-2 py-1">Today</div>
                                            {sessionGroups.today.slice(0, displayLimits.today).map((session) => (
                                                <Card
                                                    key={session.id}
                                                    className={`p-3 cursor-pointer hover:bg-muted/50 border-0 group ${currentSession?.id === session.id ? 'bg-muted' : 'bg-transparent'
                                                        }`}
                                                    onClick={() => { selectSession(session); setSidebarOpen(false); }}
                                                >
                                                    <div className="space-y-1">
                                                        <div className="flex items-center justify-between">
                                                            <div className="font-medium text-sm truncate flex-1">{session.title}</div>
                                                            <Button
                                                                size="sm"
                                                                variant="ghost"
                                                                className="opacity-0 group-hover:opacity-100 h-6 w-6 p-0"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    deleteSession(session.id);
                                                                }}
                                                            >
                                                                <Trash2 size={12} />
                                                            </Button>
                                                        </div>
                                                        <div className="text-xs text-muted-foreground truncate">
                                                            {formatTime(new Date(session.updated_at))}
                                                        </div>
                                                    </div>
                                                </Card>
                                            ))}
                                            {sessionGroups.today.length > displayLimits.today && (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="w-full text-xs"
                                                    onClick={() => loadMoreSessions('today')}
                                                >
                                                    Show more from today
                                                </Button>
                                            )}
                                        </>
                                    )}

                                    {sessionGroups.yesterday.length > 0 && (
                                        <>
                                            <div className="text-xs font-medium text-muted-foreground px-2 py-1">Yesterday</div>
                                            {sessionGroups.yesterday.slice(0, displayLimits.yesterday).map((session) => (
                                                <Card
                                                    key={session.id}
                                                    className={`p-3 cursor-pointer hover:bg-muted/50 border-0 group ${currentSession?.id === session.id ? 'bg-muted' : 'bg-transparent'
                                                        }`}
                                                    onClick={() => { selectSession(session); setSidebarOpen(false); }}
                                                >
                                                    <div className="space-y-1">
                                                        <div className="flex items-center justify-between">
                                                            <div className="font-medium text-sm truncate flex-1">{session.title}</div>
                                                            <Button
                                                                size="sm"
                                                                variant="ghost"
                                                                className="opacity-0 group-hover:opacity-100 h-6 w-6 p-0"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    deleteSession(session.id);
                                                                }}
                                                            >
                                                                <Trash2 size={12} />
                                                            </Button>
                                                        </div>
                                                        <div className="text-xs text-muted-foreground truncate">
                                                            {formatTime(new Date(session.updated_at))}
                                                        </div>
                                                    </div>
                                                </Card>
                                            ))}
                                            {sessionGroups.yesterday.length > displayLimits.yesterday && (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="w-full text-xs"
                                                    onClick={() => loadMoreSessions('yesterday')}
                                                >
                                                    Show more from yesterday
                                                </Button>
                                            )}
                                        </>
                                    )}

                                    {sessionGroups.week.length > 0 && (
                                        <>
                                            <div className="text-xs font-medium text-muted-foreground px-2 py-1">This Week</div>
                                            {sessionGroups.week.slice(0, displayLimits.week).map((session) => (
                                                <Card
                                                    key={session.id}
                                                    className={`p-3 cursor-pointer hover:bg-muted/50 border-0 group ${currentSession?.id === session.id ? 'bg-muted' : 'bg-transparent'
                                                        }`}
                                                    onClick={() => { selectSession(session); setSidebarOpen(false); }}
                                                >
                                                    <div className="space-y-1">
                                                        <div className="flex items-center justify-between">
                                                            <div className="font-medium text-sm truncate flex-1">{session.title}</div>
                                                            <Button
                                                                size="sm"
                                                                variant="ghost"
                                                                className="opacity-0 group-hover:opacity-100 h-6 w-6 p-0"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    deleteSession(session.id);
                                                                }}
                                                            >
                                                                <Trash2 size={12} />
                                                            </Button>
                                                        </div>
                                                        <div className="text-xs text-muted-foreground truncate">
                                                            {formatTime(new Date(session.updated_at))}
                                                        </div>
                                                    </div>
                                                </Card>
                                            ))}
                                            {sessionGroups.week.length > displayLimits.week && (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="w-full text-xs"
                                                    onClick={() => loadMoreSessions('week')}
                                                >
                                                    Show more from this week
                                                </Button>
                                            )}
                                        </>
                                    )}

                                    {sessionGroups.older.length > 0 && (
                                        <>
                                            <div className="text-xs font-medium text-muted-foreground px-2 py-1">Older</div>
                                            {sessionGroups.older.slice(0, displayLimits.older).map((session) => (
                                                <Card
                                                    key={session.id}
                                                    className={`p-3 cursor-pointer hover:bg-muted/50 border-0 group ${currentSession?.id === session.id ? 'bg-muted' : 'bg-transparent'
                                                        }`}
                                                    onClick={() => { selectSession(session); setSidebarOpen(false); }}
                                                >
                                                    <div className="space-y-1">
                                                        <div className="flex items-center justify-between">
                                                            <div className="font-medium text-sm truncate flex-1">{session.title}</div>
                                                            <Button
                                                                size="sm"
                                                                variant="ghost"
                                                                className="opacity-0 group-hover:opacity-100 h-6 w-6 p-0"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    deleteSession(session.id);
                                                                }}
                                                            >
                                                                <Trash2 size={12} />
                                                            </Button>
                                                        </div>
                                                        <div className="text-xs text-muted-foreground truncate">
                                                            {formatTime(new Date(session.updated_at))}
                                                        </div>
                                                    </div>
                                                </Card>
                                            ))}
                                            {sessionGroups.older.length > displayLimits.older && (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="w-full text-xs"
                                                    onClick={() => loadMoreSessions('older')}
                                                >
                                                    Show more
                                                </Button>
                                            )}
                                        </>
                                    )}

                                    {!loading && sessions.length === 0 && (
                                        <div className="text-sm text-muted-foreground px-2 py-4 text-center">
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

export default AIAccountant;
