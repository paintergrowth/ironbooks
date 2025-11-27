// src/components/PageViewTracker.tsx

import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { trackPageView } from "../utils/pageViewTracker";
import { useSupabaseClient } from "../your-supabase-hooks"; // adapt
import { useImpersonation } from "../your-impersonation-context"; // adapt

export function PageViewTracker() {
  const location = useLocation();
  const supabase = useSupabaseClient();

  // However you store impersonation context in the app:
  const { actAsUserId, realmId } = useImpersonation() || {
    actAsUserId: null,
    realmId: null,
  };

  useEffect(() => {
    if (!supabase) return;

    trackPageView({
      supabase,
      path: location.pathname,
      fullUrl: window.location.href,
      realmId,
      actAsUserId,
    });

  }, [location.pathname, supabase, realmId, actAsUserId]);

  return null; // this component renders nothing
}
