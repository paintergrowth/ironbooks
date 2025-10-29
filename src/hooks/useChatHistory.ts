// src/hooks/useChatHistory.ts
import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAppContext } from '@/contexts/AppContext';
import { useQBOStatus } from '@/hooks/useQBOStatus';

export interface ChatSession {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  user_id: string;
}

export interface ChatMessage {
  id: string;
  session_id: string;
  role: 'user' | 'assistant';
  content: string;
  tokens_in?: number;
  tokens_out?: number;
  cost?: number;
  created_at: string;
}

type UseChatHistoryParams = {
  /** Effective owner for scoping (impersonated OR actual). If omitted, falls back to authed user. */
  ownerUserId?: string;
};

export const useChatHistory = (params: UseChatHistoryParams = {}) => {
  const { user } = useAppContext();
  const qboStatus = useQBOStatus();

  // Scope resolution: prefer effective/impersonated user, else real user
  const effectiveUserId = useMemo(() => params.ownerUserId ?? user?.id ?? null, [params.ownerUserId, user?.id]);

  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSession, setCurrentSession] = useState<ChatSession | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);

  // Whenever the scope changes, reset current session & messages (prevents cross-scope leakage)
  useEffect(() => {
    setCurrentSession(null);
    setMessages([]);
  }, [effectiveUserId]);

  // Load sessions for the effective owner
  const loadSessions = useCallback(async () => {
    if (!effectiveUserId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('chat_sessions')
        .select('*')
        .eq('user_id', effectiveUserId)
        .order('updated_at', { ascending: false });

      if (error) throw error;
      setSessions(data || []);
    } catch (error) {
      console.error('Error loading sessions:', error);
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, [effectiveUserId]);

  useEffect(() => { loadSessions(); }, [loadSessions]);

  // Load messages for current session
  useEffect(() => {
    const loadMessages = async () => {
      if (!currentSession?.id) {
        setMessages([]);
        return;
      }
      try {
        const { data, error } = await supabase
          .from('chat_messages')
          .select('*')
          .eq('session_id', currentSession.id)
          .order('created_at', { ascending: true });

        if (error) throw error;
        setMessages(data || []);
      } catch (error) {
        console.error('Error loading messages:', error);
        setMessages([]);
      }
    };

    loadMessages();
  }, [currentSession?.id]);

  const createSession = async (title: string): Promise<ChatSession | null> => {
    if (!effectiveUserId) return null;

    try {
      const { data, error } = await supabase
        .from('chat_sessions')
        .insert({
          title,
          user_id: effectiveUserId, // write under EFFECTIVE identity
        })
        .select()
        .single();

      if (error) throw error;

      const newSession = data as ChatSession;
      setSessions(prev => [newSession, ...prev]);
      // Let the caller decide when to select; mirrors your current behavior
      return newSession;
    } catch (error) {
      console.error('Error creating session:', error);
      return null;
    }
  };

  const selectSession = (session: ChatSession) => {
    // Guard: avoid selecting a session from another owner scope
    if (session.user_id !== effectiveUserId) {
      console.warn('[useChatHistory] Ignored selecting session from different owner scope.');
      return;
    }
    setCurrentSession(session);
  };

  const saveMessage = async (
    role: 'user' | 'assistant',
    content: string,
    tokens_in = 0,
    tokens_out = 0,
    cost = 0,
    sessionId?: string
  ): Promise<ChatMessage | null> => {
    const targetSessionId = sessionId || currentSession?.id;
    if (!targetSessionId) return null;

    // Optimistic UI
    const tempId = crypto.randomUUID();
    const tempMessage: ChatMessage = {
      id: tempId,
      session_id: targetSessionId,
      role,
      content,
      tokens_in,
      tokens_out,
      cost,
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, tempMessage]);

    try {
      const { data, error } = await supabase
        .from('chat_messages')
        .insert({
          session_id: targetSessionId,
          role,
          content,
          tokens_in,
          tokens_out,
          cost,
        })
        .select()
        .single();

      if (error) throw error;

      const newMessage = data as ChatMessage;

      // Swap optimistic with real
      setMessages(prev => prev.map(m => (m.id === tempId ? newMessage : m)));

      // Update session timestamp
      await supabase
        .from('chat_sessions')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', targetSessionId);

      // Also bump the session in local list (so sorting looks right if you refetch)
      setSessions(prev =>
        prev.map(s => (s.id === targetSessionId ? { ...s, updated_at: new Date().toISOString() } : s))
      );

      return newMessage;
    } catch (error) {
      console.error('Error saving message:', error);
      // Rollback optimistic insert
      setMessages(prev => prev.filter(m => m.id !== tempId));
      return null;
    }
  };

  const updateSessionTitle = async (sessionId: string, title: string) => {
    try {
      const { error } = await supabase
        .from('chat_sessions')
        .update({ title })
        .eq('id', sessionId)
        .eq('user_id', effectiveUserId); // safety: only mutate within scope

      if (error) throw error;

      setSessions(prev =>
        prev.map(s => (s.id === sessionId ? { ...s, title } : s))
      );

      if (currentSession?.id === sessionId) {
        setCurrentSession(prev => (prev ? { ...prev, title } : null));
      }
    } catch (error) {
      console.error('Error updating session title:', error);
    }
  };

  const deleteSession = async (sessionId: string) => {
    try {
      const { error } = await supabase
        .from('chat_sessions')
        .delete()
        .eq('id', sessionId)
        .eq('user_id', effectiveUserId); // safety: only delete within scope

      if (error) throw error;

      setSessions(prev => prev.filter(s => s.id !== sessionId));
      if (currentSession?.id === sessionId) {
        setCurrentSession(null);
        setMessages([]);
      }
    } catch (error) {
      console.error('Error deleting session:', error);
    }
  };

  // Kept for backward-compat (not used by AIAccountant which calls the function directly)
  const callQBOAgent = async (query: string): Promise<{ response: string; metadata?: any }> => {
    // If someone still uses this helper, we run it under the *current authed* user + qboStatus
    const authedUserId = user?.id;
    if (!authedUserId) throw new Error('User not authenticated');

    if (!qboStatus.connected || !qboStatus.realm_id) {
      throw new Error('QuickBooks not connected. Please connect your QuickBooks account to access financial data.');
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('qbo-query-agent', {
        body: {
          query,
          userId: authedUserId,
          realmId: qboStatus.realm_id,
        },
      });

      if (error) {
        if (error.message?.includes('Missing query, realmId, or userId')) {
          throw new Error('QuickBooks connection issue. Please reconnect your account.');
        }
        if (error.message?.includes('qbo_reauth_required')) {
          throw new Error('QuickBooks authorization expired. Please reconnect your account.');
        }
        throw error;
      }

      return {
        response: data.response || "I'm sorry, I couldn't process that query.",
        metadata: data.metadata,
      };
    } catch (error) {
      console.error('QBO Agent error:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  return {
    sessions,
    currentSession,
    messages,
    loading,
    createSession,
    selectSession,
    saveMessage,
    updateSessionTitle,
    deleteSession,
    callQBOAgent, // legacy helper
  };
};
