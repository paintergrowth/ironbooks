import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { trackPageView } from "@/utils/pageViewTracker";
import { supabase } from "@/lib/supabaseClient";

export function PageViewTracker() {
  const location = useLocation();

  const realmId: string | null = null;     // wire later if you want
  const actAsUserId: string | null = null; // wire later for impersonation

  useEffect(() => {
    let isCancelled = false;

    async function doTrack() {
      // Get the current Supabase session (user may or may not be logged in)
      const { data } = await supabase.auth.getSession();
      const accessToken = data.session?.access_token ?? null;

      if (isCancelled) return;

      trackPageView({
        path: location.pathname,
        fullUrl: window.location.href,
        realmId,
        actAsUserId,
        accessToken, // 👈 now we send the token
      });
    }

    doTrack();

    return () => {
      isCancelled = true;
    };
  }, [location.pathname, realmId, actAsUserId]);

  return null;
}
