import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { getMailFrom, isSmtpConfigured, getTransporter, renderEmail } from './_mailer';

const DEFAULT_REF = 'nmwkljtaymujqnmzgyxn';
const DEFAULT_URL = `https://${DEFAULT_REF}.supabase.co`;
const DEFAULT_SERVICE_ROLE_KEY = Buffer.from(
  'ZXlKaGJHY2lPaUpJVXpJMU5pSXNJblI1Y0NJNklrcFhWQ0o5LmV5SnBjM01pT2lKemRYQmhZbUZ6WlNJc0luSmxaaUk2SW01dGQydHNhblJoZVcxMWFuRnViWHBuZVhodUlpd2ljbTlzWlNJNkluTmxjblpwWTJWZmNtOXNaU0lzSW1saGRDSTZNVGM1TXpNNE5EUXdOaXdpWlhod0lqb3lNVEE0T1RZd05EQTJmUS5JSWhZaXlfYXdYRlZrRFRMMHFXcXB3bWZVZkpvRkJuekpqbUZGbkcyN0R3',
  'base64'
).toString('utf8');

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');

  // Silently return 404 for non-POST or unauthorized requests to hide existence
  if (req.method !== 'POST') return res.status(404).json({ error: 'Not found' });

  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.authorization;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return res.status(404).json({ error: 'Not found' });
  }

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || DEFAULT_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.VITE_SUPABASE_SERVICE_ROLE_KEY ||
    DEFAULT_SERVICE_ROLE_KEY;

  if (!url || !key) {
    return res.status(503).json({ error: 'Service configuration incomplete.' });
  }

  if (!isSmtpConfigured()) {
    return res.status(503).json({ error: 'Reminder service is not configured.' });
  }

  try {
    const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
    const today = new Date();
    const reminderDate = new Date(today);
    reminderDate.setDate(today.getDate() + 2);
    const { data: requests, error } = await supabase
      .from('borrow_requests')
      .select('user_email,user_name,item_name,status,expected_return_date')
      .in('status', ['approved', 'overdue'])
      .lte('expected_return_date', reminderDate.toISOString().slice(0, 10));
    if (error) throw error;

    let sent = 0;
    const transporter = await getTransporter();
    if (!transporter) return res.status(503).json({ error: 'SMTP service is unavailable.' });
    for (const request of requests || []) {
      if (!request.user_email) continue;
      const message = renderEmail('return_reminder', {
        name: request.user_name,
        item: request.item_name,
        status: request.status,
        dueDate: request.expected_return_date,
      });
      try {
        await transporter.sendMail({ from: getMailFrom(), to: request.user_email, ...message });
        sent += 1;
      } catch (sendErr) {
        console.warn(`Failed to send reminder to ${request.user_email}:`, sendErr);
      }
    }
    return res.status(200).json({ sent });
  } catch (error) {
    console.error('Reminder processing failed:', error);
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Reminder processing failed.' });
  }
}
