// src/hooks/useChatHistory.ts
import { useState, useEffect } from 'react';
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

export const useChatHistory = () => {
  const { user } = useAppContext();
  const qboStatus = useQBOStatus();
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSession, setCurrentSession] = useState<ChatSession | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);

  // Load sessions
  useEffect(() => {
    if (!user?.id) return;
    
    const loadSessions = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('chat_sessions')
          .select('*')
          .eq('user_id', user.id)
          .order('updated_at', { ascending: false });
        
        if (error) throw error;
        setSessions(data || []);
      } catch (error) {
        console.error('Error loading sessions:', error);
      } finally {
        setLoading(false);
      }
    };

    loadSessions();
  }, [user?.id]);

  // Load messages for current session
  useEffect(() => {
    if (!currentSession?.id) {
      setMessages([]);
      return;
    }

    const loadMessages = async () => {
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
      }
    };

    loadMessages();
  }, [currentSession?.id]);

  const createSession = async (title: string): Promise<ChatSession | null> => {
    if (!user?.id) return null;

    try {
      const { data, error } = await supabase
        .from('chat_sessions')
        .insert({
          title,
          user_id: user.id,
        })
        .select()
        .single();
      
      if (error) throw error;
      
      const newSession = data as ChatSession;
      setSessions(prev => [newSession, ...prev]);
      setCurrentSession(newSession);
      return newSession;
    } catch (error) {
      console.error('Error creating session:', error);
      return null;
    }
  };

  const selectSession = (session: ChatSession) => {
    setCurrentSession(session);
  };

  const saveMessage = async (
    role: 'user' | 'assistant',
    content: string,
    tokens_in = 0,
    tokens_out = 0,
    cost = 0
  ): Promise<ChatMessage | null> => {
    if (!currentSession?.id) return null;

    try {
      const { data, error } = await supabase
        .from('chat_messages')
        .insert({
          session_id: currentSession.id,
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
      setMessages(prev => [...prev, newMessage]);
      
      // Update session timestamp
      await supabase
        .from('chat_sessions')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', currentSession.id);
      
      return newMessage;
    } catch (error) {
      console.error('Error saving message:', error);
      return null;
    }
  };

  const updateSessionTitle = async (sessionId: string, title: string) => {
    try {
      const { error } = await supabase
        .from('chat_sessions')
        .update({ title })
        .eq('id', sessionId);
      
      if (error) throw error;
      
      setSessions(prev => 
        prev.map(session => 
          session.id === sessionId ? { ...session, title } : session
        )
      );
      
      if (currentSession?.id === sessionId) {
        setCurrentSession(prev => prev ? { ...prev, title } : null);
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
        .eq('id', sessionId);
      
      if (error) throw error;
      
      setSessions(prev => prev.filter(session => session.id !== sessionId));
      
      if (currentSession?.id === sessionId) {
        setCurrentSession(null);
      }
    } catch (error) {
      console.error('Error deleting session:', error);
    }
  };

  const callQBOAgent = async (query: string): Promise<{ response: string; metadata?: any }> => {
    if (!user?.id) throw new Error('User not authenticated');
    
    // Check QuickBooks connection
    if (!qboStatus.connected || !qboStatus.realm_id) {
      throw new Error('QuickBooks not connected. Please connect your QuickBooks account to access financial data.');
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('qbo-query-agent', {
        body: { 
          query, 
          userId: user.id,
          realmId: qboStatus.realm_id
        }
      });
      
      if (error) {
        // Handle specific error cases
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
        metadata: data.metadata
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
    callQBOAgent,
  };
};
