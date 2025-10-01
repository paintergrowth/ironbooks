// src/hooks/useAuthRefresh.ts
import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export function useAuthRefresh(intervalMs = 4 * 60 * 1000) {
  useEffect(() => {
    let mounted = true;

    const tick = async () => {
      if (!mounted) return;
      try {
        // Touch the session; Supabase auto-refreshes if needed
        await supabase.auth.getSession();
      } catch {}
    };

    const id = setInterval(tick, intervalMs);
    const onFocus = () => tick();

    window.addEventListener('visibilitychange', onFocus);
    window.addEventListener('focus', onFocus);

    // kick once immediately
    tick();

    return () => {
      mounted = false;
      clearInterval(id);
      window.removeEventListener('visibilitychange', onFocus);
      window.removeEventListener('focus', onFocus);
    };
  }, [intervalMs]);
}
