// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.1";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, cache-control, x-supabase-api-version"
};

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      ...cors
    }
  });
}

function secsFromNowToIso(secs?: number) {
  const ms = Date.now() + Math.max(0, (secs ?? 0) - 60) * 1000; // 60s cushion
  return new Date(ms).toISOString();
}

function startEndForPeriod(period: string) {
  const today = new Date();
  const y = today.getFullYear();
  const m = today.getMonth(); // 0-11
  const pad = (n: number) => String(n).padStart(2, "0");

  if (period === "this_month") {
    const start = `${y}-${pad(m + 1)}-01`;
    const end = `${y}-${pad(m + 1)}-${pad(new Date(y, m + 1, 0).getDate())}`;
    return { start, end };
  }

  if (period === "last_month") {
    const last = new Date(y, m, 0);
    const ly = last.getFullYear();
    const lm = last.getMonth();
    const start = `${ly}-${pad(lm + 1)}-01`;
    const end = `${ly}-${pad(lm + 1)}-${pad(new Date(ly, lm + 1, 0).getDate())}`;
    return { start, end };
  }

    if (period === "this_year") {
    const start = `${y}-01-01`;
    const end = `${y}-${pad(m + 1)}-${pad(today.getDate())}`;
    return { start, end };
  }

  if (period === "last_year") {
    const ly = y - 1;
    const start = `${ly}-01-01`;
    const end = `${ly}-12-31`;
    return { start, end };
  }

  const start = `${y}-01-01`;
  const end = `${y}-${pad(m + 1)}-${pad(today.getDate())}`;
  return { start, end };
}

function toNumber(v: any, def = 0) {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : def;
}

/**
 * Totals from QBO P&L:
 * revenue = Income + Other Income
 * netIncome = QuickBooks "Net Income"
 * expenses = revenue - netIncome   // equals COGS + Expenses + Other Expenses
 */
function pickReportTotals(reportJson: any) {
  try {
    const rows = reportJson?.Rows?.Row ?? [];
    let income = 0, otherIncome = 0, netIncome = 0;

    const scan = (arr: any[]) => {
      for (const r of arr) {
        const summary = r?.Summary;
        const kids = r?.Rows?.Row;

        if (summary?.ColData && Array.isArray(summary.ColData)) {
          const label = String(summary.ColData[0]?.value ?? summary.ColData[0]?.id ?? "").toLowerCase();
          const amount = Number(summary.ColData.at(-1)?.value ?? 0);

          if (label.includes("net") && label.includes("income")) netIncome = amount;
          else if (label.includes("other income")) otherIncome = amount;
          else if (label === "income" || label.includes("total income")) income = amount;
        }

        if (Array.isArray(kids)) scan(kids);
      }
    };

    scan(rows);

    const revenue = toNumber(income, 0) + toNumber(otherIncome, 0);
    const net = toNumber(netIncome, 0);
    // Core change: derive "all expenses" from revenue and net income
    const expenses = revenue - net;

    return { revenue, expenses, net };
  } catch {
    return { revenue: 0, expenses: 0, net: 0 };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    console.log("qbo-dashboard: Starting request");
    
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const QBO_CLIENT_ID = Deno.env.get("QBO_CLIENT_ID");
    const QBO_CLIENT_SECRET = Deno.env.get("QBO_CLIENT_SECRET");
    const QBO_API_BASE = Deno.env.get("QBO_API_BASE") ?? "https://quickbooks.api.intuit.com";

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !QBO_CLIENT_ID || !QBO_CLIENT_SECRET) {
      console.error("qbo-dashboard: Missing required environment variables");
      return json({ error: "missing_env_vars" }, 500);
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    // Identify the user (supabase-js sends the JWT automatically)
    const bearer = req.headers.get("authorization") ?? "";
    console.log("qbo-dashboard: Auth header present:", !!bearer);
    
    if (!bearer) {
      console.error("qbo-dashboard: No authorization header");
      return json({ error: "no_authorization" }, 401);
    }
    
    const accessJwt = bearer.replace(/^Bearer\s+/i, "");
    const { data: userData, error: userError } = await supabase.auth.getUser(accessJwt);
    
    console.log("qbo-dashboard: User lookup result:", { 
      hasUser: !!userData?.user, 
      userId: userData?.user?.id,
      error: userError?.message 
    });
    
    const userId = userData?.user?.id;
    if (!userId) {
      console.error("qbo-dashboard: Unauthorized - no user ID");
      return json({ error: "unauthorized", detail: userError?.message }, 401);
    }

    let body: any = {};
    try {
      body = await req.json();
    } catch {}

    const allowed = new Set(["this_month", "last_month", "ytd", "this_year", "last_year"]);
    const period = allowed.has(body?.period) ? body.period : "this_month";
    console.log("qbo-dashboard: Using period:", period);

    // Get this user's realmId
    const { data: profile, error: pErr } = await supabase
      .from("profiles")
      .select("qbo_realm_id")
      .eq("id", userId)
      .single();

    console.log("qbo-dashboard: Profile lookup:", { 
      hasProfile: !!profile, 
      realmId: profile?.qbo_realm_id,
      error: pErr?.message 
    });

    if (pErr) {
      console.error("qbo-dashboard: Profile lookup failed:", pErr.message);
      return json({ error: "profile_lookup_failed", details: pErr.message }, 500);
    }

    const realmId = profile?.qbo_realm_id;
    if (!realmId) {
      console.log("qbo-dashboard: No QBO realm ID, returning disconnected state");
      return json({
        connected: false,
        revenue: { current: null, previous: null },
        expenses: { current: null, previous: null },
        netProfit: { current: null, previous: null },
        ytdSeries: [],
        lastSyncAt: null
      });
    }

    // Load tokens
    const { data: tokenRow, error: tErr } = await supabase
      .from("qbo_tokens")
      .select("*")
      .eq("user_id", userId)
      .eq("realm_id", realmId)
      .single();

    console.log("qbo-dashboard: Token lookup:", { 
      hasTokens: !!tokenRow, 
      hasAccessToken: !!tokenRow?.access_token,
      error: tErr?.message 
    });

    if (tErr || !tokenRow) {
      console.log("qbo-dashboard: No tokens found, returning disconnected state");
      return json({
        connected: false,
        revenue: { current: null, previous: null },
        expenses: { current: null, previous: null },
        netProfit: { current: null, previous: null },
        ytdSeries: [],
        lastSyncAt: null
      });
    }

    let accessToken = tokenRow.access_token;
    let refreshToken = tokenRow.refresh_token;
    const accessExpMs = tokenRow.access_expires_at ? Date.parse(tokenRow.access_expires_at) : 0;

    console.log("qbo-dashboard: Token status:", {
      hasAccessToken: !!accessToken,
      hasRefreshToken: !!refreshToken,
      expiresAt: new Date(accessExpMs).toISOString(),
      needsRefresh: !accessToken || !accessExpMs || accessExpMs - Date.now() < 60_000
    });

    // Refresh if expiring
    if (!accessToken || !accessExpMs || accessExpMs - Date.now() < 60_000) {
      console.log("qbo-dashboard: Refreshing access token");
      
      if (!refreshToken) {
        console.error("qbo-dashboard: No refresh token available");
        return json({ error: "no_refresh_token", connected: false }, 401);
      }

      const basic = btoa(`${QBO_CLIENT_ID}:${QBO_CLIENT_SECRET}`);
      const form = new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken
      });

      const tRes = await fetch("https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Authorization": `Basic ${basic}`
        },
        body: form.toString()
      });

      if (!tRes.ok) {
        const errorText = await tRes.text();
        console.error("qbo-dashboard: Token refresh failed:", tRes.status, errorText);
        
        // Check if this is an invalid_grant error (expired/revoked refresh token)
        if (tRes.status === 400 && errorText.includes('invalid_grant')) {
          // Delete the invalid tokens from database
          await supabase
            .from("qbo_tokens")
            .delete()
            .eq("user_id", userId)
            .eq("realm_id", realmId);
          
          return json({ 
            error: "qbo_reauth_required", 
            message: "QuickBooks connection expired. Please reconnect your QuickBooks account.",
            connected: false,
            status: tRes.status, 
            detail: errorText 
          }, 401);
        }
        
        return json({ error: "refresh_failed", status: tRes.status, detail: errorText, connected: false }, 500);
      }

      const t = await tRes.json();
      accessToken = t.access_token;
      refreshToken = t.refresh_token ?? refreshToken;
      
      console.log("qbo-dashboard: Token refreshed successfully");

      // Try update with ISO expiry columns; if they don't exist, fall back quietly
      const updateWithIso = {
        access_token: accessToken,
        refresh_token: refreshToken,
        updated_at: new Date().toISOString(),
        access_expires_at: secsFromNowToIso(t.expires_in),
        refresh_expires_at: secsFromNowToIso(t.x_refresh_token_expires_in)
      };

      const { error: upErr } = await supabase
        .from("qbo_tokens")
        .update(updateWithIso)
        .eq("user_id", userId)
        .eq("realm_id", realmId);

      if (upErr) {
        console.warn("qbo-dashboard: Failed to update with ISO format, trying fallback");
        await supabase
          .from("qbo_tokens")
          .update({
            access_token: accessToken,
            refresh_token: refreshToken,
            updated_at: new Date().toISOString()
          })
          .eq("user_id", userId)
          .eq("realm_id", realmId);
      }
    }

    const { start, end } = startEndForPeriod(period);
    console.log("qbo-dashboard: Date range:", { start, end, period });

    async function fetchPL(s: string, e: string) {
      const url = new URL(`${QBO_API_BASE}/v3/company/${realmId}/reports/ProfitAndLoss`);
      url.searchParams.set("start_date", s);
      url.searchParams.set("end_date", e);
      url.searchParams.set("accounting_method", "Accrual");
      url.searchParams.set("minorversion", "65");

      console.log("qbo-dashboard: Fetching P&L for", s, "to", e);
      
      const r = await fetch(url.toString(), {
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Accept": "application/json"
        }
      });

      if (!r.ok) {
        const errorText = await r.text();
        console.error("qbo-dashboard: QBO P&L API failed:", r.status, errorText);
        throw new Error(`QBO P&L ${r.status}: ${errorText}`);
      }

      return r.json();
    }

    // Current period
    const currPL = await fetchPL(start, end);
    const curr = pickReportTotals(currPL);
    console.log("qbo-dashboard: Current period totals:", curr);

    // Previous comparator
   let prev = { revenue: 0, expenses: 0, net: 0 };

if (period === "this_month" || period === "last_month") {
  const last = startEndForPeriod("last_month");
  try {
    const prevPL = await fetchPL(last.start, last.end);
    prev = pickReportTotals(prevPL);
  } catch (e) {
    console.warn("qbo-dashboard: Failed to fetch previous period:", e);
  }

} else if (period === "this_year" || period === "ytd") {
  const now = new Date();
  const lastYear = now.getFullYear() - 1;
  const pad = (n: number) => String(n).padStart(2, "0");

  const pStart = `${lastYear}-01-01`;
  const pEnd = `${lastYear}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

  try {
    const prevPL = await fetchPL(pStart, pEnd);
    prev = pickReportTotals(prevPL);
  } catch (e) {
    console.warn("qbo-dashboard: Failed to fetch previous year:", e);
  }

} else if (period === "last_year") {
  const now = new Date();
  const prevYear = now.getFullYear() - 2;

  try {
    const prevPL = await fetchPL(`${prevYear}-01-01`, `${prevYear}-12-31`);
    prev = pickReportTotals(prevPL);
  } catch (e) {
    console.warn("qbo-dashboard: Failed to fetch year before last:", e);
  }
}

console.log("qbo-dashboard: Previous period totals:", prev);

    // YTD monthly series
    let ytdSeries: any[] = [];
    if (period === "ytd" || period === "this_year") {
      const now = new Date();
      for (let m = 0; m <= now.getMonth(); m++) {
        const y = now.getFullYear();
        const pad = (n: number) => String(n).padStart(2, "0");
        const s = `${y}-${pad(m + 1)}-01`;
        const e = `${y}-${pad(m + 1)}-${pad(new Date(y, m + 1, 0).getDate())}`;

        try {
          const pl = await fetchPL(s, e);
          const t = pickReportTotals(pl);
          ytdSeries.push({
            name: new Date(y, m, 1).toLocaleString("en-US", { month: "short" }),
            revenue: toNumber(t.revenue, 0),
            expenses: toNumber(t.expenses, 0)
          });
        } catch (e) {
          console.warn(`qbo-dashboard: Failed to fetch month ${m + 1}:`, e);
        }
      }
    }

    console.log("qbo-dashboard: YTD series length:", ytdSeries.length);
    console.log("qbo-dashboard: Request completed successfully");

    return json({
      connected: true,
      period,
      revenue: {
        current: toNumber(curr.revenue, 0),
        previous: toNumber(prev.revenue, 0)
      },
      expenses: {
        current: toNumber(curr.expenses, 0),
        previous: toNumber(prev.expenses, 0)
      },
      netProfit: {
        current: toNumber(curr.net, 0),
        previous: toNumber(prev.net, 0)
      },
      ytdSeries,
      lastSyncAt: new Date().toISOString()
    });

  } catch (e) {
    console.error("qbo-dashboard: Unexpected error:", e);
    return json({
      error: "server_error",
      message: String(e?.message ?? e)
    }, 500);
  }
});
