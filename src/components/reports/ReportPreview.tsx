// src/components/reports/ReportPreview.tsx
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

type TableData =
  | { headers: string[]; rows: AnyCell[][] }  // rich or plain
  | { headers: string[]; rows: (string | number | null | undefined)[][] }; // legacy

function isRichCell(c: AnyCell): c is RichCell {
  return !!c && typeof c === 'object' && ('text' in c || 'bold' in c || 'indent' in c || 'ruleAbove' in c || 'ruleBelow' in c || 'align' in c);
}

function cellText(c: AnyCell): string {
  if (isRichCell(c)) {
    const t = c.text;
    return (t === null || t === undefined) ? '' : String(t);
  }
  return (c === null || c === undefined) ? '' : String(c);
}

export const ReportPreview: React.FC<{ title: string; data?: TableData | null }> = ({ title, data }) => {
  if (!data) return null;
  const { headers, rows } = data as any;

  // Build per-row decorations (ruleAbove/ruleBelow) if any rich cells are present in the row.
  const rowDecor = rows.map((r: AnyCell[]) => {
    let ruleAbove = false;
    let ruleBelow = false;
    for (const c of r) {
      if (isRichCell(c)) {
        ruleAbove = ruleAbove || !!c.ruleAbove;
        ruleBelow = ruleBelow || !!c.ruleBelow;
      }
    }
    return { ruleAbove, ruleBelow };
  });

  return (
    <div className="mt-4 border rounded-lg overflow-auto">
      <div className="px-4 py-2 font-semibold">{title}</div>
      <table className="min-w-full text-sm border-t">
        <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0 z-10">
          <tr>
            {headers.map((h: string, i: number) => (
              <th key={i} className="px-3 py-2 text-left font-medium border-b">
                {h || `Col ${i+1}`}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 200).map((r: AnyCell[], i: number) => {
            const { ruleAbove, ruleBelow } = rowDecor[i];
            return (
              <tr
                key={i}
                className={[
                  i % 2 ? 'bg-white dark:bg-gray-900' : 'bg-gray-50/40 dark:bg-gray-800/40',
                  ruleAbove ? 'border-t-2 border-gray-300 dark:border-gray-600' : '',
                  ruleBelow ? 'border-b-2 border-gray-300 dark:border-gray-600' : 'border-b border-gray-200 dark:border-gray-700',
                ].join(' ')}
              >
                {headers.map((_, j) => {
                  const c = r[j];
                  const rich = isRichCell(c) ? c : undefined;
                  const text = cellText(c);
                  const indent = rich?.indent ? rich.indent : 0;
                  const isBold = !!rich?.bold;
                  const align = rich?.align || (/^-?\$?[\d,]+(\.\d+)?$/.test(text) ? 'right' : 'left');

                  return (
                    <td
                      key={j}
                      className={`px-3 py-1 whitespace-nowrap align-top`}
                      style={{
                        textAlign: align as any,
                        fontWeight: isBold ? 700 as any : 400 as any,
                      }}
                    >
                      <div
                        className="inline-block"
                        style={{ paddingLeft: indent > 0 ? indent * 16 : 0 }}
                      >
                        {text}
                      </div>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      {rows.length > 200 && (
        <div className="p-3 text-xs text-gray-500">Showing first 200 rows…</div>
      )}
    </div>
  );
};
