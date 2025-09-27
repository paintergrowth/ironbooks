// src/components/AppLayout.tsx
import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

// 🔽 keep your existing imports
import { Button } from './ui/button';
import { Menu, X } from 'lucide-react';
import Sidebar from './Sidebar';
import Dashboard from './Dashboard';
import CFOAgent from './CFOAgent';
import Reports from './Reports';
import AddOns from './AddOns';
import Settings from './Settings';
import AdminPanelComplete from './AdminPanelComplete';
import { supabase } from '@/lib/supabase';

// AFTER (force the exact files you edited)
//import Settings from "../components/Settings";
//import CFOAgent from "../components/CFOAgent";

const AppLayout: React.FC = () => {
  console.log("src/components/AppLayout.tsx live: components/CFOAgent.tsx (QBO card build)");
  const location = useLocation();
  const navigate = useNavigate();

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [reportFilter, setReportFilter] = useState<string | undefined>(undefined);

  // ===========================
  // NEW: Suspension guard
  // - If current session user has profiles.is_active = false:
  //   * sign out
  //   * bounce to /login?suspended=1
  // - Skips while already on /login to avoid loops
  // - Also re-checks on SIGNED_IN / TOKEN_REFRESHED so open tabs get bounced
  // ===========================
  useEffect(() => {
    const isOnLogin = location.pathname.startsWith('/login');

    const checkActive = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session || isOnLogin) return;

        const { data, error } = await supabase
          .from('profiles')
          .select('is_active')
          .eq('id', session.user.id)
          .single();

        if (!error && data && data.is_active === false) {
          try { await supabase.auth.signOut(); } catch {}
          navigate('/login?suspended=1', { replace: true });
        }
      } catch {
        // fail-closed: do nothing to avoid breaking UI
      }
    };

    void checkActive();

    const { data: sub } = supabase.auth.onAuthStateChange(async (event) => {
      if (isOnLogin) return;
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        await checkActive();
      }
    });

    return () => {
      sub?.subscription?.unsubscribe?.();
    };
  }, [location.pathname, navigate]);
  // ===========================
  // END Suspension guard
  // ===========================

  // 🔽 everything below is your existing layout/render logic (unchanged)
  // NOTE: Keep your current JSX for header/sidebar/routes exactly as-is.
  // If you had responsive sidebar handlers, leave them unchanged.

  // Example skeleton (keep your real JSX instead):
  return (
    <div className="min-h-screen flex">
      <Sidebar open={sidebarOpen} setOpen={setSidebarOpen} isMobile={isMobile} />
      <main className="flex-1">
        {/* Your existing top bar / route switcher */}
        {/* Example routes (yours may differ): */}
        {location.pathname === '/' && <Dashboard />}
        {location.pathname.startsWith('/cfo') && <CFOAgent />}
        {location.pathname.startsWith('/reports') && <Reports />}
        {location.pathname.startsWith('/addons') && <AddOns />}
        {location.pathname.startsWith('/settings') && <Settings />}
        {location.pathname.startsWith('/admin') && <AdminPanelComplete />}
      </main>
    </div>
  );
};

export default AppLayout;
