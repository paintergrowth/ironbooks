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

// ---------- Helpers ----------

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
    },
  });
}

// Basic IP extraction from common proxy/CDN headers
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

// Decode JWT just enough to get the "sub" claim (user id)
function base64UrlToJsonPart(b64url: string): any | null {
  try {
    const pad = "=".repeat((4 - (b64url.length % 4)) % 4);
    const normalized = (b64url + pad).replace(/-/g, "+").replace(/_/g, "/");
    const decoded = atob(normalized);
    return JSON.parse(decoded);
  } catch (_err) {
    return null;
  }
}

function getUserIdFromAuthHeader(authHeader: string | null): string | null {
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.slice("Bearer ".length).trim();
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const payload = base64UrlToJsonPart(parts[1]);
  if (!payload) return null;
  return typeof payload.sub === "string" ? payload.sub : null;
}

// ---------- Main ----------

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

serve(async (req: Request) => {
  // Handle preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Only POST allowed" }, 405);
  }

  try {
    const authHeader = req.headers.get("authorization");
    const actAsUserHeader = req.headers.get("x-ib-act-as-user");
    const actAsRealmHeader = req.headers.get("x-ib-act-as-realm");

    // 1) Parse body
    const body = await req.json().catch(() => ({}));
    const path: string = body.path ?? body.pathname ?? "";
    if (!path) {
      return jsonResponse({ error: "Missing path" }, 400);
    }

    const fullUrl: string | null = body.full_url ?? body.fullUrl ?? null;
    const sessionId: string | null = body.session_id ?? body.sessionId ?? null;
    const referrer: string | null = body.referrer ?? null;

    // 2) Identity & impersonation
    const actorUserId = getUserIdFromAuthHeader(authHeader);
    const effectiveUserId = actAsUserHeader || actorUserId;
    const actorIsImp =
      !!actorUserId &&
      !!effectiveUserId &&
      actorUserId !== effectiveUserId;

    const realmId = actAsRealmHeader || null;

    // 3) Request context
    const ipAddress = getClientIp(req);
    const userAgent = req.headers.get("user-agent");

    // 4) Insert into Supabase
    const supabase = createClient(SUPABASE_URL!, SERVICE_ROLE_KEY!);

    const { error } = await supabase.from("page_view_events").insert([
      {
        actor_user_id: actorUserId,
        effective_user_id: effectiveUserId,
        realm_id: realmId,
        actor_is_imp: actorIsImp,
        session_id: sessionId,
        ip_address: ipAddress,
        // country/region/city left null for now
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
