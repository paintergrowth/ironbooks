 // src/components/PageViewTracker.tsx

import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { trackPageView } from "@/utils/pageViewTracker";
import { supabase } from "@/lib/supabaseClient"; // this should already exist in your project

export function PageViewTracker() {
  const location = useLocation();

  // For now we’re not wiring impersonation; keep them null.
  const realmId: string | null = null;
  const actAsUserId: string | null = null;

  useEffect(() => {
    // Track on initial load and every time the pathname changes
    trackPageView({
      supabase,
      path: location.pathname,
      fullUrl: window.location.href,
      realmId,
      actAsUserId,
    });
  }, [location.pathname, realmId, actAsUserId]);

  return null;
}
