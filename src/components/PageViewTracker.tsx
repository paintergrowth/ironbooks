// V2
import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { trackPageView } from "@/utils/pageViewTracker";
import { supabase } from "@/lib/supabaseClient";

export function PageViewTracker() {
  const location = useLocation();

  const realmId: string | null = null;
  const actAsUserId: string | null = null;

  useEffect(() => {
    let isCancelled = false;

    async function doTrack() {
      let accessToken: string | null = null;

      if (supabase) {
        // Only try this if client is available
        const { data } = await supabase.auth.getSession();
        accessToken = data.session?.access_token ?? null;
      }

      if (isCancelled) return;

      trackPageView({
        path: location.pathname,
        fullUrl: window.location.href,
        realmId,
        actAsUserId,
        accessToken, // may be null – that's fine
      });
    }

    doTrack();

    return () => {
      isCancelled = true;
    };
  }, [location.pathname, realmId, actAsUserId]);

  return null;
}
