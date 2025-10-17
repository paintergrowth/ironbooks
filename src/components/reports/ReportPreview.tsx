// src/components/reports/ReportPreview.tsx
import React from 'react';

export const ReportPreview: React.FC<{ title: string; data?: { headers: string[]; rows: string[][] } | null }> = ({ title, data }) => {
  if (!data) return null;
  const { headers, rows } = data;

  return (
    <div className="mt-4 border rounded-lg overflow-auto">
      <div className="px-4 py-2 font-semibold">{title}</div>
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50 dark:bg-gray-800">
          <tr>
            {headers.map((h, i) => (
              <th key={i} className="px-3 py-2 text-left font-medium">{h || `Col ${i+1}`}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 200).map((r, i) => (
            <tr key={i} className={i % 2 ? 'bg-white dark:bg-gray-900' : ''}>
              {headers.map((_, j) => (
                <td key={j} className="px-3 py-1 whitespace-nowrap">{r[j] ?? ''}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > 200 && (
        <div className="p-3 text-xs text-gray-500">Showing first 200 rows…</div>
      )}
    </div>
  );
};
