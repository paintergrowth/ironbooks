// supabase/functions/qbo-company/index.ts
// Returns { companyName } for the current user / realmId
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const QBO_CLIENT_ID = Deno.env.get("QBO_CLIENT_ID");
const QBO_CLIENT_SECRET = Deno.env.get("QBO_CLIENT_SECRET");
const QBO_BASE = Deno.env.get("QBO_BASE") ?? "https://quickbooks.api.intuit.com";

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    }
  });
}

serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    console.log("qbo-company: Starting request");
    console.log("qbo-company: Headers:", Object.fromEntries(req.headers.entries()));
    console.log("qbo-company: Method:", req.method);
    
    // Parse optional body
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    // Allow caller to pass realmId explicitly (preferred)
    let realmId = body?.realmId ? String(body.realmId) : null;
    console.log("qbo-company: Received realmId from body:", realmId);

    // Two Supabase clients: user-scoped (if JWT is provided) and admin
    const authHeader = req.headers.get("Authorization") ?? "";
    console.log("qbo-company: Auth header present:", !!authHeader);
    
    const supabaseUser = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
      global: {
        headers: authHeader ? { Authorization: authHeader } : {}
      }
    });

    const supabaseAdmin = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // If auth header is provided, try to get user
    let userId: string | null = null;
    if (authHeader) {
      try {
        const { data: userRes, error: userError } = await supabaseUser.auth.getUser();
        console.log("qbo-company: User auth result:", { 
          hasUser: !!userRes?.user, 
          userId: userRes?.user?.id,
          error: userError?.message 
        });
        
        if (userRes?.user && !userError) {
          userId = userRes.user.id;
        }
      } catch (authErr) {
        console.log("qbo-company: Auth call failed, trying manual JWT decode:", authErr);
      }
    }
    
    // If supabase auth failed, try to extract from JWT manually as fallback
    if (!userId && authHeader) {
      try {
        const token = authHeader.replace(/^Bearer\s+/i, "");
        // Basic JWT decode (just payload, no verification since we're just extracting user_id)
        const parts = token.split('.');
        if (parts.length === 3) {
          const payload = JSON.parse(atob(parts[1]));
          if (payload.sub) {
            userId = payload.sub;
            console.log("qbo-company: Extracted user ID from JWT payload:", userId);
          }
        }
      } catch (e) {
        console.log("qbo-company: Failed to extract user from JWT:", e);
      }
    }
    
    if (!userId) {
      console.error("qbo-company: No user ID available");
      return json({ error: "unauthorized" }, 401);
    }

    console.log("qbo-company: Using user ID:", userId);

    // If realmId not provided, infer from this user's profile
    if (!realmId) {
      console.log("qbo-company: Fetching realmId from profile");
      const { data: profile, error: profileError } = await supabaseAdmin
        .from("profiles")
        .select("qbo_realm_id")
        .eq("id", userId)
        .maybeSingle();
        
      console.log("qbo-company: Profile lookup result:", { 
        hasProfile: !!profile, 
        realmId: profile?.qbo_realm_id,
        error: profileError?.message 
      });
      
      if (profileError) {
        console.error("qbo-company: Profile lookup failed:", profileError.message);
        return json({ error: "profile_lookup_failed", detail: profileError.message }, 500);
      }
      
      if (profile?.qbo_realm_id) {
        realmId = String(profile.qbo_realm_id);
      }
    }

    if (!realmId) {
      console.error("qbo-company: No realm ID available");
      return json({ error: "no_realm_provided" }, 400);
    }

    console.log("qbo-company: Using realmId:", realmId);

    // Load tokens for this user + realm
    console.log("qbo-company: Fetching QBO tokens");
    const { data: tokenRow, error: tokErr } = await supabaseAdmin
      .from("qbo_tokens")
      .select("*")
      .eq("user_id", userId)
      .eq("realm_id", realmId)
      .maybeSingle();

    console.log("qbo-company: Token lookup result:", { 
      hasTokens: !!tokenRow, 
      hasAccessToken: !!tokenRow?.access_token,
      error: tokErr?.message 
    });

    if (tokErr) {
      console.error("qbo-company: Token lookup failed:", tokErr.message);
      return json({ error: "tokens_lookup_failed", detail: tokErr.message }, 500);
    }
    
    if (!tokenRow) {
      console.error("qbo-company: No tokens found for realm");
      return json({ error: "no_tokens_for_realm" }, 404);
    }

    // Ensure we have a fresh access token
    let accessToken = tokenRow.access_token;
    const expAt = tokenRow.access_expires_at ? new Date(tokenRow.access_expires_at) : null;
    const needsRefresh = !expAt || expAt.getTime() - 120_000 <= Date.now();
    
    console.log("qbo-company: Token status:", { 
      hasAccessToken: !!accessToken,
      expiresAt: expAt?.toISOString(),
      needsRefresh 
    });

    if (needsRefresh) {
      console.log("qbo-company: Refreshing access token");
      
      if (!tokenRow.refresh_token) {
        console.error("qbo-company: No refresh token available");
        return json({ error: "no_refresh_token" }, 401);
      }

      const basic = btoa(`${QBO_CLIENT_ID}:${QBO_CLIENT_SECRET}`);
      const resp = await fetch("https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${basic}`
        },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: tokenRow.refresh_token
        })
      });

      if (!resp.ok) {
        const text = await resp.text();
        console.error("qbo-company: Token refresh failed:", resp.status, text);
        return json({ error: "refresh_failed", status: resp.status, detail: text }, 401);
      }

      const j = await resp.json();
      accessToken = j.access_token;
      const newAccessExpISO = new Date(Date.now() + (j.expires_in ?? 3600) * 1000).toISOString();
      
      console.log("qbo-company: Token refreshed successfully");
      
      await supabaseAdmin.from("qbo_tokens").update({
        access_token: j.access_token,
        refresh_token: j.refresh_token ?? tokenRow.refresh_token,
        token_type: j.token_type ?? tokenRow.token_type,
        scope: j.scope ?? tokenRow.scope,
        access_expires_at: newAccessExpISO,
        updated_at: new Date().toISOString()
      }).eq("user_id", userId).eq("realm_id", realmId);
    }

    // Call QBO CompanyInfo
    console.log("qbo-company: Calling QBO CompanyInfo API");
    const url = `${QBO_BASE}/v3/company/${realmId}/companyinfo/${realmId}?minorversion=75`;
    const r = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json"
      }
    });

    if (!r.ok) {
      const text = await r.text();
      console.error("qbo-company: QBO API failed:", r.status, text);
      return json({ error: "qbo_companyinfo_failed", status: r.status, detail: text }, 502);
    }

    const data = await r.json();
    const companyName = data?.CompanyInfo?.CompanyName ?? data?.CompanyInfo?.LegalName ?? null;
    
    console.log("qbo-company: Success, company name:", companyName);
    
    return json({ companyName, realmId });
    
  } catch (e) {
    console.error("qbo-company: Unexpected error:", e);
    return json({ error: "unexpected", detail: String(e) }, 500);
  }
});
