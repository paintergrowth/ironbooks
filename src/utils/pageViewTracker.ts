// src/utils/pageViewTracker.ts

const SESSION_KEY = "ib_pageview_session";

function getOrCreateSessionId(): string {
  if (typeof window === "undefined") return "";
  const existing = window.localStorage.getItem(SESSION_KEY);
  if (existing) return existing;

  const newId = "sess_" + Math.random().toString(36).slice(2) + "_" + Date.now();
  window.localStorage.setItem(SESSION_KEY, newId);
  return newId;
}

type TrackPageViewOptions = {
  path: string;
  fullUrl?: string;
  realmId?: string | null;
  actAsUserId?: string | null;
};

export async function trackPageView(opts: TrackPageViewOptions) {
  const { path, fullUrl, realmId, actAsUserId } = opts;

  if (typeof window === "undefined") return;
  if (!path) return;

  const sessionId = getOrCreateSessionId();
  const referrer = document.referrer || "";

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  // NO Authorization header in v1
  if (actAsUserId) {
    headers["x-ib-act-as-user"] = actAsUserId;
  }
  if (realmId) {
    headers["x-ib-act-as-realm"] = realmId;
  }

  const fnBase = import.meta.env.VITE_SUPABASE_FUNCTIONS_URL;
  if (!fnBase) {
    console.warn(
      "VITE_SUPABASE_FUNCTIONS_URL is not set; skipping page view tracking."
    );
    return;
  }

  const fnUrl = `${fnBase}/page-view`;

  // Fire-and-forget
  fetch(fnUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({
      path,
      full_url: fullUrl ?? window.location.href,
      referrer,
      session_id: sessionId,
    }),
    keepalive: true,
  }).catch(() => {
    // ignore tracking errors
  });
}
