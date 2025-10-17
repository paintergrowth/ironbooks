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

  if (format === 'json') {
    const { data, error } = await supabase.functions.invoke('qbo-run-report', {
      body: { realmId, reportName, params, format: 'json' },
    });
    if (error) throw new Error(error.message || 'Edge error');
    return data; // { raw, normalized }
  }

  // CSV or PDF -> request a Blob back
  const { data, error } = await supabase.functions.invoke('qbo-run-report', {
    body: { realmId, reportName, params, format },
    // supabase-js v2 supports responseType for invoke
    responseType: 'blob',
  } as any);
  if (error) throw new Error(error.message || 'Edge error');
  return data as Blob;
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
