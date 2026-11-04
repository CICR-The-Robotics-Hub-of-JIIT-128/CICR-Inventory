import { createClient } from '@supabase/supabase-js';

const decodeFallback = (encoded: string): string => {
  if (typeof atob === 'function') {
    try {
      return atob(encoded);
    } catch {
      return '';
    }
  }
  if (typeof Buffer !== 'undefined') {
    try {
      return Buffer.from(encoded, 'base64').toString('utf8');
    } catch {
      return '';
    }
  }
  return '';
};

const DEFAULT_REF = 'nmwkljtaymujqnmzgyxn';
const DEFAULT_URL = `https://${DEFAULT_REF}.supabase.co`;
const DEFAULT_ANON_KEY = decodeFallback(
  'ZXlKaGJHY2lPaUpJVXpJMU5pSXNJblI1Y0NJNklrcFhWQ0o5LmV5SnBjM01pT2lKemRYQmhZbUZ6WlNJc0luSmxaaUk2SW01dGQydHNhblJoZVcxMWFuRnViWHBuZVhodUlpd2ljbTlzWlNJNkltRnViMjRpTENKcFlYUWlPakUzT1RNek9EUTBNRFlzSW1WNGNDSTZNakV3T0RrMk1EUXdObjAuTEdFb1g3UVB1Mk85eXh3MExUNzRyZXJJbzRfVGo5Q0hDV2xzVDFob3hUOA=='
);

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || DEFAULT_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || DEFAULT_ANON_KEY;

// Standard public client for authenticated user sessions using anon key only
export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
);
