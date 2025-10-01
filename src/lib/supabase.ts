// src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js';

/**
 * IMPORTANT
 * You had hard-coded URL/key; I’m keeping them so your env keeps working exactly the same.
 * If you later move to env vars, you can swap these two constants without changing the rest.
 */
const supabaseUrl = 'https://quaeeqgobujsukemkrze.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF1YWVlcWdvYnVqc3VrZW1rcnplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTAzNjY1NDMsImV4cCI6MjA2NTk0MjU0M30.XIrLwtESbBwqXy-jlvflHY2-LN0Dun-Auo6EUshEc0g';

// (optional) logs you already had
console.log('[lib/supabase] url present?', typeof supabaseUrl, !!supabaseUrl);
console.log('[lib/supabase] key length:', (supabaseAnonKey || '').length);

// --- Client with autoRefreshToken enabled (keeps session fresh) ---
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

// -------------------- LOW-LEVEL HELPERS --------------------

/** Base URL for Edge Functions */
export const getFunctionsBaseFromClient = () =>
  `${supabaseUrl.replace(/\/+$/, '')}/functions/v1`;

/** Always build fresh headers (apikey + Bearer) */
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

/** Best-effort refresh */
export const refreshAuth = async () => {
  try {
    const { data, error } = await supabase.auth.refreshSession();
    if (error) throw error;
    return data?.session ?? null;
  } catch {
    return null;
  }
};

// -------------------- SAFE INVOKERS (RECOMMENDED) --------------------

/**
 * New: invokeWithAuthSafe
 * - Adds apikey + Authorization
 * - Retries once after refresh on 401/403
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
      const errPayload = body || { message: `HTTP ${res.status}` };
      return { data: null, error: errPayload };
    }

    return { data: body as T, error: null };
  };

  // first try
  let out = await doCall();

  // retry once on auth errors
  const msg = String(out.error?.message || out.error || '');
  if (out.error && (msg.includes('401') || msg.includes('403'))) {
    await refreshAuth();
    out = await doCall();
  }

  return out;
};

/**
 * New: fetchSSEWithAuth (for streaming responses)
 * - Handles apikey + Authorization
 * - Retries once after refresh on 401/403
 * - Calls onToken for each token chunk, onDone when finished, onError on failure
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

    // Non-SSE JSON fallback handling
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
          // ignore malformed event lines silently
        }
      }
    }
  };

  try {
    await doSSE();
  } catch (err: any) {
    const m = String(err?.message || err);
    if (m.includes('401') || m.includes('403')) {
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

// -------------------- LEGACY EXPORT (back-compat) --------------------
/**
 * You already called this across the app. Keeping it exported so nothing breaks.
 * Recommend migrating your calls to invokeWithAuthSafe for auto-retry.
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
    apikey: supabaseAnonKey, // << add apikey even for legacy path
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
