import React from 'react';

type PlainCell = string | number | null | undefined;

type RichCell = {
  text?: string | number;
  bold?: boolean;
  indent?: number;        // 0,1,2,...
  ruleAbove?: boolean;    // draw a separator line above this row
  ruleBelow?: boolean;    // draw a separator line below this row
  align?: 'left' | 'right' | 'center';
};

type AnyCell = PlainCell | RichCell;

type TableLike = { headers: string[]; rows: AnyCell[][] };

type Meta = {
  logoUrl?: string;             // e.g. "/logo-ironbooks.svg" or full https://
  reportName?: string;          // e.g. "Profit and Loss"
  currency?: string;            // e.g. "USD" (for display only)
  locale?: string;              // e.g. "en-US" (for display only)
  paramsUsed?: Record<string, any>; // key/value map of selected parameters
};

function isRichCell(c: AnyCell): c is RichCell {
  return !!c && typeof c === 'object' && (
    'text' in c || 'bold' in c || 'indent' in c || 'ruleAbove' in c || 'ruleBelow' in c || 'align' in c
  );
}

function cellText(c: AnyCell): string {
  if (isRichCell(c)) {
    const t = c.text;
    return (t === null || t === undefined) ? '' : String(t);
  }
  return (c === null || c === undefined) ? '' : String(c);
}

function isNumericString(s: string) {
  // raw numeric like -1234.56 OR already formatted is still right-aligned
  return /^-?\d+(?:\.\d+)?$/.test(s.replace(/[, ]/g, ''));
}

function formatAmountForUI(s: string, locale = 'en-US', currency?: string) {
  if (!isNumericString(s)) return s;
  const num = Number(s.replace(/,/g, ''));
  if (!isFinite(num)) return s;
  // If currency provided, show currency style; else plain number with grouping
  try {
    return currency
      ? new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 2 }).format(num)
      : new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(num);
  } catch {
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(num);
  }
}

const Pill: React.FC<{label: string; value?: string}> = ({ label, value }) => {
  if (value === undefined || value === '') return null;
  return (
    <span className="inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium mr-2 mb-2
                      bg-white/60 dark:bg-slate-900/60 border-slate-200 dark:border-slate-700">
      <span className="text-slate-500 dark:text-slate-400 mr-1">{label}:</span>
      <span className="text-slate-900 dark:text-slate-100">{value}</span>
    </span>
  );
};

export const ReportPreview: React.FC<{
  title: string;
  data?: TableLike | null;
  meta?: Meta; // optional; pass when available
}> = ({ title, data, meta }) => {
  if (!data) return null;
  const { headers, rows } = data;

  const logoUrl = meta?.logoUrl ?? '/ironbooks-logo.svg';
  const reportName = meta?.reportName ?? title;
  const locale = meta?.locale ?? 'en-US';
  const currency = meta?.currency; // optional

  // Precompute row decorations
  const rowDecor = rows.map((r: AnyCell[]) => {
    let ruleAbove = false;
    let ruleBelow = false;
    let anyBold = false;
    for (const c of r) {
      if (isRichCell(c)) {
        ruleAbove = ruleAbove || !!c.ruleAbove;
        ruleBelow = ruleBelow || !!c.ruleBelow;
        anyBold = anyBold || !!c.bold;
      }
    }
    return { ruleAbove, ruleBelow, anyBold };
  });

  return (
    <div className="mt-6 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm bg-white dark:bg-slate-900">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/40">
        <div className="flex items-center space-x-3">
          {logoUrl && (
            <img src={logoUrl} alt="IronBooks" className="h-8 w-auto" onError={(e:any)=>{e.currentTarget.style.display='none';}}/>
          )}
          <div className="text-lg font-semibold tracking-tight">{reportName}</div>
        </div>
        <div className="text-xs text-slate-500">
          Generated {new Date().toLocaleString()}
        </div>
      </div>

      {/* Parameters */}
      {meta?.paramsUsed && Object.keys(meta.paramsUsed).length > 0 && (
        <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
          <div className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-2">Parameters</div>
          <div>
            {Object.entries(meta.paramsUsed).map(([k, v]) => {
              // nice labels: snake_case → Title Case
              const label = k.replace(/_/g, ' ').replace(/\b\w/g, m => m.toUpperCase());
              const value = Array.isArray(v) ? v.join(', ') : (v == null ? '' : String(v));
              return <Pill key={k} label={label} value={value} />;
            })}
            {currency && <Pill label="Currency" value={currency} />}
          </div>
        </div>
      )}

      {/* Table */}
      <div className="overflow-auto">
        <table className="min-w-full text-sm">
          <thead className="sticky top-0 z-10 bg-slate-100 dark:bg-slate-800">
            <tr className="border-b border-slate-200 dark:border-slate-700">
              {headers.map((h, i) => (
                <th key={i} className="px-4 py-2 text-left font-semibold text-slate-700 dark:text-slate-100">
                  {h || `Col ${i+1}`}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 400).map((r: AnyCell[], i: number) => {
              const { ruleAbove, ruleBelow, anyBold } = rowDecor[i];
              return (
                <tr
                  key={i}
                  className={[
                    'border-b',
                    ruleBelow ? 'border-b-2' : 'border-b',
                    ruleAbove ? 'border-t-2' : '',
                    'border-slate-200 dark:border-slate-700',
                    i % 2 ? 'bg-white dark:bg-slate-900' : 'bg-slate-50/40 dark:bg-slate-800/40'
                  ].join(' ')}
                >
                  {headers.map((_, j) => {
                    const c = r[j];
                    const rich = isRichCell(c) ? c : undefined;
                    const rawText = cellText(c);
                    const indent = rich?.indent ? rich.indent : 0;
                    const isBold = anyBold || !!rich?.bold;
                    const inferredAlign = isNumericString(rawText) ? 'right' : 'left';
                    const align = rich?.align || inferredAlign;

                    // UI-only amount formatting (numbers → currency/grouping); CSV remains raw elsewhere
                    const display = (align === 'right')
                      ? formatAmountForUI(rawText, locale, currency)
                      : rawText;

                    return (
                      <td
                        key={j}
                        className="px-4 py-2 whitespace-nowrap align-top text-slate-900 dark:text-slate-100"
                        style={{
                          textAlign: align as any,
                          fontWeight: isBold ? 700 as any : 400 as any,
                        }}
                      >
                        <div
                          className="inline-block"
                          style={{ paddingLeft: indent > 0 ? indent * 18 : 0 }}
                        >
                          {display}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length > 400 && (
          <div className="p-3 text-xs text-slate-500">Showing first 400 rows…</div>
        )}
      </div>
    </div>
  );
};
