// supabase/functions/page-view/index.ts
//
// Logs page views with impersonation context into page_view_events.
//

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ---------- ENV ----------
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

// ---------- CORS ----------
const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-ib-act-as-user, x-ib-act-as-realm",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
    },
  });
}

// Basic IP extraction
function getClientIp(req: Request): string | null {
  const h = req.headers;
  const keys = [
    "cf-connecting-ip",
    "x-forwarded-for",
    "x-real-ip",
    "x-client-ip",
    "remote-addr",
  ];
  for (const key of keys) {
    const value = h.get(key);
    if (value) {
      return value.split(",")[0].trim();
    }
  }
  return null;
}

serve(async (req: Request) => {
  // 1) Handle preflight very early
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      status: 200,
      headers: corsHeaders,
    });
  }

  // 2) Only allow POST otherwise
  if (req.method !== "POST") {
    return new Response("Method not allowed", {
      status: 405,
      headers: corsHeaders,
    });
  }

  try {
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
      return jsonResponse(
        { error: "Server misconfigured: missing env vars" },
        500
      );
    }

    // 3) Parse body
    const body = await req.json().catch(() => ({}));
    const path: string = body.path ?? body.pathname ?? "";
    if (!path) {
      return jsonResponse({ error: "Missing path" }, 400);
    }

    const fullUrl: string | null = body.full_url ?? body.fullUrl ?? null;
    const sessionId: string | null = body.session_id ?? body.sessionId ?? null;
    const referrer: string | null = body.referrer ?? null;

    // 4) Identity / impersonation (v1: no auth → actor/effective null)
    const actorUserId: string | null = null;
    const effectiveUserId: string | null = null;
    const actorIsImp = false;
    const realmId: string | null = null;

    // 5) Request context
    const ipAddress = getClientIp(req);
    const userAgent = req.headers.get("user-agent");

    // 6) Insert into Supabase
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { error } = await supabase.from("page_view_events").insert([
      {
        actor_user_id: actorUserId,
        effective_user_id: effectiveUserId,
        realm_id: realmId,
        actor_is_imp: actorIsImp,
        session_id: sessionId,
        ip_address: ipAddress,
        country: null,
        region: null,
        city: null,
        path,
        full_url: fullUrl,
        referrer,
        user_agent: userAgent,
      },
    ]);

    if (error) {
      console.error("Insert error in page_view_events:", error);
      return jsonResponse({ error: "DB insert failed" }, 500);
    }

    return jsonResponse({ status: "ok" });
  } catch (err) {
    console.error("Unexpected error in page-view function:", err);
    return jsonResponse({ error: "Unexpected error" }, 500);
  }
});
