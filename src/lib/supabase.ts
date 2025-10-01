// src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js';

/**
 * Keeps your current inline config so nothing else changes.
 * (You can move these to envs later without touching the rest.)
 */
const supabaseUrl = 'https://quaeeqgobujsukemkrze.supabase.co';
const supabaseAnonKey =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF1YWVlcWdvYnVqc3VrZW1rcnplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTAzNjY1NDMsImV4cCI6MjA2NTk0MjU0M30.XIrLwtESbBwqXy-jlvflHY2-LN0Dun-Auo6EUshEc0g';

console.log('[lib/supabase] url present?', typeof supabaseUrl, !!supabaseUrl);
console.log('[lib/supabase] key length:', (supabaseAnonKey || '').length);

/**
 * Create client with robust auth behavior.
 * - persistSession + autoRefreshToken: keeps JWTs fresh
 * - detectSessionInUrl: handles OAuth redirects
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
  },
});

// -------------------- Helpers --------------------

/** Base URL for Edge Functions */
export const getFunctionsBaseFromClient = () =>
  `${supabaseUrl.replace(/\/+$/, '')}/functions/v1`;

/** Build fresh headers (apikey + Bearer if we have it) */
export const getAuthHeaders = async () => {
  const { data } = await supabase.auth.getSession();
  const accessToken = data?.session?.access_token ?? '';
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    apikey: supabaseAnonKey,
  };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  return headers;
};

/** Best-effort forced refresh */
export const refreshAuth = async () => {
  try {
    const { data, error } = await supabase.auth.refreshSession();
    if (error) throw error;
    return data?.session ?? null;
  } catch (e) {
    console.warn('[auth] refresh failed:', e);
    return null;
  }
};

// ---------- Tab focus/visibility: ensure fresh session ASAP ----------

let repairing = false;
let lastRepairAt = 0;

/** Proactively ensure session is fresh (debounced) */
export async function ensureFreshSession(reason: string = 'manual'): Promise<void> {
  const now = Date.now();
  if (repairing || now - lastRepairAt < 800) return; // debounce common double-fires
  repairing = true;

  try {
    const { data: ses } = await supabase.auth.getSession();

    if (!ses?.session) {
      // If memory has no session, try refresh (no-op if no refresh token)
      await supabase.auth.refreshSession();
      return;
    }

    // If token will expire in < 60s, refresh now
    const expMs = (ses.session.expires_at ? ses.session.expires_at * 1000 : 0) - now;
    if (expMs < 60_000) {
      await supabase.auth.refreshSession();
    }
  } catch (e) {
    console.warn('[auth-repair]', reason, 'failed:', e);
  } finally {
    lastRepairAt = Date.now();
    repairing = false;
  }
}

(function attachGuards() {
  if (typeof window === 'undefined') return;
  if ((window as any).__sb_auth_guards_attached__) return;
  (window as any).__sb_auth_guards_attached__ = true;

  const onVisible = () => { if (!document.hidden) ensureFreshSession('visibility'); };
  const onFocus = () => ensureFreshSession('focus');

  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('focus', onFocus);

  supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
      ensureFreshSession(event.toLowerCase());
    }
  });

  // Initial nudge shortly after app loads
  setTimeout(() => ensureFreshSession('initial'), 300);
})();

// -------------------- Safe invokers (recommended) --------------------

/**
 * Safe invoke for Edge Functions:
 * - Adds apikey + Authorization
 * - Retries once after a refresh on 401/403/expired-ish messages
 */
export const invokeWithAuthSafe = async <T = any>(
  fnName: string,
  opts?: { body?: any; method?: 'POST' | 'GET' | 'PUT' | 'PATCH' | 'DELETE' }
): Promise<{ data: T | null; error: any | null }> => {
  const url = `${getFunctionsBaseFromClient()}/${fnName}`;

  const doCall = async () => {
    const headers = await getAuthHeaders();
    const res = await fetch(url, {
      method: opts?.method || 'POST',
      headers,
      body: opts?.method === 'GET' ? undefined : JSON.stringify(opts?.body ?? {}),
    });

    if (res.status === 204) return { data: null, error: null };

    const ctype = res.headers.get('content-type') || '';
    const body = ctype.includes('application/json')
      ? await res.json().catch(() => null)
      : await res.text();

    if (!res.ok) {
      const payload = body || { message: `HTTP ${res.status}` };
      return { data: null, error: payload };
    }
    return { data: body as T, error: null };
  };

  // First try
  let out = await doCall();

  // Retry once if it smells like auth
  const msg = String(out.error?.message || out.error || '');
  if (
    out.error &&
    (/401|403/i.test(msg) ||
      /unauthorized|authorization|expired|jwt|invalid token|qbo_reauth_required/i.test(msg))
  ) {
    await refreshAuth();
    out = await doCall();
  }

  return out;
};

/**
 * Streaming (SSE) invoker with the same retry semantics.
 * Calls onToken for each chunk, onDone when finished, onError on failure.
 */
export const fetchSSEWithAuth = async (
  fnNameOrUrl: string,
  body: any,
  onToken: (chunk: string) => void,
  onDone: () => void,
  onError: (err: Error) => void
) => {
  const isUrl = /^https?:\/\//i.test(fnNameOrUrl);
  const url = isUrl ? fnNameOrUrl : `${getFunctionsBaseFromClient()}/${fnNameOrUrl}`;

  const doSSE = async () => {
    const headers = await getAuthHeaders();
    headers['Accept'] = 'text/event-stream';

    const resp = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body ?? {}),
    });

    if (!resp.ok) {
      const txt = await resp.text().catch(() => '');
      throw new Error(txt || `HTTP ${resp.status}`);
    }

    // Fallback: non-SSE JSON
    const ctype = resp.headers.get('content-type') || '';
    if (ctype.includes('application/json')) {
      const json = await resp.json().catch(() => null);
      const text = (json?.response && typeof json.response === 'string') ? json.response : '';
      if (text) onToken(text);
      onDone();
      return;
    }

    if (!resp.body) throw new Error('No response body for streaming');

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let done = false;

    while (!done) {
      const { value, done: d } = await reader.read();
      done = d;
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done });

      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const raw of lines) {
        const line = raw.trim();
        if (!line.startsWith('data:')) continue;

        try {
          const payload = JSON.parse(line.slice(5).trim());
          if (payload?.type === 'token') onToken(payload.content || '');
          else if (payload?.type === 'done') onDone();
          else if (payload?.type === 'error') throw new Error(payload.message || 'stream error');
        } catch {
          // ignore malformed event lines
        }
      }
    }
  };

  try {
    await doSSE();
  } catch (err: any) {
    const m = String(err?.message || err);
    if (/401|403/i.test(m) || /unauthorized|authorization|expired|jwt/i.test(m)) {
      await refreshAuth();
      try {
        await doSSE();
        return;
      } catch (err2: any) {
        onError(err2);
        return;
      }
    }
    onError(err);
  }
};

// -------------------- Legacy export (kept for back-compat) --------------------
/**
 * You already import/use this in multiple places.
 * We keep it working, but now it also adds `apikey` automatically.
 * Prefer moving to `invokeWithAuthSafe` so you get refresh+retry.
 */
export async function invokeWithAuth<T>(
  name: string,
  opts?: { body?: any; headers?: Record<string, string> }
) {
  const { data: s } = await supabase.auth.getSession();
  const access = s?.session?.access_token;
  console.log(`invokeWithAuth(${name}): session available:`, !!s?.session);
  console.log(`invokeWithAuth(${name}): access token available:`, !!access);

  const headers = {
    ...(opts?.headers ?? {}),
    ...(access ? { Authorization: `Bearer ${access}` } : {}),
    apikey: supabaseAnonKey,
  };

  try {
    const result = await supabase.functions.invoke<T>(name, { ...opts, headers });
    console.log(`invokeWithAuth(${name}): result:`, result);
    return result;
  } catch (error) {
    console.error(`invokeWithAuth(${name}): error:`, error);
    throw error;
  }
}
