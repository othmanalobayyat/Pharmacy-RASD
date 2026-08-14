import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// True only when both env vars are present and non-empty. Every caller that
// needs the backend (useAuth, usePharmacyData) checks this first and shows a
// clear "not configured" state instead of letting supabase-js throw deep
// inside a request.
export const isSupabaseConfigured = Boolean(url && anonKey);

// createClient() with empty strings would throw at import time and blank the
// whole app, so only construct a real client when configured; otherwise
// export null and let call sites guard on isSupabaseConfigured.
export const supabase = isSupabaseConfigured
  ? createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    })
  : null;
