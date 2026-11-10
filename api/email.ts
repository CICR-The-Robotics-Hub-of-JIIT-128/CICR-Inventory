import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  ADMIN_ALERT_EVENTS,
  ALLOWED_NOTIFICATION_EVENTS,
  renderAdminAlertEmail,
  renderNotificationEmail,
} from './_lib/emailTemplates';

const DEFAULT_APP_URL = 'https://inventory.cicr.in';

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

function pickMatchingKey(rawKey: string | undefined, expectedRef: string): string {
  const trimmed = (rawKey || '').trim();
  if (!trimmed) return '';
  const keyRef = extractJwtRef(trimmed);
  if (keyRef && expectedRef && keyRef !== expectedRef) return '';
  return trimmed;
}

/**
 * Normalizes a host or URL string into a canonical HTTP/HTTPS origin without trailing slashes,
 * stripping leading legal/www subdomain prefixes and ignoring legacy vercel.app domains.
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
    const bareHost = parsed.hostname
      .toLowerCase()
      .replace(/^(privacy|tos|terms|toc)\./i, '')
      .replace(/^www\./i, '');
    if (/(^|\.)vercel\.app$/i.test(bareHost)) return '';
    const portSuffix = parsed.port ? `:${parsed.port}` : '';
    return `${parsed.protocol}//${bareHost}${portSuffix}`;
  } catch {
    return '';
  }
}

/**
 * Resolves the canonical public application URL for outbound notification CTA links.
 * Prioritizes explicit non Vercel environment variables, non Vercel request headers, then DEFAULT_APP_URL.
 */
function resolveServerAppUrl(req?: VercelRequest): string {
  const explicit = normalizeServerOrigin(
    process.env.APP_URL || process.env.AUTH_REDIRECT_URL
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

/**
 * Queries approved administrator emails using the server side service role client.
 */
async function resolveAdminAlertRecipients(
  adminClient: SupabaseClient<any, any, any>,
  excludeEmail: string
): Promise<string[]> {
  const recipients = new Set<string>();
  const envAdmins = (process.env.ADMIN_ALERT_EMAILS || '').split(',');
  for (const addr of envAdmins) {
    const cleaned = addr.trim().toLowerCase();
    if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cleaned)) {
      recipients.add(cleaned);
    }
  }

  try {
    const { data: adminRows } = await adminClient
      .from('profiles')
      .select('email')
      .eq('role', 'admin')
      .eq('status', 'approved');
    for (const row of adminRows || []) {
      const em = typeof (row as any)?.email === 'string' ? (row as any).email.trim().toLowerCase() : '';
      if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) {
        recipients.add(em);
      }
    }
  } catch (err) {
    console.warn('Admin alert recipient lookup notice:', err);
  }

  recipients.delete(excludeEmail.trim().toLowerCase());
  return Array.from(recipients);
}

/**
 * Authenticated transactional email delivery endpoint for CICR Inventory events.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');

  if (req.method !== 'POST') return res.status(404).json({ error: 'Not found' });

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(404).json({ error: 'Not found' });
  }

  const supabaseUrl = (process.env.SUPABASE_URL || '').trim();
  const expectedRef = extractSupabaseUrlRef(supabaseUrl);
  const anonKey = pickMatchingKey(process.env.SUPABASE_ANON_KEY, expectedRef);
  const serviceKey = pickMatchingKey(process.env.SUPABASE_SERVICE_ROLE_KEY, expectedRef);
  if (!supabaseUrl || !anonKey || !serviceKey) {
    return res.status(503).json({ error: 'Supabase server configuration is missing.' });
  }

  const authClient = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const adminClient = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const token = authHeader.slice(7);
  const { data: { user }, error: authError } = await authClient.auth.getUser(token);
  if (authError || !user) {
    return res.status(404).json({ error: 'Not found' });
  }

  const smtpUser = (process.env.SMTP_USER || '').trim().replace(/^['"]|['"]$/g, '');
  const smtpPass = (process.env.SMTP_PASS || '').trim().replace(/[\s'"]/g, '');
  if (!smtpUser || !smtpPass) {
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
  if (typeof event !== 'string' || !ALLOWED_NOTIFICATION_EVENTS.has(event)) {
    return res.status(400).json({ error: 'Invalid notification event.' });
  }
  if (typeof to !== 'string' || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to.trim())) {
    return res.status(400).json({ error: 'Invalid recipient.' });
  }

  const callerEmail = (user.email || '').trim().toLowerCase();
  const recipientEmail = to.trim().toLowerCase();

  if (callerEmail !== recipientEmail) {
    const { data: profile } = await adminClient
      .from('profiles')
      .select('role, status')
      .eq('id', user.id)
      .maybeSingle();

    const isPrivilegedRole = profile?.role === 'admin';
    if (!profile || !isPrivilegedRole || profile.status !== 'approved') {
      return res.status(403).json({ error: 'Unauthorized to send notifications to other recipients.' });
    }
  }

  let transporter: any = null;
  try {
    const mod = await import('nodemailer');
    const nodemailer = mod.default || mod;
    transporter = (nodemailer.createTransport as any)({
      host: (process.env.SMTP_HOST || 'smtp.gmail.com').trim(),
      port: Number(process.env.SMTP_PORT) || 465,
      secure: (process.env.SMTP_SECURE === 'true' || Number(process.env.SMTP_PORT) === 465),
      auth: { user: smtpUser, pass: smtpPass },
      pool: false,
      connectionTimeout: 4000,
      greetingTimeout: 4000,
      socketTimeout: 4000,
    });

    const appUrl = resolveServerAppUrl(req);
    const payloadData = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
    const primaryMessage = renderNotificationEmail(event, payloadData, appUrl);
    const from = (process.env.SMTP_FROM || smtpUser || `CICR Inventory <${smtpUser}>`).trim().replace(/^['"]|['"]$/g, '');

    const shouldNotifyAdmins = ADMIN_ALERT_EVENTS.has(event) || payloadData.notifyAdmins === true;
    const sendPrimary = transporter.sendMail({ from, to: recipientEmail, ...primaryMessage });

    let sendAdminAlert: Promise<unknown> | null = null;
    if (shouldNotifyAdmins && ADMIN_ALERT_EVENTS.has(event)) {
      const adminList = await resolveAdminAlertRecipients(adminClient, recipientEmail);
      if (adminList.length > 0) {
        const adminMessage = renderAdminAlertEmail(event, payloadData, appUrl);
        sendAdminAlert = transporter
          .sendMail({
            from,
            to: adminList[0],
            ...(adminList.length > 1 ? { bcc: adminList.slice(1) } : {}),
            ...adminMessage,
          })
          .catch((adminErr: unknown) => {
            console.warn(`Admin alert email notice for ${event}:`, adminErr);
          });
      }
    }

    await Promise.race([
      sendAdminAlert ? Promise.all([sendPrimary, sendAdminAlert]) : sendPrimary,
      new Promise((_, reject) => setTimeout(() => reject(new Error('SMTP transmission timed out')), 6500)),
    ]);

    return res.status(202).json({ sent: true });
  } catch (error) {
    console.error('SMTP delivery failed:', error);
    const errCode = typeof (error as any)?.code === 'string' ? (error as any).code : '';
    const errMsg = error instanceof Error ? error.message : '';
    const isAuthFailure =
      errCode === 'EAUTH' ||
      /535\b|BadCredentials|Username and Password not accepted|Invalid login/i.test(errMsg);
    return res.status(502).json({
      error: isAuthFailure
        ? 'SMTP authentication failed. Update SMTP_PASS with a valid Google App Password.'
        : 'Email delivery failed.',
    });
  } finally {
    try {
      transporter?.close?.();
    } catch {}
  }
}
