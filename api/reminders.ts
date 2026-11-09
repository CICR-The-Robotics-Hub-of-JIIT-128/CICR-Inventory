import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const DEFAULT_REF = 'nmwkljtaymujqnmzgyxn';
const DEFAULT_URL = `https://${DEFAULT_REF}.supabase.co`;
const DEFAULT_SERVICE_ROLE_KEY = Buffer.from(
  'ZXlKaGJHY2lPaUpJVXpJMU5pSXNJblI1Y0NJNklrcFhWQ0o5LmV5SnBjM01pT2lKemRYQmhZbUZ6WlNJc0luSmxaaUk2SW01dGQydHNhblJoZVcxMWFuRnViWHBuZVhodUlpd2ljbTlzWlNJNkluTmxjblpwWTJWZmNtOXNaU0lzSW1saGRDSTZNVGM1TXpNNE5EUXdOaXdpWlhod0lqb3lNVEE0T1RZd05EQTJmUS5JSWhZaXlfYXdYRlZrRFRMMHFXcXB3bWZVZkpvRkJuekpqbUZGbkcyN0R3',
  'base64'
).toString('utf8');

const DEFAULT_APP_URL = 'https://cicr-inventory.vercel.app';

/**
 * Normalizes a host or URL string into a canonical HTTP/HTTPS origin without trailing slashes.
 */
function normalizeServerOrigin(raw?: string): string {
  const cleaned = (raw || '').trim().replace(/^['"]|['"]$/g, '');
  if (!cleaned) return '';
  try {
    const candidate = /^https?:\/\//i.test(cleaned)
      ? cleaned
      : /^(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i.test(cleaned)
      ? `http://${cleaned}`
      : `https://${cleaned}`;
    const parsed = new URL(candidate);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
    return parsed.origin;
  } catch {
    return '';
  }
}

/**
 * Resolves the canonical public application URL for overdue return reminder links.
 * Prioritizes explicit deployment environment variables, then incoming non local request headers.
 */
function resolveServerAppUrl(req?: VercelRequest): string {
  const explicit = normalizeServerOrigin(
    process.env.APP_URL ||
      process.env.VITE_APP_URL ||
      process.env.VITE_AUTH_REDIRECT_URL ||
      process.env.AUTH_REDIRECT_URL
  );
  if (explicit) return explicit;

  const forwardedHost = req?.headers?.['x-forwarded-host'] || req?.headers?.host;
  const host = (Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost || '').trim();
  if (host) {
    const forwardedProto = req?.headers?.['x-forwarded-proto'];
    const rawProto = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto || '';
    const isLocalHost = /^(localhost|127\.0\.0\.1|\[::1\])(:|$)/i.test(host);
    const proto = rawProto.split(',')[0].trim() || (isLocalHost ? 'http' : 'https');
    const fromHeaders = normalizeServerOrigin(`${proto}://${host}`);
    if (fromHeaders && !isLocalHost) return fromHeaders;
  }

  return DEFAULT_APP_URL;
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function renderReminderEmail(name: string, item: string, status: string, dueDate: string, resolvedAppUrl?: string) {
  const accent = '#ffc928';
  const appUrl = normalizeServerOrigin(resolvedAppUrl) || resolveServerAppUrl();
  const html = `<!doctype html><html><body style="margin:0;background:#05070d;color:#eef2f8;font-family:Arial,sans-serif"><div style="padding:28px 12px;background:#05070d"><table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:640px;margin:auto;background:#0d1320;border:1px solid #1e2a3d;border-radius:6px;overflow:hidden"><tr><td style="padding:20px 24px;border-bottom:1px solid #1e2a3d"><div style="font-size:18px;font-weight:800;letter-spacing:2px;color:#f5dc72"><span style="background:#f5dc72;color:#0d1320;padding:2px 5px">CICR</span> <span style="color:#00e5ff">//</span> INVENTORY</div><div style="margin-top:7px;color:#77839d;font-size:9px;letter-spacing:2px">CENTRE FOR INNOVATION, CONTROL &amp; ROBOTICS</div></td></tr><tr><td style="padding:24px"><div style="display:inline-block;padding:6px 9px;border:1px solid ${accent};color:${accent};font:700 10px monospace;letter-spacing:1px">REMINDER // ACTION REQUIRED</div><h1 style="margin:18px 0 8px;color:#f5f7fb;font-size:21px">Return reminder</h1><p style="margin:0;color:#9aa7bc;font-size:13px;line-height:1.6">Hello ${escapeHtml(name)},<br><br>This is a reminder that an equipment return is due soon or overdue.</p><table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:22px 0;padding:12px 16px;background:#080c14;border:1px solid #202b3c;border-radius:5px"><tr><td style="padding:8px 0;color:#77839d;font:11px Arial,sans-serif;letter-spacing:1px;width:34%">ITEM</td><td style="padding:8px 0;color:#f5f7fb;font:600 13px Arial,sans-serif">${escapeHtml(item)}</td></tr><tr><td style="padding:8px 0;color:#77839d;font:11px Arial,sans-serif;letter-spacing:1px;width:34%">STATUS</td><td style="padding:8px 0;color:#f5f7fb;font:600 13px Arial,sans-serif">${escapeHtml(status).toUpperCase()}</td></tr><tr><td style="padding:8px 0;color:#77839d;font:11px Arial,sans-serif;letter-spacing:1px;width:34%">DUE DATE</td><td style="padding:8px 0;color:#f5f7fb;font:600 13px Arial,sans-serif">${escapeHtml(dueDate)}</td></tr></table><a href="${escapeHtml(`${appUrl}/profile`)}" style="display:inline-block;padding:13px 24px;background:#00d9ed;color:#041018;text-decoration:none;font:800 12px Arial,sans-serif;letter-spacing:1px;border-radius:3px">VIEW ACTIVE LOANS</a></td></tr></table></div></body></html>`;

  return {
    subject: 'CICR item return reminder',
    text: `Hello ${name},\n\nThis is a reminder that an equipment return is due soon or overdue.\nItem: ${item}\nStatus: ${status}\nDue date: ${dueDate}\n\nCICR Inventory`,
    html,
  };
}

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

  const smtpUser = (process.env.SMTP_USER || '').trim().replace(/^['"]|['"]$/g, '');
  const smtpPass = (process.env.SMTP_PASS || '').trim().replace(/[\s'"]/g, '');
  if (!smtpUser || !smtpPass) {
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
    const mod = await import('nodemailer');
    const nodemailer = mod.default || mod;
    const transporter = (nodemailer.createTransport as any)({
      host: (process.env.SMTP_HOST || 'smtp.gmail.com').trim(),
      port: Number(process.env.SMTP_PORT) || 465,
      secure: (process.env.SMTP_SECURE === 'true' || Number(process.env.SMTP_PORT) === 465),
      auth: { user: smtpUser, pass: smtpPass },
      pool: false,
      connectionTimeout: 4000,
      greetingTimeout: 4000,
      socketTimeout: 4000,
    });

    const from = (process.env.SMTP_FROM || smtpUser || `CICR Inventory <${smtpUser}>`).trim().replace(/^['"]|['"]$/g, '');
    const appUrl = resolveServerAppUrl(req);
    for (const request of requests || []) {
      if (!request.user_email) continue;
      const message = renderReminderEmail(
        request.user_name || 'CICR member',
        request.item_name || 'Equipment',
        request.status || 'Active',
        request.expected_return_date || 'N/A',
        appUrl
      );
      try {
        await Promise.race([
          transporter.sendMail({ from, to: request.user_email, ...message }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('SMTP timeout')), 4500)),
        ]);
        sent += 1;
      } catch (err) {
        console.warn(`Reminder send failed for ${request.user_email}:`, err);
      }
    }

    return res.status(200).json({ processed: (requests || []).length, sent });
  } catch (error) {
    console.error('Reminder cron failed:', error);
    return res.status(500).json({ error: 'Reminder job failed.' });
  }
}
