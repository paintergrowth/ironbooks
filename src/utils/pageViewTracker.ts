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

export async function trackPageView(opts: {
  supabase: any;  // your Supabase client type
  path: string;
  fullUrl?: string;
  realmId?: string | null;
  actAsUserId?: string | null; // impersonation target if any
}) {
  const { supabase, path, fullUrl, realmId, actAsUserId } = opts;

  if (typeof window === "undefined") return;
  if (!path) return;

  const sessionId = getOrCreateSessionId();
  const referrer = document.referrer || "";

  // Get current auth token (actor_user_id will be decoded in the function)
  const { data } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }
  if (actAsUserId) {
    headers["x-ib-act-as-user"] = actAsUserId;
  }
  if (realmId) {
    headers["x-ib-act-as-realm"] = realmId;
  }

  // Replace with your actual project ref if you want,
  // or use an env var like VITE_SUPABASE_FUNCTIONS_URL
  const fnUrl = `${import.meta.env.VITE_SUPABASE_FUNCTIONS_URL}/page-view`;

  // Fire-and-forget; we don't care about the result on the UI
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
    // ignore errors in tracking
  });
}
