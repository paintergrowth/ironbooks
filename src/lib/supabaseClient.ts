// src/lib/supabaseClient.ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// If envs are missing, don't crash the app – just log a warning
let client: SupabaseClient | null = null;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    "Supabase env vars VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are missing. Supabase client is disabled."
  );
} else {
  client = createClient(supabaseUrl, supabaseAnonKey);
}

export const supabase = client;
