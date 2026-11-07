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
const DEFAULT_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5td2tsanRheW11anFubXpneXhuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMzODQ0MDYsImV4cCI6MjEwODk2MDQwNn0.LGEoX7QPu2O9yxw0LT74rerIo4_Tj9CHCWlsT1hoxT8';

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

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || DEFAULT_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || DEFAULT_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return res.status(503).json({ error: 'Supabase server configuration is missing.' });
  }
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
    const transporter = await getTransporter();
    if (!transporter) {
      return res.status(503).json({ error: 'SMTP service is unavailable.' });
    }
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
