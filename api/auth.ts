import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { Client } from 'pg';

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

/**
 * Returns the trimmed Supabase key when it matches the configured project ref, or empty string otherwise.
 */
function pickMatchingSupabaseKey(rawKey: string | undefined, expectedRef: string): string {
  const trimmed = (rawKey || '').trim();
  if (!trimmed) return '';
  const keyRef = extractJwtRef(trimmed);
  if (keyRef && expectedRef && keyRef !== expectedRef) return '';
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

  const supabaseUrl = (process.env.SUPABASE_URL || '').trim();
  const expectedRef = extractSupabaseUrlRef(supabaseUrl);
  const supabaseAnonKey = pickMatchingSupabaseKey(process.env.SUPABASE_ANON_KEY, expectedRef);

  // 1. Primary Authentication: Authenticate with Supabase backend server-side
  if (supabaseUrl && supabaseAnonKey) {
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
  } else {
    console.warn('Primary Supabase auth skipped: missing or mismatched SUPABASE_URL / SUPABASE_ANON_KEY.');
  }

  // 2. Secondary Failover: Neon PostgreSQL if configured
  if (!supabaseUrl || !supabaseAnonKey) {
    if (!process.env.NEON_DATABASE_URL) {
      return jsonResponse(res, 503, { error: 'Authentication server configuration is missing.' });
    }
  }

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
                p.status, p.phone, p.avatar_url, p.created_at
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
          const isApprovedNeonAccount =
            user.status === 'approved' &&
            user.avatar_url !== 'status:pending' &&
            user.avatar_url !== 'status:rejected';
          if (!isApprovedNeonAccount) {
            return jsonResponse(res, 403, {
              error:
                user.status === 'rejected' || user.avatar_url === 'status:rejected'
                  ? 'Your account request was declined by an administrator. Please contact club leadership.'
                  : 'Your registration request is pending administrator approval before signing in.',
            });
          }

          const normalizedRole = user.role === 'admin' ? 'admin' : 'member';
          return jsonResponse(res, 200, {
            user: {
              id: user.id,
              email: user.email,
              created_at: user.created_at,
              updated_at: user.created_at,
              user_metadata: {
                full_name: user.full_name,
                enrollment_no: user.roll_number || '',
                role: normalizedRole,
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
              role: normalizedRole,
              status: 'approved',
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
