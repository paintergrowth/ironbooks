// src/utils/pageViewTracker.ts

const SESSION_KEY = "ib_pageview_session";

function getOrCreateSessionId(): string {
  if (typeof window === "undefined") return "";
  const existing = window.localStorage.getItem(SESSION_KEY);
  if (existing) return existing;

  const newId =
    "sess_" + Math.random().toString(36).slice(2) + "_" + Date.now();
  window.localStorage.setItem(SESSION_KEY, newId);
  return newId;
}

type TrackPageViewOptions = {
  path: string;
  fullUrl?: string;

  // Identity coming from the app
  actorUserId?: string | null;      // real logged-in user
  effectiveUserId?: string | null;  // impersonated or same as actor
  realmId?: string | null;          // effective realm
  actorIsImpersonating?: boolean;   // true if viewing as someone else
};

export async function trackPageView(opts: TrackPageViewOptions) {
  const {
    path,
    fullUrl,
    actorUserId,
    effectiveUserId,
    realmId,
    actorIsImpersonating,
  } = opts;

  if (typeof window === "undefined") return;
  if (!path) return;

  const sessionId = getOrCreateSessionId();
  const referrer = document.referrer || "";

  const fnBase = import.meta.env.VITE_SUPABASE_FUNCTIONS_URL;
  if (!fnBase) {
    console.warn(
      "VITE_SUPABASE_FUNCTIONS_URL is not set; skipping page view tracking."
    );
    return;
  }

  const fnUrl = `${fnBase}/page-view`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  // We do NOT need Authorization here – we send IDs explicitly.

  fetch(fnUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({
      path,
      full_url: fullUrl ?? window.location.href,
      referrer,
      session_id: sessionId,

      actor_user_id: actorUserId ?? null,
      effective_user_id: effectiveUserId ?? null,
      realm_id: realmId ?? null,
      actor_is_imp: !!actorIsImpersonating,
    }),
    keepalive: true,
  }).catch(() => {
    // ignore tracking errors
  });
}
