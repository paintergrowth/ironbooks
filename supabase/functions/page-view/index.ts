// supabase/functions/page-view/index.ts
//
// Minimal CORS test: just echo method, no DB, no auth.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

// ---------- CORS ----------
const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-ib-act-as-user, x-ib-act-as-realm",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

serve(async (req: Request) => {
  // 1) Preflight – must return 200 with CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      status: 200,
      headers: corsHeaders,
    });
  }

  // 2) For any non-OPTIONS request, just reply with JSON
  const body = {
    status: "ok",
    method: req.method,
    path: new URL(req.url).pathname,
  };

  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
    },
  });
});
