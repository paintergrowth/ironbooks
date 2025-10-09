// src/utils/dateRanges.ts
type ApiPeriod = 'this_month' | 'last_month' | 'this_quarter' | 'last_quarter' | 'ytd';
type Mode = 'preset' | 'custom';

interface RangeInput {
  mode: Mode;
  preset: ApiPeriod | null;
  from_date: string | null; // YYYY-MM-DD
  to_date: string | null;   // YYYY-MM-DD
}

export function buildRangePayload(input: RangeInput) {
  // Keep API surface backward compatible: if preset mode => send { period }
  // If custom => send { mode:'custom', from_date, to_date }
  if (input.mode === 'preset' && input.preset) {
    return {
      period: input.preset as ApiPeriod,
      mode: 'preset' as const,
      from_date: null,
      to_date: null,
    };
  }

  // Basic validation/normalization; backend will also validate
  const from = sanitizeDate(input.from_date);
  const to = sanitizeDate(input.to_date);

  return {
    period: undefined,
    mode: 'custom' as const,
    from_date: from,
    to_date: to,
  };
}

function sanitizeDate(d: string | null): string | null {
  if (!d) return null;
  // enforce YYYY-MM-DD (browser date inputs already do this)
  const m = /^\d{4}-\d{2}-\d{2}$/.exec(d.trim());
  return m ? m[0] : null;
}
