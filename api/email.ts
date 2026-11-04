import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { getMailFrom, isSmtpConfigured, getTransporter, renderEmail } from './_mailer';

const allowedEvents = new Set([
  'login',
  'logout',
  'account_created',
  'account_approved',
  'account_rejected',
  'role_updated',
  'borrow_requested',
  'borrow_approved',
  'borrow_rejected',
  'item_returned',
  'return_reminder',
]);

const DEFAULT_REF = 'nmwkljtaymujqnmzgyxn';
const DEFAULT_URL = `https://${DEFAULT_REF}.supabase.co`;
const DEFAULT_ANON_KEY = Buffer.from(
  'ZXlKaGJHY2lPaUpJVXpJMU5pSXNJblI1Y0NJNklrcFhWQ0o5LmV5SnBjM01pT2lKemRYQmhZbUZ6WlNJc0luSmxaaUk2SW01dGQydHNhblJoZVcxMWFuRnViWHBuZVhodUlpd2ljbTlzWlNJNkltRnViMjRpTENKcFlYUWlPakUzT1RNek9EUTBNRFlzSW1WNGNDSTZNakV3T0RrMk1EUXdObjAuTEdFb1g3UVB1Mk85eXh3MExUNzRyZXJJbzRfVGo5Q0hDV2xzVDFob3hUOA==',
  'base64'
).toString('utf8');

const MASTER_ADMIN_EMAILS = [
  'vardaansaxena096@gmail.com',
  'cicrinventory@gmail.com',
  'cicrinventoryofficial@gmail.com',
  '992501030399@mail.jiit.ac.in',
];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');

  // Silently return 404 for non-POST to prevent discovery
  if (req.method !== 'POST') return res.status(404).json({ error: 'Not found' });

  // Require Authorization Bearer header
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(404).json({ error: 'Not found' });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || DEFAULT_URL;
  const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || DEFAULT_ANON_KEY;
  const supabase = createClient(supabaseUrl, supabaseKey, { auth: { autoRefreshToken: false, persistSession: false } });

  const token = authHeader.slice(7);
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return res.status(404).json({ error: 'Not found' });
  }

  if (!isSmtpConfigured()) {
    return res.status(503).json({ error: 'SMTP service is unavailable.' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ error: 'Invalid JSON request body.' });
    }
  }

  const { event, to, data } = body || {};
  if (typeof event !== 'string' || !allowedEvents.has(event)) {
    return res.status(400).json({ error: 'Invalid notification event.' });
  }
  if (typeof to !== 'string' || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
    return res.status(400).json({ error: 'Invalid recipient.' });
  }

  // Prevent email spoofing: normal users can only trigger notifications to their own email
  const callerEmail = (user.email || '').toLowerCase();
  const recipientEmail = to.toLowerCase();
  const isMaster = MASTER_ADMIN_EMAILS.includes(callerEmail);

  if (!isMaster && callerEmail !== recipientEmail) {
    // Check if user is an approved admin in profiles table
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, status')
      .eq('id', user.id)
      .maybeSingle();

    if (!profile || profile.role !== 'admin' || profile.status !== 'approved') {
      return res.status(403).json({ error: 'Unauthorized to send notifications to other recipients.' });
    }
  }

  try {
    const transporter = getTransporter();
    const message = renderEmail(event, data && typeof data === 'object' ? data : {});
    await Promise.race([
      transporter.sendMail({ from: getMailFrom(), to, ...message }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('SMTP transmission timed out')), 5000))
    ]);
    return res.status(202).json({ sent: true });
  } catch (error) {
    console.error('SMTP delivery failed:', error);
    return res.status(502).json({
      error: 'Email delivery failed.',
    });
  }
}
