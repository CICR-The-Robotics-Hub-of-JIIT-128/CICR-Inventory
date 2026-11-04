import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Client } from 'pg';

function jsonResponse(res: VercelResponse, status: number, body: unknown) {
  res.setHeader('content-type', 'application/json');
  res.status(status).json(body);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');

  if (req.method !== 'POST') return jsonResponse(res, 404, { error: 'Not found' });
  if (!process.env.NEON_DATABASE_URL) {
    return jsonResponse(res, 503, { error: 'Neon authentication is not configured.' });
  }

  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!email || !password) return jsonResponse(res, 400, { error: 'Email and password are required.' });

  const client = new Client({
    connectionString: process.env.NEON_DATABASE_URL,
    ssl: { rejectUnauthorized: true },
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
    if (!user?.password_hash) return jsonResponse(res, 401, { error: 'Invalid login credentials.' });

    const verified = await client.query(
      'SELECT crypt($1, $2) = $2 AS valid',
      [password, user.password_hash]
    );
    if (!verified.rows[0]?.valid) return jsonResponse(res, 401, { error: 'Invalid login credentials.' });

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
    });
  } finally {
    await client.end();
  }
}
