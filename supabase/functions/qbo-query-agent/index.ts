// AI agent for querying qbo_postings (structured + semantic hybrid)
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import OpenAI from "https://esm.sh/openai@4";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const MATCH_THRESHOLD = Number(Deno.env.get("MATCH_THRESHOLD") ?? 0.74);
const MATCH_COUNT = Number(Deno.env.get("MATCH_COUNT") ?? 50);
const COVERAGE_MIN = Number(Deno.env.get("COVERAGE_MIN") ?? 0.6);
const MAX_LIST = Number(Deno.env.get("MAX_LIST") ?? 10);
const openai = new OpenAI({
  apiKey: OPENAI_API_KEY
});
function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json"
    }
  });
}
// ------------------------- Helpers: dates & metrics & categories -------------------------
function pad2(n) {
  return String(n).padStart(2, "0");
}
function toDateStr(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function monthToDateRange(now = new Date()) {
  const from = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-01`;
  const to = toDateStr(now);
  return {
    from,
    to,
    label: `MTD ${from}–${to}`
  };
}
function lastMonthRange(now = new Date()) {
  const y = now.getFullYear();
  const m = now.getMonth();
  const lastMonth = new Date(y, m - 1, 1);
  const from = `${lastMonth.getFullYear()}-${pad2(lastMonth.getMonth() + 1)}-01`;
  const end = new Date(lastMonth.getFullYear(), lastMonth.getMonth() + 1, 0);
  const to = toDateStr(end);
  return {
    from,
    to,
    label: `Last Month ${from}–${to}`
  };
}
function quarterToDateRange(now = new Date()) {
  const m = now.getMonth();
  const qStartMonth = m - m % 3;
  const from = `${now.getFullYear()}-${pad2(qStartMonth + 1)}-01`;
  const to = toDateStr(now);
  return {
    from,
    to,
    label: `QTD ${from}–${to}`
  };
}
function yearToDateRange(now = new Date()) {
  const from = `${now.getFullYear()}-01-01`;
  const to = toDateStr(now);
  return {
    from,
    to,
    label: `YTD ${from}–${to}`
  };
}
function detectMetric(q) {
  const s = q.toLowerCase();
  if (/(\\bsales\\b|\\brevenue\\b|\\bincome\\b)/i.test(s)) return "revenue";
  if (/(\\bexpense\\b|\\bexpenses\\b|\\bspend\\b|\\bcosts\\b|\\bcogs\\b)/i.test(s)) return "expenses";
  if (/(\\bprofit\\b|\\bnet income\\b|\\bearnings\\b)/i.test(s)) return "profit";
  return null;
}
function detectCategoryGrouping(q) {
  const s = q.toLowerCase();
  const enabled = /(\\bby\\b|\\bper\\b)\\s+(category|sub\\s*category|subcategory|account)|\\bcategory[- ]?wise\\b/.test(s);
  const m = s.match(/\\blevel\\s*(\\d+)\\b/);
  const levelOverride = m ? Math.max(1, parseInt(m[1], 10)) : null;
  const byAccount = /(\\bby\\b|\\bper\\b)\\s+account\\b/.test(s);
  return {
    enabled,
    levelOverride,
    byAccount
  };
}
function metricToPrefix(metric) {
  return metric === "revenue" ? "pnl:revenues" : "pnl:expenses";
}
function defaultChildLevelForPrefix(prefix) {
  return prefix.split(":").length + 1;
}
function categoryKeySQL(level) {
  return `COALESCE(NULLIF(split_part(full_category, ':', ${level}), ''), '(uncategorized)')`;
}
function hasRealmFilter(sql, realmId) {
  if (sql.includes(";")) return false;
  if (!/^\\s*select\\b/i.test(sql)) return false;
  const esc = realmId.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&");
  const needle = new RegExp(String.raw`\\brealm_id\\s*=\\s*'${esc}'`, "i");
  return needle.test(sql);
}
function formatCategoryRows(rows, label) {
  const top = rows.slice(0, MAX_LIST);
  const list = top.map((r)=>`${r.category}: ${Number(r.total ?? 0).toLocaleString()}`).join("; ");
  const more = rows.length > MAX_LIST ? ` (+${rows.length - MAX_LIST} more)` : "";
  return `${label}: ${list}${more}`;
}
// ---------- Utilities
async function embeddingsCoverage(supabaseAdmin, realmId) {
  const totalRes = await supabaseAdmin.from("qbo_postings").select("*", {
    count: "exact",
    head: true
  }).eq("realm_id", realmId);
  const withEmbRes = await supabaseAdmin.from("qbo_postings").select("*", {
    count: "exact",
    head: true
  }).eq("realm_id", realmId).not("embedding", "is", null);
  const total = totalRes.count ?? 0;
  const withEmb = withEmbRes.count ?? 0;
  const ratio = total > 0 ? withEmb / total : 0;
  return {
    total,
    withEmb,
    ratio
  };
}
// ---------- Classifier: structured | semantic | hybrid
async function classifyQuery(query) {
  const prompt = 'Classify the user query as exactly one of: "structured" (totals/sums/counts on dates/amounts/types), "semantic" (fuzzy content/memo/vendor/category-ish lookups), or "hybrid" (needs fuzzy retrieval then totals). Return ONLY one word.';
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.0,
    messages: [
      {
        role: "system",
        content: prompt
      },
      {
        role: "user",
        content: query
      }
    ]
  });
  return (res.choices[0].message.content ?? "structured").trim().toLowerCase();
}
async function extractFilters(query) {
  const sys = `Extract filters for a QuickBooks postings DB as JSON with keys:\\n     date_from (YYYY-MM-DD or null), date_to (YYYY-MM-DD or null),\\n     category_prefix (like 'pnl:expenses:marketing' or null),\\n     keywords (array of memo/vendor terms or null),\\n     want_total (boolean), group_by (one of day|week|month|quarter|year or null).\\n     Return ONLY valid JSON.`;
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.0,
    response_format: {
      type: "json_object"
    },
    messages: [
      {
        role: "system",
        content: sys
      },
      {
        role: "user",
        content: query
      }
    ]
  });
  try {
    const obj = JSON.parse(res.choices[0].message.content ?? "{}");
    return obj;
  } catch  {
    return {};
  }
}
// ---------- SQL generator for structured path (same table/rules)
async function generateStructuredSQL(userQuery, realmId) {
  const prompt = `You are a SQL expert for a QuickBooks postings database.\\n\\nTable: qbo_postings(\\n  id bigint, realm_id text, txn_id text, line_no int,\\n  date date, type text, docnum text, name text, memo text,\\n  account_id text, account_name text, full_category text,\\n  debit numeric, credit numeric\\n)\\n\\nRULES:\\n- Return a single valid SELECT only (no semicolons).\\n- ALWAYS include WHERE realm_id = '${realmId}'.\\n- Aggregations must use (debit - credit) as amount.\\n- Date filters use "date BETWEEN 'YYYY-MM-DD' AND 'YYYY-MM-DD'".\\n- For categories use full_category with ILIKE 'prefix%'.\\n- For text searches use ILIKE on memo/name.\\n- If vague, produce the best SELECT answering the ask.\\n\\nUser query: "${userQuery}"\\n\\nReturn ONLY the SQL string. If impossible, return: SELECT 0 AS result`;
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.1,
    messages: [
      {
        role: "system",
        content: prompt
      }
    ]
  });
  let sql = (response.choices[0].message.content ?? "").trim();
  if (!sql.toUpperCase().startsWith("SELECT")) sql = "SELECT 0 AS result";
  return sql;
}
// ---------- Execute paths
async function executeSQL(supabaseAdmin, sql) {
  const { data, error } = await supabaseAdmin.rpc("execute_sql", {
    sql_query: sql
  });
  if (error) throw error;
  return data;
}
async function executeSemantic(supabaseAdmin, userQuery, realmId, filters) {
  if (!filters?.category_prefix) {
    const m = detectMetric(userQuery);
    if (m === "revenue") filters.category_prefix = "pnl:revenues";
    if (m === "expenses") filters.category_prefix = "pnl:expenses";
  }
  const emb = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: userQuery
  });
  const queryEmbedding = emb.data[0].embedding;
  const { data, error } = await supabaseAdmin.rpc("match_postings", {
    query_embedding: queryEmbedding,
    realm_id_filter: realmId,
    match_threshold: MATCH_THRESHOLD,
    match_count: MATCH_COUNT,
    date_from: filters?.date_from ?? null,
    date_to: filters?.date_to ?? null,
    category_prefix: filters?.category_prefix ?? null
  });
  if (error) throw error;
  const wantsTotals = filters?.want_total === true || /\\b(total|sum|aggregate|how much|revenue|expense|spend|profit)\\b/i.test(userQuery);
  if (wantsTotals && Array.isArray(data) && data.length) {
    const ids = data.map((r)=>r.id).join(",");
    const group = filters?.group_by;
    const groupExpr = group ? `date_trunc('${group}', date)` : null;
    const sql = groupExpr ? `SELECT ${groupExpr} AS bucket, SUM(debit - credit) AS total FROM public.qbo_postings WHERE realm_id = '${realmId}' AND id IN (${ids}) GROUP BY 1 ORDER BY 1` : `SELECT SUM(debit - credit) AS total FROM public.qbo_postings WHERE realm_id = '${realmId}' AND id IN (${ids})`;
    const agg = await executeSQL(supabaseAdmin, sql);
    return {
      hits: data,
      agg
    };
  }
  return {
    hits: data
  };
}
// ---------- Response writer
async function generateResponse(userQuery, payload, tokensUsed) {
  const prompt = `You are a professional CFO financial advisor.\\nContext:\\n- Results are QuickBooks postings (journal lines).\\n- Amounts are (debit - credit). Categories via full_category.\\n- Dates are from "date".\\n\\nUser query:\\n${userQuery}\\n\\nData:\\n${JSON.stringify(payload, null, 2)}\\n\\nWrite a short, clear answer using ONLY the data. If no rows, say:\\n"No matching data found—perhaps check your query or sync status."`;
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.4,
    messages: [
      {
        role: "system",
        content: prompt
      }
    ]
  });
  const txt = (response.choices[0].message.content ?? "").trim();
  tokensUsed.in += response.usage?.prompt_tokens ?? 0;
  tokensUsed.out += response.usage?.completion_tokens ?? 0;
  return txt;
}
// ------------------------- HTTP handler -------------------------
serve(async (req)=>{
  if (req.method === "OPTIONS") return new Response(null, {
    status: 204,
    headers: corsHeaders
  });
  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  try {
    const body = await req.json();
    const { query, realmId, userId } = body;
    if (!query || !realmId || !userId) return json({
      error: "Missing query, realmId, or userId"
    }, 400);
    // -------- FAST METRIC PATH (with hierarchical category support) --------
    const metric = detectMetric(query);
    const range = (()=>{
      const s = query.toLowerCase();
      if (/\\b(this month|mtd)\\b/.test(s)) return monthToDateRange();
      if (/\\b(last month)\\b/.test(s)) return lastMonthRange();
      if (/\\b(this quarter|qtd)\\b/.test(s)) return quarterToDateRange();
      if (/\\b(ytd|this year)\\b/.test(s)) return yearToDateRange();
      return null;
    })();
    const catGrouping = detectCategoryGrouping(query);
    if (metric && range) {
      const { from, to, label } = range;
      if (catGrouping.enabled && (metric === "revenue" || metric === "expenses")) {
        const prefix = metricToPrefix(metric);
        const level = catGrouping.levelOverride ?? defaultChildLevelForPrefix(prefix);
        const key = categoryKeySQL(level);
        const sql = `SELECT ${key} AS category, SUM(debit - credit) AS total FROM public.qbo_postings WHERE realm_id = '${realmId}' AND full_category ILIKE '${prefix}%' AND date BETWEEN '${from}' AND '${to}' GROUP BY 1 ORDER BY total DESC`;
        const rows = await executeSQL(supabaseAdmin, sql);
        const responseLine = formatCategoryRows(rows, `${metric === "revenue" ? "Sales (revenue)" : "Expenses"} by category ${label}`);
        return json({
          response: responseLine,
          path: "fast-metric-category",
          coverage: (await embeddingsCoverage(supabaseAdmin, realmId)).ratio
        });
      }
      if (catGrouping.byAccount && (metric === "revenue" || metric === "expenses")) {
        const prefix = metricToPrefix(metric);
        const sql = `SELECT COALESCE(NULLIF(account_name, ''), '(no account)') AS account, SUM(debit - credit) AS total FROM public.qbo_postings WHERE realm_id = '${realmId}' AND full_category ILIKE '${prefix}%' AND date BETWEEN '${from}' AND '${to}' GROUP BY 1 ORDER BY total DESC`;
        const rows = await executeSQL(supabaseAdmin, sql);
        const list = rows.slice(0, MAX_LIST).map((r)=>`${r.account}: ${Number(r.total ?? 0).toLocaleString()}`).join("; ");
        const more = rows.length > MAX_LIST ? ` (+${rows.length - MAX_LIST} more)` : "";
        return json({
          response: `${metric === "revenue" ? "Sales (revenue)" : "Expenses"} by account ${label}: ${list}${more}`,
          path: "fast-metric-account",
          coverage: (await embeddingsCoverage(supabaseAdmin, realmId)).ratio
        });
      }
      // simple total (no category breakout)
      let sql;
      if (metric === "revenue") {
        sql = `SELECT COALESCE(SUM(debit - credit),0) AS total FROM public.qbo_postings WHERE realm_id = '${realmId}' AND full_category ILIKE 'pnl:revenues%' AND date BETWEEN '${from}' AND '${to}'`;
      } else if (metric === "expenses") {
        sql = `SELECT COALESCE(SUM(debit - credit),0) AS total FROM public.qbo_postings WHERE realm_id = '${realmId}' AND full_category ILIKE 'pnl:expenses%' AND date BETWEEN '${from}' AND '${to}'`;
      } else {
        sql = `SELECT COALESCE(SUM(CASE WHEN full_category ILIKE 'pnl:revenues%' THEN (debit - credit) END),0) - COALESCE(SUM(CASE WHEN full_category ILIKE 'pnl:expenses%' THEN (debit - credit) END),0) AS total FROM public.qbo_postings WHERE realm_id = '${realmId}' AND date BETWEEN '${from}' AND '${to}'`;
      }
      const data = await executeSQL(supabaseAdmin, sql);
      const val = Number(data?.[0]?.total ?? 0);
      const labelText = metric === "revenue" ? "Sales (revenue)" : metric === "expenses" ? "Expenses" : "Profit";
      return json({
        response: `${labelText} ${label}: ${val.toLocaleString()}`,
        path: "fast-metric",
        coverage: (await embeddingsCoverage(supabaseAdmin, realmId)).ratio
      });
    }
    // -------- CLASSIFY & COVERAGE --------
    const typeRaw = await classifyQuery(query);
    let type = typeRaw;
    const { ratio } = await embeddingsCoverage(supabaseAdmin, realmId);
    if ((type === "semantic" || type === "hybrid") && ratio < COVERAGE_MIN) {
      type = "structured";
    }
    const tokensUsed = {
      in: 0,
      out: 0
    };
    // -------- STRUCTURED --------
    if (type === "structured") {
      let sql = await generateStructuredSQL(query, realmId);
      if (!hasRealmFilter(sql, realmId)) {
        throw new Error("Unsafe SQL: realm_id filter missing");
      }
      const data = await executeSQL(supabaseAdmin, sql);
      const resp = await generateResponse(query, data, tokensUsed);
      return json({
        response: resp,
        tokens_in: tokensUsed.in,
        tokens_out: tokensUsed.out,
        path: "structured",
        coverage: ratio
      });
    }
    // -------- SEMANTIC / HYBRID --------
    const filters = await extractFilters(query);
    const { hits, agg } = await executeSemantic(supabaseAdmin, query, realmId, filters);
    const payload = agg ? {
      matches: hits,
      aggregates: agg
    } : {
      matches: hits
    };
    const resp = await generateResponse(query, payload, tokensUsed);
    return json({
      response: resp,
      tokens_in: tokensUsed.in,
      tokens_out: tokensUsed.out,
      path: type,
      coverage: ratio
    });
  } catch (e) {
    console.error("[Agent Log] Error:", e?.message, e?.stack);
    return json({
      error: "Failed to process query"
    }, 500);
  }
});
