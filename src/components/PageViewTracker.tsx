// src/components/PageViewTracker.tsx

import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { trackPageView } from "@/utils/pageViewTracker";
import { supabase } from "@/lib/supabase";
import { useEffectiveIdentity } from "@/lib/impersonation";

export function PageViewTracker() {
  const location = useLocation();

  // This is YOUR canonical identity/realm hook (already used in Dashboard, Reports, etc.)
  const { userId: effectiveUserId, realmId, isImpersonating, target } =
    useEffectiveIdentity?.() ?? {
      userId: null,
      realmId: null,
      isImpersonating: false,
      target: null,
    };

  useEffect(() => {
    let cancelled = false;

    async function doTrack() {
      // Real logged-in user (actor)
      let actorUserId: string | null = null;

      try {
        const { data, error } = await supabase.auth.getUser();
        if (error) {
          console.warn("[PageViewTracker] getUser error:", error.message);
        }
        actorUserId = data?.user?.id ?? null;
      } catch (e) {
        console.warn("[PageViewTracker] getUser threw:", e);
      }

      if (cancelled) return;

      await trackPageView({
        path: location.pathname,
        fullUrl: window.location.href,

        actorUserId,             // real auth user
        effectiveUserId,         // from impersonation hook (may be same as actor)
        realmId,                 // same realm as Dashboard/Reports
        actorIsImpersonating: !!isImpersonating,
      });
    }

    doTrack();

    return () => {
      cancelled = true;
    };
  }, [location.pathname, realmId, effectiveUserId, isImpersonating]);

  return null;
}
