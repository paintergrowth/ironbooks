import React, { createContext, useContext, useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid'; // (kept; safe even if unused in your tsconfig)
import { toast } from '@/components/ui/use-toast'; // (kept; safe even if unused)
import { supabase } from '@/lib/supabase';
import type { User } from '@supabase/supabase-js';

interface AppContextType {
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  selectedOrgId: string | null;
  setSelectedOrgId: (orgId: string) => void;
  user: User | null;
  loading: boolean;
  logout: () => Promise<void>;
  setUser: (user: User | null) => void;
  isDemo: boolean;
}

const defaultAppContext: AppContextType = {
  sidebarOpen: false,
  toggleSidebar: () => {},
  selectedOrgId: null,
  setSelectedOrgId: () => {},
  user: null,
  loading: true,
  logout: async () => {},
  setUser: () => {},
  isDemo: false,
};

const AppContext = createContext<AppContextType>(defaultAppContext);

export const useAppContext = () => useContext(AppContext);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // ⛔️ Do not default to a demo org; let it be null unless user picks one
  const [selectedOrgId, setSelectedOrgIdState] = useState<string | null>(
    localStorage.getItem('selectedOrgId') || null
  );

  const [user, setUserState] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isDemo, setIsDemo] = useState(false);

  useEffect(() => {
    // If a demo user was stored, show it immediately — but DO NOT early-return.
    const demoUser = localStorage.getItem('demoUser');
    if (demoUser) {
      try {
        setUserState(JSON.parse(demoUser));
        setIsDemo(true);
      } catch {
        // ignore parse errors and fall through
      }
    }

    // Always check for a real Supabase session and override demo if found
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUserState(session.user as unknown as User);
        setIsDemo(false);
        localStorage.removeItem('demoUser');
      }
      setLoading(false);
    });

    // Keep session in sync; also overrides demo if a real session appears
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUserState(session.user as unknown as User);
        setIsDemo(false);
        localStorage.removeItem('demoUser');
      } else {
        setUserState(null);
      }
      setLoading(false);
    });

    return () => {
      subscription?.unsubscribe();
    };
  }, []);

  const toggleSidebar = () => setSidebarOpen(prev => !prev);

  const setSelectedOrgId = (orgId: string) => {
    setSelectedOrgIdState(orgId);
    localStorage.setItem('selectedOrgId', orgId);
  };

  // Ensure calling setUser with a real user exits demo mode
  const setUser = (u: User | null) => {
    setUserState(u);
    if (!u) {
      setIsDemo(false);
      localStorage.removeItem('demoUser');
      return;
    }
    if ((u as any).id === 'demo-user') {
      setIsDemo(true);
      localStorage.setItem('demoUser', JSON.stringify(u));
    } else {
      setIsDemo(false);
      localStorage.removeItem('demoUser');
    }
  };

  // Clear demo properly; still sign out real users
  const logout = async () => {
    const wasDemo = isDemo;
    localStorage.removeItem('demoUser');
    setIsDemo(false);
    setUserState(null);

    if (!wasDemo) {
      await supabase.auth.signOut();
    }
    localStorage.removeItem('selectedOrgId');
  };

  return (
    <AppContext.Provider
      value={{
        sidebarOpen,
        toggleSidebar,
        selectedOrgId,
        setSelectedOrgId,
        user,
        loading,
        logout,
        setUser,
        isDemo,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};
