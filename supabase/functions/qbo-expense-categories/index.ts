import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, cache-control',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
};

const QBO_BASE = 'https://quickbooks.api.intuit.com';
const QBO_TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';

// -------- date helpers (unchanged) --------
function todayUTC() {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function formatISO(d: Date) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function startOfMonth(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function startOfYear(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
}

function dateRangesFor(period: string) {
  const now = todayUTC();

  if (period === 'this_month') {
    const start = startOfMonth(now);
    const prevEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
    const prevStart = startOfMonth(prevEnd);
    return {
      start: formatISO(start),
      end: formatISO(now),
      prevStart: formatISO(prevStart),
      prevEnd: formatISO(prevEnd)
    };
  }

  if (period === 'last_month') {
    const lastEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
    const lastStart = startOfMonth(lastEnd);
    const prevEnd = new Date(Date.UTC(lastStart.getUTCFullYear(), lastStart.getUTCMonth(), 0));
    const prevStart = startOfMonth(prevEnd);
    return {
      start: formatISO(lastStart),
      end: formatISO(lastEnd),
      prevStart: formatISO(prevStart),
      prevEnd: formatISO(prevEnd)
    };
  }

  const start = startOfYear(now);
  const prevYearStart = new Date(Date.UTC(now.getUTCFullYear() - 1, 0, 1));
  const prevYearEnd = new Date(Date.UTC(now.getUTCFullYear() - 1, now.getUTCMonth(), now.getUTCDate()));
  return {
    start: formatISO(start),
    end: formatISO(now),
    prevStart: formatISO(prevYearStart),
    prevEnd: formatISO(prevYearEnd)
  };
}

// -------- QBO fetch (unchanged) --------
async function qboFetch(path: string, accessToken: string) {
  const res = await fetch(`${QBO_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json'
    }
  });
  if (!res.ok) {
    const errorText = await res.text();
    console.error('QBO fetch failed:', res.status, errorText);
    throw new Error(`QBO fetch failed: ${res.status} ${errorText}`);
  }
  return res.json();
}

// -------- report parsing (adjusted to prevent double) --------
// Collect only Data rows
function collectDataRows(node: any, acc: any[] = []): any[] {
  if (!node) return acc;
  if (Array.isArray(node)) {
    node.forEach(n => collectDataRows(n, acc));
    return acc;
  }
  if (node.type === 'Data' && node.ColData) {
    acc.push(node);
    return acc;
  }
  if (node.Rows?.Row) collectDataRows(node.Rows.Row, acc);
  return acc;
}

// Match any section whose header contains "Expenses" (e.g., "Operating Expenses", "Other Expenses")
function findExpenseSections(reportJson: any) {
  const rows = reportJson?.Rows?.Row ?? [];
  const sections: any[] = [];

  const walk = (n: any) => {
    if (!n) return;
    if (Array.isArray(n)) {
      n.forEach(walk);
      return;
    }
    const header = (n?.Header?.ColData?.[0]?.value ?? '').trim();
    if (n?.type === 'Section' && /Expenses|Cost of Goods Sold/i.test(header)) {
      sections.push(n);
    }
    //if (n?.Rows?.Row) walk(n.Rows.Row);
  };
  walk(rows);
  return sections;
}

// Robust number parse
function toNum(v: any): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const n = Number(v.replace(/,/g, ''));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

// ✅ Aggregate by Account ID (digits from ColData[0].id). Skip totals/subtotals.
function parseExpensesByAccount(reportJson: any) {
  const sections = findExpenseSections(reportJson);
  const byId = new Map<string, { name: string; amount: number }>();

  for (const sec of sections) {
    const dataRows = collectDataRows(sec);
    for (const r of dataRows) {
      const cols = r.ColData ?? [];
      const first = cols?.[0] ?? {};
      const name = (first?.value ?? '').trim();

      if (!name) continue;

      // Skip subtotal/total lines present as Data rows in some layouts
      if (/^(total|subtotal)\s/i.test(name)) continue;

      // Extract a numeric Account ID (QBO often uses numeric id; sometimes "Account:123")
      const idRaw = String(first?.id ?? '');
      const idDigits = idRaw.match(/\d+/)?.[0] || null;
      if (!idDigits) continue; // only count real accounts

      // Amount is the last column value for that row
      const last = cols[cols.length - 1];
      const amt = toNum(last?.value);

      const prev = byId.get(idDigits)?.amount ?? 0;
      byId.set(idDigits, {
        name,
        amount: prev + amt
      });
    }
  }

  // Sum unique accounts only
  let total = 0;
  for (const v of byId.values()) total += v.amount;

  return { total, byId };
}

// -------- main handler (kept same flow) --------
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    console.log('qbo-expense-categories: Starting request');
    
    const { period = 'this_month' } = await req.json().catch(() => ({}));
    console.log('qbo-expense-categories: Period:', period);

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const qbClientId = Deno.env.get('QBO_CLIENT_ID');
    const qbClientSecret = Deno.env.get('QBO_CLIENT_SECRET');

    if (!supabaseUrl || !serviceKey || !qbClientId || !qbClientSecret) {
      console.error('qbo-expense-categories: Missing required environment variables');
      return new Response(JSON.stringify({ error: 'missing_env_vars' }), {
        status: 500,
        headers: corsHeaders
      });
    }

    const authHeader = req.headers.get('Authorization') || '';
    console.log('qbo-expense-categories: Auth header present:', !!authHeader);
    
    if (!authHeader) {
      console.error('qbo-expense-categories: No authorization header');
      return new Response(JSON.stringify({ error: 'no_authorization' }), {
        status: 401,
        headers: corsHeaders
      });
    }

    const supabaseUser = createClient(supabaseUrl, anonKey!, {
      global: {
        headers: {
          Authorization: authHeader
        }
      }
    });

    const { data: userData, error: userError } = await supabaseUser.auth.getUser();
    console.log('qbo-expense-categories: User lookup:', { 
      hasUser: !!userData?.user, 
      userId: userData?.user?.id,
      error: userError?.message 
    });
    
    const userId = userData?.user?.id;
    if (!userId) {
      console.error('qbo-expense-categories: User not authenticated');
      return new Response(JSON.stringify({
        error: 'not_authenticated',
        detail: userError?.message
      }), {
        status: 401,
        headers: corsHeaders
      });
    }

    const supabase = createClient(supabaseUrl, serviceKey);
    const { data: prof, error: profErr } = await supabase
      .from('profiles')
      .select('qbo_realm_id')
      .eq('id', userId)
      .single();

    console.log('qbo-expense-categories: Profile lookup:', {
      hasProfile: !!prof,
      realmId: prof?.qbo_realm_id,
      error: profErr?.message
    });

    if (profErr || !prof?.qbo_realm_id) {
      console.error('qbo-expense-categories: No QBO realm ID');
      return new Response(JSON.stringify({
        error: 'no_qbo_realm',
        detail: profErr?.message
      }), {
        status: 400,
        headers: corsHeaders
      });
    }

    const realmId = prof.qbo_realm_id;
    console.log('qbo-expense-categories: Using realm ID:', realmId);

    const { data: tok } = await supabase
      .from('qbo_tokens')
      .select('access_token, refresh_token, access_expires_at')
      .eq('user_id', userId)
      .eq('realm_id', realmId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    console.log('qbo-expense-categories: Token lookup:', {
      hasTokens: !!tok,
      hasAccessToken: !!tok?.access_token,
      hasRefreshToken: !!tok?.refresh_token
    });

    if (!tok?.access_token) {
      console.error('qbo-expense-categories: No QBO tokens');
      return new Response(JSON.stringify({
        error: 'no_qbo_tokens'
      }), {
        status: 400,
        headers: corsHeaders
      });
    }

    let accessToken = tok.access_token;
    const expAt = tok.access_expires_at ? new Date(tok.access_expires_at) : null;
    const soon = expAt ? expAt.getTime() - Date.now() < 60_000 : true;
    
    console.log('qbo-expense-categories: Token status:', {
      expiresAt: expAt?.toISOString(),
      needsRefresh: soon
    });

    if (soon && tok.refresh_token) {
      console.log('qbo-expense-categories: Refreshing access token');
      
      const auth = btoa(`${qbClientId}:${qbClientSecret}`);
      const form = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: tok.refresh_token
      });

      const r = await fetch(QBO_TOKEN_URL, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: form
      });

      if (r.ok) {
        const j = await r.json();
        accessToken = j.access_token;
        const newRefresh = j.refresh_token ?? tok.refresh_token;
        const expiresIn = Number(j.expires_in ?? 3600);
        const newExp = new Date(Date.now() + expiresIn * 1000).toISOString();
        
        console.log('qbo-expense-categories: Token refreshed successfully');

        await supabase.from('qbo_tokens').update({
          access_token: accessToken,
          refresh_token: newRefresh,
          access_expires_at: newExp
        }).eq('user_id', userId).eq('realm_id', realmId);
      } else {
        const errorText = await r.text();
        console.error('qbo-expense-categories: Token refresh failed:', r.status, errorText);
        return new Response(JSON.stringify({
          error: 'token_refresh_failed',
          status: r.status,
          detail: errorText
        }), {
          status: 500,
          headers: corsHeaders
        });
      }
    }

    const { start, end, prevStart, prevEnd } = dateRangesFor(period);
    console.log('qbo-expense-categories: Date ranges:', { start, end, prevStart, prevEnd });

    // P&L – keep minorversion same as your working one (70)
    console.log('qbo-expense-categories: Fetching current period P&L');
    const currJson = await qboFetch(
      `/v3/company/${realmId}/reports/ProfitAndLoss?start_date=${start}&end_date=${end}&accounting_method=Accrual&minorversion=70`,
      accessToken
    );

    console.log('qbo-expense-categories: Fetching previous period P&L');
    const prevJson = await qboFetch(
      `/v3/company/${realmId}/reports/ProfitAndLoss?start_date=${prevStart}&end_date=${prevEnd}&accounting_method=Accrual&minorversion=70`,
      accessToken
    );

    // ✅ aggregate by accountId to avoid double-count
    const { total: totalCurr, byId: currBy } = parseExpensesByAccount(currJson);
    const { total: totalPrev, byId: prevBy } = parseExpensesByAccount(prevJson);
    
    console.log('qbo-expense-categories: Parsed expenses:', {
      currentTotal: totalCurr,
      previousTotal: totalPrev,
      currentAccounts: currBy.size,
      previousAccounts: prevBy.size
    });

    const allIds = new Set([...currBy.keys(), ...prevBy.keys()]);
    const categories = Array.from(allIds).map(id => {
      const current = currBy.get(id)?.amount ?? 0;
      const previous = prevBy.get(id)?.amount ?? 0;
      const name = currBy.get(id)?.name ?? prevBy.get(id)?.name ?? `Account ${id}`;
      const share = totalCurr > 0 ? current / totalCurr : 0;

      return {
        name,
        accountId: id,
        current,
        previous,
        share
      };
    }).sort((a, b) => b.current - a.current);

    console.log('qbo-expense-categories: Request completed successfully, categories:', categories.length);

    return new Response(JSON.stringify({
      period,
      total: {
        current: totalCurr,
        previous: totalPrev
      },
      categories,
      lastSyncAt: currJson?.Header?.Time
    }), {
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });

  } catch (e: any) {
    console.error('qbo-expense-categories error:', e?.message || e);
    return new Response(JSON.stringify({
      error: 'server_error',
      detail: String(e?.message || e)
    }), {
      status: 500,
      headers: corsHeaders
    });
  }
});
