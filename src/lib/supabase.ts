// src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js';

/**
 * Keep your inline config so nothing else breaks.
 */
const supabaseUrl = 'https://quaeeqgobujsukemkrze.supabase.co';
const supabaseAnonKey =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF1YWVlcWdvYnVqc3VrZW1rcnplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTAzNjY1NDMsImV4cCI6MjA2NTk0MjU0M30.XIrLwtESbBwqXy-jlvflHY2-LN0Dun-Auo6EUshEc0g';

console.log('[lib/supabase] url present?', typeof supabaseUrl, !!supabaseUrl);
console.log('[lib/supabase] key length:', (supabaseAnonKey || '').length);

/**
 * Client with robust auth.
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

/** Functions base URL */
export const getFunctionsBaseFromClient = () =>
  `${supabaseUrl.replace(/\/+$/, '')}/functions/v1`;

/** Fresh headers (apikey + Bearer if available) */
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

/** Forced refresh (best-effort) */
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

// ---------- Proactive repair on tab focus/visibility ----------

let repairing = false;
let lastRepairAt = 0;

/**
 * Ensure session is fresh (debounced).
 * More aggressive: refresh if exp < 2m.
 */
export async function ensureFreshSession(reason: string = 'manual'): Promise<void> {
  const now = Date.now();
  if (repairing || now - lastRepairAt < 600) return; // tighter debounce
  repairing = true;

  try {
    const { data: ses } = await supabase.auth.getSession();

    // If we don't have a session in memory, try to refresh once.
    if (!ses?.session) {
      await supabase.auth.refreshSession();
      return;
    }

    const expSec = ses.session.expires_at ?? 0;
    const expMs = expSec * 1000 - now;
    const nearExpiry = expMs < 120_000; // < 2 minutes

    if (nearExpiry) {
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
    if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
      ensureFreshSession(event.toLowerCase());
    }
  });

  // Initial nudge right after load
  setTimeout(() => ensureFreshSession('initial'), 250);
})();

// -------------------- Safe invokers --------------------

/**
 * Safe invoke for Edge Functions:
 * - Adds apikey + Authorization
 * - Retries once after refresh on auth errors (401/403/expired)
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

  // Preflight: make sure session is fresh before we hit the function
  await ensureFreshSession('invoke-pre');

  // First attempt
  let out = await doCall();

  // Retry once on auth-ish failures
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

    // If server fell back to JSON (no SSE), still deliver the text
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
    // Preflight
    await ensureFreshSession('sse-pre');
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

// -------------------- Legacy export (now safe under the hood) --------------------
/**
 * IMPORTANT: Many places in your app import `invokeWithAuth`.
 * We keep the same name/signature, but route it through the safe path:
 *  - preflight ensureFreshSession
 *  - add apikey + Authorization
 *  - refresh+retry on auth errors
 */
export async function invokeWithAuth<T>(
  name: string,
  opts?: { body?: any; headers?: Record<string, string> }
) {
  // Route through the safe invoker (headers you pass are ignored intentionally;
  // safe invoker builds the correct header set every time).
  const { data, error } = await invokeWithAuthSafe<T>(name, { body: opts?.body });
  return { data, error } as { data: T | null; error: any | null };
}
