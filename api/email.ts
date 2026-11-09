import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

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

const MASTER_ADMIN_EMAILS = [
  'vardaansaxena096@gmail.com',
  'cicrinventory@gmail.com',
  'cicrinventoryofficial@gmail.com',
  '992501030399@mail.jiit.ac.in',
];

const DEFAULT_APP_URL = 'https://inventory.cicr.in';

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

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function renderEmail(event: string, data: Record<string, unknown>, resolvedAppUrl?: string) {
  const name = String(data.name || 'CICR member');
  const item = data.item ? String(data.item) : '';
  const status = data.status ? String(data.status) : '';
  const dueDate = data.dueDate ? String(data.dueDate) : '';
  const project = data.project ? String(data.project) : '';
  const notes = data.notes ? String(data.notes) : '';

  const subjects: Record<string, string> = {
    login: 'CICR Inventory sign-in notification',
    logout: 'CICR Inventory sign-out notification',
    account_created: 'CICR registration received - awaiting approval',
    account_approved: 'CICR account approved - access granted',
    account_rejected: 'CICR account rejected - registration update',
    role_updated: 'CICR account privileges updated',
    borrow_requested: 'CICR borrow request received',
    borrow_approved: 'CICR borrow request approved',
    borrow_rejected: 'CICR borrow request rejected',
    item_returned: 'CICR item return recorded',
    return_reminder: 'CICR item return reminder',
  };

  const messages: Record<string, string> = {
    login: `Hello ${name},\n\nA sign-in to your CICR Inventory account was recorded.`,
    logout: `Hello ${name},\n\nA sign-out from your CICR Inventory account was recorded.`,
    account_created: `Hello ${name},\n\nYour CICR Inventory account has been registered successfully and is awaiting administrator approval. You will receive another email when an administrator approves or rejects your registration.`,
    account_approved: `Hello ${name},\n\nYour CICR Inventory account has been approved by an administrator. You can now sign in and use CICR Inventory.`,
    account_rejected: `Hello ${name},\n\nYour CICR Inventory registration has been rejected by an administrator. Please contact CICR leadership if you need more information.`,
    role_updated: `Hello ${name},\n\nYour CICR Inventory account role has been updated to ${data.role ? String(data.role).toUpperCase() : 'MEMBER'}.`,
    borrow_requested: `Hello ${name},\n\nYour equipment borrow request was submitted and is awaiting review.`,
    borrow_approved: `Hello ${name},\n\nYour equipment borrow request was approved.`,
    borrow_rejected: `Hello ${name},\n\nYour equipment borrow request was rejected.`,
    item_returned: `Hello ${name},\n\nYour equipment return was recorded successfully.`,
    return_reminder: `Hello ${name},\n\nThis is a reminder that an equipment return is due soon or overdue.`,
  };

  const layouts: Record<string, { label: string; title: string; action: string; path: string }> = {
    login: { label: 'SECURITY // ACCESS AUTHORIZED', title: 'New login detected', action: 'OPEN CICR VAULT', path: '/' },
    logout: { label: 'SECURITY // SESSION CLOSED', title: 'Session closed successfully', action: 'OPEN CICR VAULT', path: '/' },
    account_created: { label: 'ACCOUNT // REVIEW PENDING', title: 'Registration received', action: 'CHECK ACCOUNT STATUS', path: '/' },
    account_approved: { label: 'ACCOUNT // ACCESS APPROVED', title: 'Your account is ready', action: 'OPEN CICR VAULT', path: '/' },
    account_rejected: { label: 'ACCOUNT // REVIEW COMPLETE', title: 'Registration update', action: 'CONTACT CICR', path: '/' },
    role_updated: { label: 'ACCOUNT // ROLE UPDATED', title: 'Account privileges updated', action: 'OPEN CICR VAULT', path: '/' },
    borrow_requested: { label: 'REQUEST // SUBMITTED', title: 'Borrow request submitted', action: 'VIEW MY REQUESTS', path: '/requests' },
    borrow_approved: { label: 'REQUEST // APPROVED', title: 'Borrow request approved', action: 'VIEW EQUIPMENT', path: '/inventory' },
    borrow_rejected: { label: 'REQUEST // DECLINED', title: 'Borrow request needs attention', action: 'VIEW REQUEST DETAILS', path: '/requests' },
    item_returned: { label: 'INVENTORY // RETURN RECORDED', title: 'Return recorded', action: 'VIEW INVENTORY', path: '/inventory' },
    return_reminder: { label: 'REMINDER // ACTION REQUIRED', title: 'Return reminder', action: 'VIEW ACTIVE LOANS', path: '/requests' },
  };
  const layout = layouts[event] || { label: 'SYSTEM // NOTIFICATION', title: 'CICR Inventory update', action: 'OPEN CICR VAULT', path: '/' };
  const accent = event === 'account_rejected' || event === 'borrow_rejected'
    ? '#ff2d8d'
    : event === 'return_reminder'
    ? '#ffc928'
    : '#00e5ff';
  const detailRows = [
    ['NAME', escapeHtml(name)],
    ...(data.email ? [['EMAIL', escapeHtml(data.email)]] : []),
    ...(data.role ? [['ROLE', escapeHtml(data.role).toUpperCase()]] : []),
    ...(item ? [['ITEM', escapeHtml(item)]] : []),
    ...(status ? [['STATUS', escapeHtml(status).toUpperCase()]] : []),
    ...(dueDate ? [['DUE DATE', escapeHtml(dueDate)]] : []),
    ...(project ? [['PROJECT', escapeHtml(project)]] : []),
    ...(notes ? [['NOTE', escapeHtml(notes)]] : []),
    ['DATE', new Date().toLocaleString('en-IN', { dateStyle: 'full', timeStyle: 'short', timeZone: 'Asia/Kolkata' })],
  ];
  const detailsHtml = detailRows
    .map(([label, value]) => `<tr><td style="padding:8px 0;color:#77839d;font:11px Arial,sans-serif;letter-spacing:1px;width:34%">${label}</td><td style="padding:8px 0;color:#f5f7fb;font:600 13px Arial,sans-serif">${value}</td></tr>`)
    .join('');
  const appUrl = normalizeServerOrigin(resolvedAppUrl) || resolveServerAppUrl();
  const html = `<!doctype html>
<html><body style="margin:0;background:#05070d;color:#eef2f8;font-family:Arial,sans-serif">
  <div style="padding:28px 12px;background:#05070d">
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:640px;margin:auto;background:#0d1320;border:1px solid #1e2a3d;border-radius:6px;overflow:hidden">
      <tr><td style="padding:20px 24px;border-bottom:1px solid #1e2a3d">
        <div style="font-size:18px;font-weight:800;letter-spacing:2px;color:#f5dc72"><span style="background:#f5dc72;color:#0d1320;padding:2px 5px">CICR</span> <span style="color:#00e5ff">//</span> INVENTORY</div>
        <div style="margin-top:7px;color:#77839d;font-size:9px;letter-spacing:2px">CENTRE FOR INNOVATION, CONTROL &amp; ROBOTICS</div>
      </td></tr>
      <tr><td style="padding:24px">
        <div style="display:inline-block;padding:6px 9px;border:1px solid ${accent};color:${accent};font:700 10px monospace;letter-spacing:1px">${layout.label}</div>
        <h1 style="margin:18px 0 8px;color:#f5f7fb;font-size:21px">${layout.title}</h1>
        <p style="margin:0;color:#9aa7bc;font-size:13px;line-height:1.6">${escapeHtml(messages[event] || 'There is an update for your CICR Inventory account.').replace(/\n/g, '<br>')}</p>
        <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:22px 0;padding:12px 16px;background:#080c14;border:1px solid #202b3c;border-radius:5px">${detailsHtml}</table>
        <a href="${escapeHtml(`${appUrl}${layout.path}`)}" style="display:inline-block;padding:13px 24px;background:#00d9ed;color:#041018;text-decoration:none;font:800 12px Arial,sans-serif;letter-spacing:1px;border-radius:3px">${layout.action}</a>
        <p style="margin:22px 0 0;color:#77839d;font-size:11px;line-height:1.6">This is an automated system transmission. If you did not initiate this activity, please contact a CICR administrator.</p>
      </td></tr>
      <tr><td style="padding:16px 24px;border-top:1px solid #1e2a3d;color:#66738b;font-size:10px;line-height:1.5">AUTOMATED TRANSMISSION // NO-REPLY<br>CICR Inventory &bull; Centre for Innovation, Control &amp; Robotics</td></tr>
    </table>
  </div>
</body></html>`;

  return {
    subject: subjects[event] || 'CICR Inventory notification',
    text: `${messages[event] || `Hello ${name},\n\nThere is an update for your CICR Inventory account.`}${item ? `\nItem: ${item}` : ''}${status ? `\nStatus: ${status}` : ''}${dueDate ? `\nDue date: ${dueDate}` : ''}\n\nCICR Inventory`,
    html,
  };
}

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

  const supabaseUrl = (process.env.SUPABASE_URL || DEFAULT_URL).trim();
  const expectedRef = extractSupabaseUrlRef(supabaseUrl) || DEFAULT_REF;
  const rawAnonKey = (process.env.SUPABASE_ANON_KEY || '').trim();
  const keyRef = extractJwtRef(rawAnonKey);
  const supabaseKey = rawAnonKey && (!keyRef || !expectedRef || keyRef === expectedRef) ? rawAnonKey : DEFAULT_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return res.status(503).json({ error: 'Supabase server configuration is missing.' });
  }
  const supabase = createClient(supabaseUrl, supabaseKey, { auth: { autoRefreshToken: false, persistSession: false } });

  const token = authHeader.slice(7);
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
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

    const message = renderEmail(event, data && typeof data === 'object' ? data : {}, resolveServerAppUrl(req));
    const from = (process.env.SMTP_FROM || smtpUser || `CICR Inventory <${smtpUser}>`).trim().replace(/^['"]|['"]$/g, '');
    await Promise.race([
      transporter.sendMail({ from, to, ...message }),
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
