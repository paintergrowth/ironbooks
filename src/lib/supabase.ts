import { createClient } from '@supabase/supabase-js';


// Initialize Supabase client
// Using direct values from project configuration
const supabaseUrl = 'https://quaeeqgobujsukemkrze.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF1YWVlcWdvYnVqc3VrZW1rcnplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTAzNjY1NDMsImV4cCI6MjA2NTk0MjU0M30.XIrLwtESbBwqXy-jlvflHY2-LN0Dun-Auo6EUshEc0g';
const supabase = createClient(supabaseUrl, supabaseKey);

export async function invokeWithAuth<T>(
  name: string,
  opts?: { body?: any; headers?: Record<string, string> }
) {
  const { data: s } = await supabase.auth.getSession();
  const access = s?.session?.access_token;
  const headers = {
    ...(opts?.headers ?? {}),
    ...(access ? { Authorization: `Bearer ${access}` } : {}), // attach user JWT if present
  };
  return supabase.functions.invoke<T>(name, { ...opts, headers });
}

export { supabase };
