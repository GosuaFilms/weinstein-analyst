import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  // eslint-disable-next-line no-console
  console.error('Missing Supabase env vars. Copy .env.example to .env and fill them in.');
}

export const supabase = createClient(url ?? '', anonKey ?? '', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

// Ensure edge function calls always use the user's JWT, not the anon key.
// supabase-js may not call setAuth on INITIAL_SESSION (restored sessions),
// leaving the functions client with the anon key instead of the user's JWT.
supabase.auth.onAuthStateChange((_event, session) => {
  if (session?.access_token) {
    supabase.functions.setAuth(session.access_token);
  }
});
