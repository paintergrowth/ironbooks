// src/lib/qboReports.ts
import { supabase } from '@/lib/supabase';

type Format = 'json' | 'csv' | 'pdf';

export async function runAdHocReport(args: {
  realmId: string;
  reportName: string;
  params: Record<string, any>;
  format?: Format;
}) {
  const { realmId, reportName, params, format = 'json' } = args;

  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/qbo-run-report`;

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // if you want RLS-protected “who is calling” context, forward the anon JWT:
      'Authorization': `Bearer ${supabase.auth.getSession ? (await supabase.auth.getSession()).data.session?.access_token ?? '' : ''}`,
    },
    body: JSON.stringify({ realmId, reportName, params, format }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Edge error ${resp.status}: ${text}`);
  }

  if (format === 'json') {
    return await resp.json(); // { raw, normalized }
  }

  // CSV/PDF: return Blob so caller can download
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
