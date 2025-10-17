// src/lib/qboReports.ts
import { supabase } from '@/lib/supabase';

type Format = 'json' | 'csv' | 'pdf';

function getSupabaseUrl(): string {
  // Prefer env; your logs show it's set (url present? true)
  const envUrl = (import.meta as any)?.env?.VITE_SUPABASE_URL;
  if (typeof envUrl === 'string' && envUrl.length > 0) return envUrl;
  // Fallback (very unlikely needed)
  // @ts-ignore
  const internal = (supabase as any)?._settings?.url || (supabase as any)?._supabaseUrl;
  if (internal) return internal;
  throw new Error('Supabase URL not configured');
}

async function getAuthHeader(): Promise<string> {
  // Use user session token if present, else anon key
  const { data } = await supabase.auth.getSession();
  const userJwt = data.session?.access_token;
  // @ts-ignore
  const anon = (import.meta as any)?.env?.VITE_SUPABASE_ANON_KEY;
  return `Bearer ${userJwt || anon || ''}`;
}

export async function runAdHocReport(args: {
  realmId: string;
  reportName: string;
  params: Record<string, any>;
  format?: Format;
}) {
  const { realmId, reportName, params, format = 'json' } = args;

  if (format === 'json') {
    // JSON preview: invoke is fine and returns parsed JSON directly
    const { data, error } = await supabase.functions.invoke('qbo-run-report', {
      body: { realmId, reportName, params, format: 'json' },
    });
    if (error) throw new Error(error.message || 'Edge error');
    return data; // { raw, normalized }
  }

  // CSV / PDF: use fetch so we can read the error body
  const base = getSupabaseUrl();
  const url = `${base}/functions/v1/qbo-run-report`;
  const auth = await getAuthHeader();

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': auth,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ realmId, reportName, params, format }),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => `HTTP_${resp.status}_NO_BODY`);
    throw new Error(text || `HTTP_${resp.status}`);
  }

  // Ok → Blob (CSV or PDF)
  const blob = await resp.blob();
  return blob;
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
