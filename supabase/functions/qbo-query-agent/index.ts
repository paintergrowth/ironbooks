// supabase/functions/qbo-query-agent/index.ts
//
// Drop-in: streams SSE tokens when { stream: true } is sent.
// Keeps your SQL/embeddings fallbacks & non-stream JSON response intact.
//
// Deno / Supabase Edge Function
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import OpenAI from "https://esm.sh/openai@4";

// ---------- CORS ----------
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-ib-act-as-user, x-ib-act-as-realm",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
};

// ---------- ENV ----------
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

const openai = new OpenAI({
  apiKey: OPENAI_API_KEY
});

// optional: for semantic fallback over monthly embeddings
const MATCH_THRESHOLD = Number(Deno.env.get("MATCH_THRESHOLD") ?? 0.74);
const MATCH_COUNT = Number(Deno.env.get("MATCH_COUNT") ?? 6);
const COVERAGE_MIN = Number(Deno.env.get("COVERAGE_MIN") ?? 0.5);

// guardrails
const MAX_MONTHS_TO_SEND = Number(Deno.env.get("MAX_MONTHS_TO_SEND") ?? 12);

// explicit list of expense-like category prefixes
const EXPENSE_PREFIXES = (Deno.env.get("EXPENSE_PREFIXES") ?? "pnl:expenses,pnl:cogs,pnl:cost_of_goods_sold,pnl:payroll,pnl:direct_costs,pnl:gross_profit:expenses").split(",").map((s)=>s.trim()).filter(Boolean);

// Model stays the same as your current use:
const CHAT_MODEL = "gpt-5-mini";
const EMBED_MODEL = "text-embedding-3-small";

// ---------- Small helpers ----------
function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json"
    }
  });
}

const enc = new TextEncoder();
const sse = (data)=>enc.encode(`data: ${JSON.stringify(data)}\n\n`);

// ------------------------- Date helpers -------------------------
function pad2(n) {
  return String(n).padStart(2, "0");
}

function monthIndex(d) {
  return d.year * 12 + (d.month - 1);
}

function idxToYearMonth(idx) {
  const year = Math.floor(idx / 12);
  const month = idx % 12 + 1;
  return {
    year,
    month
  };
}

function nowLocal() {
  return new Date();
}

function currentYearMonth() {
  const n = nowLocal();
  return {
    year: n.getFullYear(),
    month: n.getMonth() + 1
  };
}

function lastMonthYearMonth() {
  const n = nowLocal();
  const d = new Date(n.getFullYear(), n.getMonth() - 1, 1);
  return {
    year: d.getFullYear(),
    month: d.getMonth() + 1
  };
}

function thisQuarterStart(y, m) {
  const qStartMonth = m - (m - 1) % 3;
  return {
    year: y,
    month: qStartMonth
  };
}

function lastQuarterRange() {
  const { year, month } = currentYearMonth();
  const qStart = thisQuarterStart(year, month);
  const end = new Date(qStart.year, qStart.month - 2 - 1, 1);
  const to = {
    year: end.getFullYear(),
    month: end.getMonth() + 1
  };
  const startIdx = monthIndex(to) - 2;
  const from = idxToYearMonth(startIdx);
  return {
    from,
    to,
    label: `Last Quarter ${from.year}-${pad2(from.month)}–${to.year}-${pad2(to.month)}`
  };
}

function escLiteral(str) {
  return String(str).replace(/'/g, "''");
}

// ------------------------- Coverage -------------------------
async function embeddingsCoverageMonthly(supabaseAdmin, realmId) {
  const totalRes = await supabaseAdmin.from("qbo_pnl_monthly").select("*", {
    count: "exact",
    head: true
  }).eq("realm_id", realmId);
  const withEmbRes = await supabaseAdmin.from("qbo_pnl_monthly").select("*", {
    count: "exact",
    head: true
  }).eq("realm_id", realmId).not("embedding", "is",);
  const total = totalRes.count ?? 0;
  const withEmb = withEmbRes.count ?? 0;
  const ratio = total > 0 ? withEmb / total : 0;
  return {
    total,
    withEmb,
    ratio
  };
}

// ------------------------- SQL exec (RPC) -------------------------
async function executeSQL(supabaseAdmin, sql) {
  const { data, error } = await supabaseAdmin.rpc("execute_sql", {
    sql_query: sql
  });
  if (error) throw error;
  return data;
}

// ------------------------- Fetch monthly rows for a period -------------------------
async function fetchMonthlyRows(supabaseAdmin, realmId, from, to) {
  const sql = `
    SELECT realm_id, year, month, pnl_data
    FROM public.qbo_pnl_monthly
    WHERE realm_id = '${escLiteral(realmId)}'
      AND (year > ${from.year} OR (year = ${from.year} AND month >= ${from.month}))
      AND (year < ${to.year} OR (year = ${to.year} AND month <= ${to.month}))
    ORDER BY year, month
    LIMIT ${MAX_MONTHS_TO_SEND}
  `;
  return await executeSQL(supabaseAdmin, sql);
}

// ------------------------- Optional semantic fallback -------------------------
async function fetchMonthlyRowsSemantic(supabaseAdmin, realmId, userQuery, from, to, tokensUsed) {
  const emb = await openai.embeddings.create({
    model: EMBED_MODEL,
    input: userQuery
  });
  tokensUsed.in += emb.usage?.prompt_tokens ?? 0;
  const { data, error } = await supabaseAdmin.rpc("match_pnl_monthly", {
    query_embedding: emb.data[0].embedding,
    realm_id_filter: realmId,
    match_threshold: MATCH_THRESHOLD,
    match_count: MATCH_COUNT,
    from_year: from?.year ?? null,
    from_month: from?.month ?? null,
    to_year: to?.year ?? null,
    to_month: to?.month ?? null
  });
  if (error) throw error;
  return (data ?? []).slice(0, MAX_MONTHS_TO_SEND).map((r)=>({
      realm_id: r.realm_id,
      year: r.year,
      month: r.month,
      pnl_data: r.pnl_data
    }));
}

// ------------------------- LLM SQL generation -------------------------
async function generateSQLQuery(userQuery, realmId, tokensUsed, currentYearMonthObj) {
  const { year: currentYear, month: currentMonth } = currentYearMonthObj;
  const realmIdEscaped = escLiteral(realmId);
  const sys = `You are a PostgreSQL expert generating exact SELECT queries for the qbo_pnl_monthly table.

Table Schema (ONE row per complete month of P&L):
- realm_id: string (filter ALWAYS)
- year: int (e.g., 2025)
- month: int (1-12)
- pnl_data: JSON (monthly category-wise P&L; revenues positive, expenses positive)

Infer the time period from userQuery (use current date Sep 19, 2025 for relatives):
- "this month/MTD": year=${currentYear}, month=${currentMonth}
- "last month": year=${currentYear}, month=${currentMonth - 1} (or 12/prev year if Jan)
- "this quarter/QTD": Current quarter (Jul-Sep 2025 for Sep)
- "last quarter": Previous quarter (Apr-Jun 2025)
- "YTD/this year": Jan-${pad2(currentMonth)} ${currentYear}
- Explicit: e.g., "Q2 2024" → Apr-Jun 2024; "July 2025" → single month
- Unclear: Default to current month

Output ONLY a valid PostgreSQL SELECT query string (no explanations):
- SELECT realm_id, year, month, pnl_data
- FROM public.qbo_pnl_monthly
- WHERE realm_id = '${realmIdEscaped}' AND (year/month conditions for inferred period)
- ORDER BY year ASC, month ASC
- LIMIT ${MAX_MONTHS_TO_SEND}

Use exact WHERE for range, e.g., (year = 2025 AND month BETWEEN 4 AND 6).
Do not end with a semicolon.`;
  const payload = {
    userQuery,
    currentYear,
    currentMonth,
    maxMonths: MAX_MONTHS_TO_SEND,
    realmIdEscaped: `'${realmIdEscaped}'`
  };
  const res = await openai.chat.completions.create({
    model: CHAT_MODEL,
    temperature: 1,
    messages: [
      {
        role: "system",
        content: sys
      },
      {
        role: "user",
        content: JSON.stringify(payload, null, 2)
      }
    ]
  });
  tokensUsed.in += res.usage?.prompt_tokens ?? 0;
  tokensUsed.out += res.usage?.completion_tokens ?? 0;
  const generatedSQL = (res.choices?.[0]?.message?.content ?? "").trim();
  if (!generatedSQL.startsWith("SELECT") || !generatedSQL.includes("qbo_pnl_monthly") || !generatedSQL.includes("LIMIT")) {
    throw new Error("Invalid SQL generated");
  }
  return generatedSQL;
}

// ------------------------- Prompt & streaming to OpenAI -------------------------
function buildAdvisorSystemPrompt() {
  return `You are a professional CFO advisor.

You will receive:
- The user's question.
- A small array of MONTHLY P&L "rows". Each row is:
  { realm_id: string, year: number, month: number, pnl_data: JSON }
- An array expense_prefixes: string listing category-key prefixes that should be treated as "expense-like".

About pnl_data (IMPORTANT):
- Keys are category paths (e.g., "pnl:revenues:product", "pnl:expenses:marketing").
- Values are numbers (month-to-date) or nested objects.
- Revenues are positive; Expenses are positive; Net Profit = Revenues – Inclusive Expenses.
- Missing categories = treat as 0.

Rules:
- Compute per month first (YYYY-MM).
- Sum across months when multi-month.
- If both Revenues and Inclusive Expenses exist, also provide Net Profit.
- If data is missing: say "No monthly P&L data found for the requested period."
- Be concise, human, and decision-oriented for a painting business owner (avoid walls of numbers).
- Use YYYY-MM when you reference months.`;
}

function buildUserPayload(question, rows) {
  return {
    question,
    expense_prefixes: EXPENSE_PREFIXES,
    months: rows.map((r)=>({
        realm_id: r.realm_id,
        year: r.year,
        month: r.month,
        pnl_data: r.pnl_data
      }))
  };
}

// ------------------------- HTTP handler -------------------------
serve(async (req)=>{
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders
    });
  }
  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  let body;
  try {
    body = await req.json();
  } catch  {
    return json({
      error: "Bad JSON body"
    }, 400);
  }
  const { query, realmId, userId, stream } = body ?? {};
  if (!query || !realmId || !userId) {
    // In streaming mode, send an SSE error frame so the client doesn't hang.
    if (stream) {
      const streamBody = new ReadableStream({
        start (controller) {
          controller.enqueue(sse({
            type: "error",
            message: "Missing query, realmId, or userId"
          }));
          controller.enqueue(sse({
            type: "done"
          }));
          controller.close();
        }
      });
      return new Response(streamBody, {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          "Connection": "keep-alive"
        }
      });
    }
    return json({
      error: "Missing query, realmId, or userId"
    }, 400);
  }
  const tokensUsed = {
    in: 0,
    out: 0
  };
  const curYM = currentYearMonth();
  // 1) Get rows (SQL-gen, fallback to current month, then optional semantic)
  let rows = [];
  try {
    const generatedSQL = await generateSQLQuery(query, realmId, tokensUsed, curYM);
    rows = await executeSQL(supabaseAdmin, generatedSQL);
  } catch (sqlErr) {
    console.error("[SQL Gen] failed, fallback to current month:", sqlErr?.message);
    rows = await fetchMonthlyRows(supabaseAdmin, realmId, curYM, curYM);
  }
  if (rows.length === 0) {
    const { ratio } = await embeddingsCoverageMonthly(supabaseAdmin, realmId);
    if (ratio >= COVERAGE_MIN) {
      const cur = currentYearMonth();
      const fromIdx = monthIndex(cur) - 11;
      const from = idxToYearMonth(Math.max(fromIdx, monthIndex({
        year: cur.year - 5,
        month: 1
      })));
      rows = await fetchMonthlyRowsSemantic(supabaseAdmin, realmId, query, from, cur, tokensUsed);
      if (!rows?.length) {
        const last3from = idxToYearMonth(monthIndex(cur) - 2);
        rows = await fetchMonthlyRows(supabaseAdmin, realmId, last3from, cur);
      }
    } else {
      rows = await fetchMonthlyRows(supabaseAdmin, realmId, curYM, curYM);
    }
  }
  // 2) STREAMING path
  if (stream) {
    const monthsList = rows.map((r)=>`${r.year}-${pad2(r.month)}`);
    const systemPrompt = buildAdvisorSystemPrompt();
    const userPayload = buildUserPayload(query, rows);
    let fullText = "";
    const streamBody = new ReadableStream({
      async start (controller) {
        // Kick an initial frame so the client shows activity immediately.
        controller.enqueue(sse({
          type: "token",
          content: ""
        })); // no-op token to start UI
        try {
          const completion = await openai.chat.completions.create({
            model: CHAT_MODEL,
            temperature: 1,
            stream: true,
            messages: [
              {
                role: "system",
                content: systemPrompt
              },
              {
                role: "user",
                content: JSON.stringify(userPayload, null, 2)
              }
            ]
          });
          for await (const part of completion){
            const delta = part.choices?.[0]?.delta?.content ?? "";
            if (delta) {
              fullText += delta;
              controller.enqueue(sse({
                type: "token",
                content: delta
              }));
            }
          }
          // Finish event includes some metadata you might want later
          controller.enqueue(sse({
            type: "done",
            months: monthsList
          }));
          controller.close();
          // Background log (fire-and-forget)
          Promise.resolve().then(async ()=>{
            try {
              await supabaseAdmin.from("ai_logs").insert([
                {
                  realm_id: realmId,
                  user_id: userId,
                  query,
                  response: fullText,
                  tokens_in: tokensUsed.in,
                  tokens_out: tokensUsed.out,
                  cost: 0.0
                }
              ]);
            } catch (err) {
              console.error("[Agent Log] insert failed:", err?.message || err);
            }
          });
        } catch (err) {
          const message = err?.message || "stream error";
          controller.enqueue(sse({
            type: "error",
            message
          }));
          controller.enqueue(sse({
            type: "done"
          }));
          controller.close();
        }
      }
    });
    return new Response(streamBody, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive"
      }
    });
  }
  // 3) NON-STREAM JSON path (unchanged behavior)
  const systemPrompt = buildAdvisorSystemPrompt();
  const userPayload = buildUserPayload(query, rows);
  const res = await openai.chat.completions.create({
    model: CHAT_MODEL,
    temperature: 1,
    messages: [
      {
        role: "system",
        content: systemPrompt
      },
      {
        role: "user",
        content: JSON.stringify(userPayload, null, 2)
      }
    ]
  });
  tokensUsed.in += res.usage?.prompt_tokens ?? 0;
  tokensUsed.out += res.usage?.completion_tokens ?? 0;
  const responseText = (res.choices?.[0]?.message?.content ?? "").trim();
  const coverage = (await embeddingsCoverageMonthly(supabaseAdmin, realmId)).ratio;
  // fire-and-forget log
  Promise.resolve().then(async ()=>{
    try {
      await supabaseAdmin.from("ai_logs").insert([
        {
          realm_id: realmId,
          user_id: userId,
          query,
          response: responseText,
          tokens_in: tokensUsed.in,
          tokens_out: tokensUsed.out,
          cost: 0.0
        }
      ]);
    } catch (err) {
      console.error("[Agent Log] insert failed:", err?.message || err);
    }
  });
  return json({
    response: responseText || "No monthly P&L data found for the requested period.",
    path: "monthly-pnl",
    rows_returned: rows.length,
    months: rows.map((r)=>`${r.year}-${pad2(r.month)}`),
    tokens_in: tokensUsed.in,
    tokens_out: tokensUsed.out,
    coverage
  });
});