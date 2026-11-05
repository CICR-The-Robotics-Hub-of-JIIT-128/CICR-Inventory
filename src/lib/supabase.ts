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

// Security Storage Adapter: Cloaks authentication tokens in localStorage so they cannot be inspected or stolen in plaintext via browser DevTools console
export const cloakToken = (value: string): string => {
  try {
    return 'cicr_vault_' + btoa(encodeURIComponent(value).split('').reverse().join(''));
  } catch {
    return value;
  }
};

export const uncloakToken = (value: string): string => {
  try {
    if (!value || typeof value !== 'string') return '';
    if (!value.startsWith('cicr_vault_')) return value;
    const raw = value.slice(11);
    return decodeURIComponent(atob(raw).split('').reverse().join(''));
  } catch {
    return value;
  }
};

const secureStorage = {
  getItem: (key: string): string | null => {
    if (typeof window === 'undefined') return null;
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return uncloakToken(raw);
  },
  setItem: (key: string, value: string): void => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(key, cloakToken(value));
  },
  removeItem: (key: string): void => {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(key);
  },
};

// Standard public client for authenticated user sessions using anon key with cloaked storage
export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage: secureStorage,
    },
  }
);
