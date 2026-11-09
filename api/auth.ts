import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { Client } from 'pg';

const DEFAULT_REF = 'nmwkljtaymujqnmzgyxn';
const DEFAULT_URL = `https://${DEFAULT_REF}.supabase.co`;
const DEFAULT_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5td2tsanRheW11anFubXpneXhuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMzODQ0MDYsImV4cCI6MjEwODk2MDQwNn0.LGEoX7QPu2O9yxw0LT74rerIo4_Tj9CHCWlsT1hoxT8';

function extractSupabaseUrlRef(urlStr: string): string {
  try {
    const match = new URL(urlStr).hostname.toLowerCase().match(/^([a-z0-9-]+)\.supabase\.co$/);
    return match ? match[1] : '';
  } catch {
    return '';
  }
}

function extractJwtRef(token: string): string {
  const parts = token.split('.');
  if (parts.length !== 3 || !parts[1]) return '';
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    return typeof payload?.ref === 'string' ? payload.ref.trim() : '';
  } catch {
    return '';
  }
}

function pickMatchingSupabaseKey(rawKey: string | undefined, expectedRef: string, fallbackKey: string): string {
  const trimmed = (rawKey || '').trim();
  if (!trimmed) return fallbackKey;
  const keyRef = extractJwtRef(trimmed);
  if (keyRef && expectedRef && keyRef !== expectedRef) return fallbackKey;
  return trimmed;
}

function jsonResponse(res: VercelResponse, status: number, body: unknown) {
  res.setHeader('content-type', 'application/json');
  res.status(status).json(body);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');

  if (req.method !== 'POST') return jsonResponse(res, 404, { error: 'Not found' });

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      return jsonResponse(res, 400, { error: 'Invalid request payload format.' });
    }
  }

  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body?.password === 'string' ? body.password : '';
  if (!email || !password) return jsonResponse(res, 400, { error: 'Email and password are required.' });

  const supabaseUrl = (process.env.SUPABASE_URL || DEFAULT_URL).trim();
  const expectedRef = extractSupabaseUrlRef(supabaseUrl) || DEFAULT_REF;
  const supabaseAnonKey = pickMatchingSupabaseKey(process.env.SUPABASE_ANON_KEY, expectedRef, DEFAULT_ANON_KEY);

  // 1. Primary Authentication: Authenticate with Supabase backend server-side
  try {
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (!error && data?.user) {
      let profile: any = null;
      try {
        const { data: prof } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', data.user.id)
          .maybeSingle();
        profile = prof || null;
      } catch {}

      return jsonResponse(res, 200, {
        user: data.user,
        session: data.session,
        profile,
      });
    }

    if (error) {
      const msg = (error.message || '').toLowerCase();
      if (error.status === 400 || msg.includes('invalid login credentials') || msg.includes('invalid credentials')) {
        return jsonResponse(res, 401, { error: 'Invalid login credentials. Please verify your email and password.' });
      }
    }
  } catch (supaErr) {
    console.warn('Supabase serverless authentication exception:', supaErr);
  }

  // 2. Secondary Failover: Neon PostgreSQL if configured
  if (process.env.NEON_DATABASE_URL) {
    const client = new Client({
      connectionString: process.env.NEON_DATABASE_URL,
      ssl: { rejectUnauthorized: true },
      connectionTimeoutMillis: 3000,
    });

    try {
      await client.connect();
      const result = await client.query(
        `SELECT au.id, au.email, au.password_hash, p.full_name, p.roll_number, p.role,
                p.phone, p.avatar_url, p.created_at
         FROM auth_users au
         JOIN profiles p ON p.id = au.id
         WHERE lower(au.email) = $1
         LIMIT 1`,
        [email]
      );
      const user = result.rows[0];
      if (user?.password_hash) {
        const verified = await client.query(
          'SELECT crypt($1, $2) = $2 AS valid',
          [password, user.password_hash]
        );
        if (verified.rows[0]?.valid) {
          return jsonResponse(res, 200, {
            user: {
              id: user.id,
              email: user.email,
              created_at: user.created_at,
              updated_at: user.created_at,
              user_metadata: {
                full_name: user.full_name,
                enrollment_no: user.roll_number || '',
                role: user.role,
                phone: user.phone || '',
                avatar_url: user.avatar_url || '',
              },
            },
            session: null,
            profile: {
              id: user.id,
              email: user.email,
              full_name: user.full_name,
              roll_number: user.roll_number,
              role: user.role,
              phone: user.phone,
              avatar_url: user.avatar_url,
              created_at: user.created_at,
            },
          });
        }
      }
    } catch (neonErr) {
      console.warn('Neon serverless auth failover error:', neonErr);
    } finally {
      try {
        await client.end();
      } catch {}
    }
  }

  return jsonResponse(res, 401, { error: 'Invalid login credentials. Please verify your email and password.' });
}
