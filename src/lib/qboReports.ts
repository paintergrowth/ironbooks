// src/lib/qboReports.ts
import { supabase } from '@/lib/supabase';

type Format = 'json' | 'csv' | 'pdf';

function getSupabaseBaseUrl(): string {
  // 1) Prefer env if present
  const envUrl = (import.meta as any)?.env?.VITE_SUPABASE_URL;
  if (typeof envUrl === 'string' && envUrl.length > 0) return envUrl;

  // 2) Derive from functions client (supabase-js v2 keeps full URL here)
  const fnUrl: string | undefined = (supabase as any)?.functions?.url;
  if (fnUrl && fnUrl.includes('/functions/')) {
    // fnUrl looks like: https://<ref>.supabase.co/functions/v1
    return fnUrl.split('/functions/')[0];
  }

  // 3) Try internal client settings (best-effort fallback)
  const maybe = (supabase as any)?._settings?.url || (supabase as any)?._supabaseUrl;
  if (typeof maybe === 'string' && maybe.length > 0) return maybe;

  throw new Error('Supabase URL not configured');
}

async function getAuthHeader(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const userJwt = data.session?.access_token;
  const anon = (import.meta as any)?.env?.VITE_SUPABASE_ANON_KEY || '';
  return `Bearer ${userJwt || anon}`;
}

export async function runAdHocReport(args: {
  realmId: string;
  reportName: string;
  params: Record<string, any>;
  format?: Format;
}) {
  const { realmId, reportName, params, format = 'json' } = args;

  if (format === 'json') {
    // JSON preview through invoke (parsed JSON)
    const { data, error } = await supabase.functions.invoke('qbo-run-report', {
      body: { realmId, reportName, params, format: 'json' },
    });
    if (error) throw new Error(error.message || 'Edge error');
    return data; // { raw, normalized }
  }

  // CSV / PDF through fetch so we can read the error body verbatim
  const base = getSupabaseBaseUrl();
  const url = `${base}/functions/v1/qbo-run-report`;
  const auth = await getAuthHeader();

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: auth,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ realmId, reportName, params, format }),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => `HTTP_${resp.status}_NO_BODY`);
    throw new Error(text || `HTTP_${resp.status}`);
  }

  return await resp.blob();
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
