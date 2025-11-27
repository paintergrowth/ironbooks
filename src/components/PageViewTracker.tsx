// src/components/PageViewTracker.tsx

import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { trackPageView } from "@/utils/pageViewTracker";

export function PageViewTracker() {
  const location = useLocation();

  // For now we’re not wiring impersonation; keep them null.
  const realmId: string | null = null;
  const actAsUserId: string | null = null;

  useEffect(() => {
    trackPageView({
      path: location.pathname,
      fullUrl: window.location.href,
      realmId,
      actAsUserId,
    });
  }, [location.pathname, realmId, actAsUserId]);

  return null;
}
