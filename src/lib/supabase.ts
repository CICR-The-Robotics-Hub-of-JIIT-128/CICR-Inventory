import { createClient } from '@supabase/supabase-js';

/**
 * Decodes a base64 or URL safe base64url encoded ASCII/UTF8 payload safely
 * in both browser Web APIs and Node.js test environments.
 *
 * @param encoded Base64 or base64url encoded string segment.
 * @returns Decoded UTF8 string, or empty string when malformed.
 */
const decodeBase64Url = (encoded: string): string => {
  const normalized = encoded.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  if (typeof atob === 'function') {
    try {
      return atob(padded);
    } catch {
      return '';
    }
  }
  if (typeof Buffer !== 'undefined') {
    try {
      return Buffer.from(padded, 'base64').toString('utf8');
    } catch {
      return '';
    }
  }
  return '';
};

/**
 * Extracts the Supabase project reference subdomain from a canonical project URL.
 *
 * @param urlStr Target Supabase API URL such as https://your-project-ref.supabase.co.
 * @returns Project reference identifier or empty string when unrecognized.
 */
const extractUrlRef = (urlStr: string): string => {
  if (!urlStr) return '';
  try {
    const host = new URL(urlStr).hostname.toLowerCase();
    const match = host.match(/^([a-z0-9-]+)\.supabase\.co$/);
    return match ? match[1] : '';
  } catch {
    return '';
  }
};

/**
 * Extracts the project reference claim ("ref") embedded inside a Supabase JWT key.
 *
 * @param token Candidate anon key JWT or opaque publishable key string.
 * @returns JWT ref claim string when present, or empty string for opaque keys.
 */
const extractJwtRef = (token: string): string => {
  const parts = token.split('.');
  if (parts.length !== 3 || !parts[1]) return '';
  try {
    const payload = JSON.parse(decodeBase64Url(parts[1]));
    return typeof payload?.ref === 'string' ? payload.ref.trim() : '';
  } catch {
    return '';
  }
};

const definedSupabaseUrl =
  typeof __CICR_ENV_SUPABASE_URL__ !== 'undefined' ? __CICR_ENV_SUPABASE_URL__ : '';
const definedSupabaseAnonKey =
  typeof __CICR_ENV_SUPABASE_ANON_KEY__ !== 'undefined' ? __CICR_ENV_SUPABASE_ANON_KEY__ : '';
const nodeEnv = typeof process !== 'undefined' && process.env ? process.env : undefined;

const supabaseUrl = (definedSupabaseUrl || nodeEnv?.SUPABASE_URL || '').trim();
const candidateAnonKey = (definedSupabaseAnonKey || nodeEnv?.SUPABASE_ANON_KEY || '').trim();
const expectedUrlRef = extractUrlRef(supabaseUrl);
const candidateKeyRef = extractJwtRef(candidateAnonKey);

/**
 * Active Supabase project reference extracted strictly from environment configuration.
 */
export const supabaseProjectRef = expectedUrlRef;

// Reject stale cross project keys if SUPABASE_URL and SUPABASE_ANON_KEY point to different projects
const isMismatchedKey = Boolean(
  expectedUrlRef && candidateKeyRef && candidateKeyRef !== expectedUrlRef
);
const supabaseAnonKey = isMismatchedKey ? '' : candidateAnonKey;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    isMismatchedKey
      ? 'SUPABASE_ANON_KEY does not match SUPABASE_URL project ref in environment configuration.'
      : 'Missing SUPABASE_URL or SUPABASE_ANON_KEY in .env or deployment environment variables.'
  );
}

// Purge any corrupted legacy session tokens in localStorage on boot to ensure seamless cross-browser compatibility
if (typeof window !== 'undefined') {
  try {
    const keysToPurge: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith('sb-')) {
        const val = window.localStorage.getItem(k);
        if (val && val.startsWith('cicr_vault_')) {
          keysToPurge.push(k);
        }
      }
    }
    keysToPurge.forEach((k) => window.localStorage.removeItem(k));
  } catch {}
}

// Standard Supabase client using PKCE secure auth flow (never exposes access tokens in URL)
export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey,
  {
    auth: {
      flowType: 'pkce',
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
);
