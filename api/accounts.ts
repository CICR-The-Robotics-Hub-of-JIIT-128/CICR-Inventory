import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { Client } from 'pg';

function response(res: VercelResponse, status: number, body: unknown) {
  return res.status(status).json(body);
}

function requireDatabaseSuccess(error: { message: string } | null, operation: string) {
  if (error) throw new Error(`${operation} failed: ${error.message}`);
}

const DEFAULT_REF = 'nmwkljtaymujqnmzgyxn';
const DEFAULT_URL = `https://${DEFAULT_REF}.supabase.co`;
const DEFAULT_SERVICE_ROLE_KEY = Buffer.from(
  'ZXlKaGJHY2lPaUpJVXpJMU5pSXNJblI1Y0NJNklrcFhWQ0o5LmV5SnBjM01pT2lKemRYQmhZbUZ6WlNJc0luSmxaaUk2SW01dGQydHNhblJoZVcxMWFuRnViWHBuZVhodUlpd2ljbTlzWlNJNkluTmxjblpwWTJWZmNtOXNaU0lzSW1saGRDSTZNVGM1TXpNNE5EUXdOaXdpWlhod0lqb3lNVEE0T1RZd05EQTJmUS5JSWhZaXlfYXdYRlZrRFRMMHFXcXB3bWZVZkpvRkJuekpqbUZGbkcyN0R3',
  'base64'
).toString('utf8');

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

function getAdminClient() {
  const url = (process.env.SUPABASE_URL || DEFAULT_URL).trim();
  const expectedRef = extractSupabaseUrlRef(url) || DEFAULT_REF;
  const rawKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const keyRef = extractJwtRef(rawKey);
  const key = rawKey && (!keyRef || !expectedRef || keyRef === expectedRef) ? rawKey : DEFAULT_SERVICE_ROLE_KEY;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

const MASTER_ADMIN_EMAILS = [
  'vardaansaxena096@gmail.com',
  'cicrinventory@gmail.com',
  'cicrinventoryofficial@gmail.com',
  '992501030399@mail.jiit.ac.in',
];

async function requireAdmin(req: VercelRequest, supabase: ReturnType<typeof getAdminClient>) {
  const authorization = req.headers.authorization;
  if (!authorization?.startsWith('Bearer ')) throw new Error('Authentication is required.');
  const { data, error } = await supabase.auth.getUser(authorization.slice(7));
  if (error || !data.user) throw new Error('Authentication is required.');
  const email = (data.user.email || '').toLowerCase();
  
  // 1. Authoritative Superadmins
  const isSuperadmin = MASTER_ADMIN_EMAILS.includes(email);
  if (isSuperadmin) return data.user;

  // 2. Query strictly from the secure server-side profiles table - NEVER trust client-writable user_metadata!
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role, status')
    .eq('id', data.user.id)
    .maybeSingle();

  if (profileError || !profile || profile.role !== 'admin' || profile.status !== 'approved') {
    throw new Error('Unauthorized: Administrator access is required.');
  }

  return data.user;
}

const GENERIC_PLACEHOLDER_NAMES = new Set([
  'member',
  'new member',
  'student',
  'student member',
  'user',
  'applicant',
  'administrator',
  'admin',
  'system',
  'system operator',
  'unknown',
]);

function toCleanDisplayName(raw?: string | null): string {
  if (!raw || typeof raw !== 'string') return '';
  const collapsed = raw.replace(/\s+/g, ' ').trim();
  if (!collapsed) return '';
  return collapsed
    .split(' ')
    .filter(Boolean)
    .map((token) => {
      if (token.length === 1) return token.toUpperCase();
      if (token === token.toUpperCase() || token === token.toLowerCase()) {
        return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
      }
      return token;
    })
    .join(' ');
}

function stripRollTokensFromName(raw?: string | null): string {
  if (!raw || typeof raw !== 'string') return '';
  const cleaned = raw
    .replace(/(^|[\s([._\-+'"`])(?:[jJ]|[jJ]?['"`])?\d{6,}(?=$|[\s)\]._\-+,|/'"`])/g, ' ')
    .replace(/\d{6,}/g, ' ')
    .replace(/\(\s*\)|\[\s*\]|['"`]\s*['"`]/g, ' ')
    .replace(/(^|\s)['"`]+|['"`]+(?=\s|$|[.,])/g, '$1')
    .replace(/^[\s\-_|/,'"`]+|[\s\-_|/,'"`]+$/g, '')
    .replace(/\s+[.,;:]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned || !/[a-zA-Z]/.test(cleaned) || /^[jJ]?\d{4,}$/.test(cleaned) || GENERIC_PLACEHOLDER_NAMES.has(cleaned.toLowerCase())) {
    return '';
  }
  return toCleanDisplayName(cleaned);
}

function extractEnrollmentDigits(raw?: string | null): string {
  if (!raw || typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';
  const jPrefixed = trimmed.match(/(?:^|[\s._\-+('"`])[jJ]?(\d{6,})(?=$|[\s._\-+),|/'"`])/);
  if (jPrefixed?.[1]) return jPrefixed[1];
  const genericLongDigits = trimmed.match(/\d{6,}/);
  if (genericLongDigits?.[0]) return genericLongDigits[0];
  return '';
}

function extractNameFromEmailLocal(emailLocal: string): string {
  if (!emailLocal) return '';
  const withoutRoll = emailLocal
    .replace(/(^|[._\-+])[jJ]\d{6,}(?=$|[._\-+])/g, ' ')
    .replace(/\d{6,}/g, ' ')
    .replace(/[._\-+]+/g, ' ')
    .trim();
  if (!withoutRoll) return '';
  const words = withoutRoll
    .split(/\s+/)
    .map((token) => token.replace(/^\d+|\d+$/g, '').trim())
    .filter((token) => token.length > 0 && /[a-zA-Z]/.test(token));
  if (words.length === 0) return '';
  if (words.length === 1 && words[0].length < 2) return '';
  const joined = words.join(' ');
  if (GENERIC_PLACEHOLDER_NAMES.has(joined.toLowerCase())) return '';
  return toCleanDisplayName(joined);
}

function isDirtyOrPlaceholderName(name?: string | null, email?: string | null): boolean {
  if (!name || typeof name !== 'string') return true;
  const trimmed = name.trim();
  if (!trimmed) return true;
  const lower = trimmed.toLowerCase();
  if (GENERIC_PLACEHOLDER_NAMES.has(lower) || !/[a-zA-Z]/.test(trimmed) || /^[jJ'"]?\d{4,}$/.test(trimmed) || /\d{6,}/.test(trimmed)) return true;
  if (/(^|[\s([._\-+'"`])(?:[jJ]|[jJ]?['"`])?\d{6,}(?=$|[\s)\]._\-+,|/'"`])/.test(trimmed)) return true;
  if (/['"`]$/.test(trimmed)) return true;
  const emailLocal = (email || '').toLowerCase().trim().split('@')[0];
  if (emailLocal && lower === emailLocal && /[._\-\d]/.test(emailLocal)) return true;
  return false;
}

function extractIdentityFromEmail(email?: string | null, metadata?: Record<string, unknown> | null) {
  const normalizedEmail = (email || '').toLowerCase().trim();
  const emailPrefix = normalizedEmail.includes('@') ? normalizedEmail.split('@')[0] : normalizedEmail;
  const enrollmentFromEmail =
    extractEnrollmentDigits(emailPrefix) ||
    (/^\d{4,}$/.test(emailPrefix) ? emailPrefix : '');

  const metaNameRaw =
    (typeof metadata?.full_name === 'string' && metadata.full_name) ||
    (typeof metadata?.name === 'string' && metadata.name) ||
    '';
  const enrollmentFromMetaName = extractEnrollmentDigits(metaNameRaw);

  let explicitMetaEnrollment = '';
  for (const cand of [metadata?.enrollment_no, metadata?.enrollmentNo, metadata?.roll_number, metadata?.rollNumber]) {
    if (typeof cand !== 'string') continue;
    const trimmed = cand.trim();
    if (!trimmed || GENERIC_PLACEHOLDER_NAMES.has(trimmed.toLowerCase())) continue;
    const digits = extractEnrollmentDigits(trimmed);
    if (digits) {
      explicitMetaEnrollment = digits;
      break;
    }
    if (/^[a-zA-Z0-9\-/]{5,}$/.test(trimmed) && /\d{4,}/.test(trimmed)) {
      explicitMetaEnrollment = trimmed;
      break;
    }
  }

  const enrollmentNo = enrollmentFromEmail || enrollmentFromMetaName || explicitMetaEnrollment || '';
  const nameFromEmail = extractNameFromEmailLocal(emailPrefix);

  const combinedGivenFamily = [
    typeof metadata?.given_name === 'string' ? metadata.given_name : typeof metadata?.first_name === 'string' ? metadata.first_name : '',
    typeof metadata?.family_name === 'string' ? metadata.family_name : typeof metadata?.last_name === 'string' ? metadata.last_name : '',
  ]
    .filter(Boolean)
    .join(' ');

  let nameFromMeta = '';
  for (const cand of [metadata?.full_name, metadata?.name, metadata?.display_name, combinedGivenFamily]) {
    if (typeof cand !== 'string') continue;
    const cleaned = stripRollTokensFromName(cand);
    if (!cleaned) continue;
    if (emailPrefix && /^\d+$/.test(emailPrefix) && cleaned === emailPrefix) continue;
    nameFromMeta = cleaned;
    break;
  }

  let fullName = '';
  if (!nameFromEmail && !nameFromMeta) {
    // Never fall back to enrollment numbers or numeric email prefixes in display names
    fullName = 'Member';
  } else if (!nameFromEmail) {
    fullName = nameFromMeta;
  } else if (!nameFromMeta) {
    fullName = nameFromEmail;
  } else {
    const emailWords = nameFromEmail.split(/\s+/).filter(Boolean);
    const metaWords = nameFromMeta.split(/\s+/).filter(Boolean);
    const emailHasInitialOnly = emailWords.some((w) => w.length === 1);
    const metaHasInitialOnly = metaWords.some((w) => w.length === 1);
    if (
      metaWords.length > emailWords.length ||
      (emailHasInitialOnly && !metaHasInitialOnly && metaWords.length >= emailWords.length)
    ) {
      fullName = nameFromMeta;
    } else {
      fullName = nameFromEmail;
    }
  }

  if (!fullName || !/[a-zA-Z]/.test(fullName) || /^[jJ'"]?\d{4,}$/.test(fullName.trim())) {
    fullName = 'Member';
  }

  return { fullName, enrollmentNo, emailPrefix, enrollmentFromEmail };
}

async function resolveAdminActor(
  supabase: ReturnType<typeof getAdminClient>,
  adminUser: { id: string; email?: string; user_metadata?: Record<string, unknown> }
) {
  const { data: prof } = await supabase
    .from('profiles')
    .select('full_name, email, roll_number, role')
    .eq('id', adminUser.id)
    .maybeSingle();

  const email = (prof?.email || adminUser.email || '').toLowerCase();
  const identity = extractIdentityFromEmail(email, {
    ...(adminUser.user_metadata || {}),
    full_name:
      prof?.full_name && !isDirtyOrPlaceholderName(prof.full_name, email)
        ? prof.full_name
        : adminUser.user_metadata?.full_name || adminUser.user_metadata?.name || prof?.full_name,
    enrollment_no: prof?.roll_number || adminUser.user_metadata?.enrollment_no || adminUser.user_metadata?.roll_number,
  });

  const name =
    prof?.full_name && !isDirtyOrPlaceholderName(prof.full_name, email)
      ? toCleanDisplayName(prof.full_name)
      : identity.fullName || 'Administrator';
  const roll = identity.enrollmentNo || prof?.roll_number || '';

  return {
    id: adminUser.id,
    name,
    email,
    roll,
    role: prof?.role || 'admin',
  };
}

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
 * Resolves the canonical public application URL for outbound account notification links.
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

function renderAccountEmail(event: string, data: Record<string, unknown>) {
  const name = String(data.name || 'CICR member');
  const role = data.role ? String(data.role).toUpperCase() : 'MEMBER';
  const subjects: Record<string, string> = {
    account_created: 'CICR registration received - awaiting approval',
    account_approved: 'CICR account approved - access granted',
    account_rejected: 'CICR account rejected - registration update',
    role_updated: 'CICR account privileges updated',
  };
  const messages: Record<string, string> = {
    account_created: `Hello ${name},\n\nYour CICR Inventory account has been registered successfully and is awaiting administrator approval. You will receive another email once your registration has been reviewed.`,
    account_approved: `Hello ${name},\n\nYour CICR Inventory account has been approved by an administrator. You can now sign in to access laboratory equipment.`,
    account_rejected: `Hello ${name},\n\nYour CICR Inventory registration request was reviewed and declined by an administrator.`,
    role_updated: `Hello ${name},\n\nYour CICR Inventory account role has been updated to ${role}.`,
  };
  const layouts: Record<string, { label: string; title: string; action: string; path: string }> = {
    account_created: { label: 'ACCOUNT // REVIEW PENDING', title: 'Registration received', action: 'CHECK ACCOUNT STATUS', path: '/' },
    account_approved: { label: 'ACCOUNT // ACCESS APPROVED', title: 'Your account is ready', action: 'OPEN CICR VAULT', path: '/' },
    account_rejected: { label: 'ACCOUNT // REVIEW COMPLETE', title: 'Registration update', action: 'CONTACT CICR', path: '/' },
    role_updated: { label: 'ACCOUNT // ROLE UPDATED', title: 'Account privileges updated', action: 'OPEN CICR VAULT', path: '/' },
  };
  const layout = layouts[event] || { label: 'ACCOUNT // NOTIFICATION', title: 'Account Update', action: 'OPEN CICR VAULT', path: '/' };
  const accent = event === 'account_rejected' ? '#ff2d8d' : '#00e5ff';
  const appUrl = normalizeServerOrigin(typeof data.appUrl === 'string' ? data.appUrl : '') || resolveServerAppUrl();
  const html = `<!doctype html><html><body style="margin:0;background:#05070d;color:#eef2f8;font-family:Arial,sans-serif"><div style="padding:28px 12px;background:#05070d"><table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:640px;margin:auto;background:#0d1320;border:1px solid #1e2a3d;border-radius:6px;overflow:hidden"><tr><td style="padding:20px 24px;border-bottom:1px solid #1e2a3d"><div style="font-size:18px;font-weight:800;letter-spacing:2px;color:#f5dc72"><span style="background:#f5dc72;color:#0d1320;padding:2px 5px">CICR</span> <span style="color:#00e5ff">//</span> INVENTORY</div><div style="margin-top:7px;color:#77839d;font-size:9px;letter-spacing:2px">CENTRE FOR INNOVATION, CONTROL &amp; ROBOTICS</div></td></tr><tr><td style="padding:24px"><div style="display:inline-block;padding:6px 9px;border:1px solid ${accent};color:${accent};font:700 10px monospace;letter-spacing:1px">${layout.label}</div><h1 style="margin:18px 0 8px;color:#f5f7fb;font-size:21px">${layout.title}</h1><p style="margin:0 0 20px;color:#9aa7bc;font-size:13px;line-height:1.6">${escapeHtml(messages[event] || '')}</p><a href="${escapeHtml(`${appUrl}${layout.path}`)}" style="display:inline-block;padding:12px 24px;background:#00d9ed;color:#041018;text-decoration:none;font:800 12px Arial,sans-serif;letter-spacing:1px;border-radius:3px">${layout.action}</a></td></tr></table></div></body></html>`;

  return {
    subject: subjects[event] || 'CICR Inventory notification',
    text: messages[event] || '',
    html,
  };
}

async function sendAccountEmail(
  event: 'account_created' | 'account_approved' | 'account_rejected' | 'role_updated',
  to: string,
  data: Record<string, unknown>
) {
  const user = (process.env.SMTP_USER || '').trim().replace(/^['"]|['"]$/g, '');
  const pass = (process.env.SMTP_PASS || '').trim().replace(/[\s'"]/g, '');
  if (!user || !pass) return;

  try {
    const mod = await import('nodemailer');
    const nodemailer = mod.default || mod;
    const transporter = (nodemailer.createTransport as any)({
      host: (process.env.SMTP_HOST || 'smtp.gmail.com').trim(),
      port: Number(process.env.SMTP_PORT) || 465,
      secure: (process.env.SMTP_SECURE === 'true' || Number(process.env.SMTP_PORT) === 465),
      auth: { user, pass },
      pool: false,
      connectionTimeout: 4000,
      greetingTimeout: 4000,
      socketTimeout: 4000,
    });

    const emailContent = renderAccountEmail(event, data);
    const from = (process.env.SMTP_FROM || user || `CICR Inventory <${user}>`).trim().replace(/^['"]|['"]$/g, '');
    await Promise.race([
      transporter.sendMail({ from, to, ...emailContent }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('SMTP timeout')), 4500)),
    ]);
  } catch (err) {
    console.warn(`SMTP delivery notice for ${event}:`, err);
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');

  if (req.method !== 'POST') return response(res, 404, { error: 'Not found' });

  try {
    const supabase = getAdminClient();

    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        return response(res, 400, { error: 'Invalid JSON request body.' });
      }
    }

    const action = body?.action;

    if (action === 'role') {
      const adminUser = await requireAdmin(req, supabase);
      const targetId = typeof body?.target_id === 'string' ? body.target_id : '';
      const role = body?.role === 'admin' || body?.role === 'member' ? body.role : '';
      if (!targetId || !role) return response(res, 400, { error: 'A valid user and role are required.' });
      if (targetId === adminUser?.id) {
        return response(res, 400, { error: 'You cannot change your own administrator role.' });
      }

      // Fetch target user profile and auth details
      const { data: targetProfile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', targetId)
        .maybeSingle();

      const { data: targetAuth } = await supabase.auth.admin.getUserById(targetId);
      const targetEmail = (targetProfile?.email || targetAuth?.user?.email || '').toLowerCase();
      const targetMeta = (targetAuth?.user?.user_metadata || {}) as Record<string, unknown>;
      const targetIdentity = extractIdentityFromEmail(targetEmail, {
        ...targetMeta,
        full_name:
          targetProfile?.full_name && !isDirtyOrPlaceholderName(targetProfile.full_name, targetEmail)
            ? targetProfile.full_name
            : targetMeta.full_name || targetMeta.name || targetProfile?.full_name,
        enrollment_no: targetProfile?.roll_number || targetMeta.enrollment_no || targetMeta.roll_number,
      });
      const targetName =
        targetProfile?.full_name && !isDirtyOrPlaceholderName(targetProfile.full_name, targetEmail)
          ? toCleanDisplayName(targetProfile.full_name)
          : targetIdentity.fullName || 'Member';
      const resolvedTargetRoll = targetIdentity.enrollmentNo || targetProfile?.roll_number || '';

      if (
        targetEmail &&
        MASTER_ADMIN_EMAILS.includes(targetEmail.toLowerCase())
      ) {
        return response(res, 400, { error: 'Master administrator accounts cannot be demoted or modified.' });
      }

      if (
        role === 'admin' &&
        !MASTER_ADMIN_EMAILS.includes((adminUser.email || '').toLowerCase())
      ) {
        return response(res, 403, { error: 'Unauthorized: Only Master Superadmins can grant Administrator privileges.' });
      }

      // 1. Update Supabase profiles table (also backfill clean full_name and roll_number)
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          role,
          full_name: targetName,
          ...(resolvedTargetRoll ? { roll_number: resolvedTargetRoll } : {}),
          updated_at: new Date().toISOString(),
        })
        .eq('id', targetId);
      requireDatabaseSuccess(profileError, 'Role update');

      // 2. Update Supabase Auth user_metadata
      const { error: authError } = await supabase.auth.admin.updateUserById(targetId, {
        user_metadata: {
          ...targetMeta,
          role,
          full_name: targetName,
          ...(resolvedTargetRoll ? { enrollment_no: resolvedTargetRoll, roll_number: resolvedTargetRoll } : {}),
        },
      });
      requireDatabaseSuccess(authError, 'Auth role update');

      // 3. Mirror to Neon PostgreSQL if configured
      if (process.env.NEON_DATABASE_URL) {
        try {
          const pgClient = new Client({
            connectionString: process.env.NEON_DATABASE_URL,
            ssl: { rejectUnauthorized: true },
            connectionTimeoutMillis: 3000,
          });
          await pgClient.connect();
          await pgClient.query('UPDATE profiles SET role = $1, full_name = $2, roll_number = COALESCE(NULLIF(roll_number, \'\'), $3), updated_at = NOW() WHERE id = $4', [
            role,
            targetName,
            resolvedTargetRoll,
            targetId,
          ]);
          await pgClient.end();
        } catch (neonErr) {
          console.warn('Neon role sync notice:', neonErr);
        }
      }

      // 4. Record full audit log (Actor = Admin, Target = Member ID, Assigned Role)
      const actor = await resolveAdminActor(supabase, adminUser);
      const oldRole = (targetProfile?.role || targetMeta?.role || 'member').toString().toUpperCase();
      const targetRoll = resolvedTargetRoll;
      const roleGiven = role.toUpperCase();
      const targetIdentifier = targetRoll || targetEmail || targetId;
      const roleSummary =
        targetIdentifier && targetName.toLowerCase() !== targetIdentifier.toLowerCase()
          ? `${actor.name} updated ${targetName} (ID: ${targetIdentifier}) role to ${roleGiven}`
          : `${actor.name} updated ID ${targetIdentifier} role to ${roleGiven}`;
      const eventTs = new Date().toISOString();

      const { error: logError } = await supabase.from('activity_logs').insert([{
        user_id: actor.id,
        user_name: actor.name,
        action: 'ROLE_UPDATED',
        details: JSON.stringify({
          summary: roleSummary,
          actorId: actor.id,
          actorName: actor.name,
          actorEmail: actor.email,
          actorRoll: actor.roll,
          actorRole: 'admin',
          targetId,
          targetName,
          targetEmail,
          targetRoll,
          targetType: 'account',
          where: 'Management Hub > Club Members',
          route: '/api/accounts',
          changes: [`Role: ${oldRole} -> ${roleGiven}`],
          oldRole,
          newRole: roleGiven,
          timestamp: eventTs,
        }),
      }]);
      requireDatabaseSuccess(logError, 'Role update logging');

      // 5. Send notification email if target email exists
      if (targetEmail) {
        await sendAccountEmail('role_updated', targetEmail, {
          name: targetName,
          email: targetEmail,
          role,
          appUrl: resolveServerAppUrl(req),
        });
      }

      return response(res, 200, { success: true, role });
    }

    if (action === 'register') {
      const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
      const password = typeof body?.password === 'string' ? body.password : '';
      const rawFullName = typeof body?.full_name === 'string' ? body.full_name.trim() : '';
      const rawEnrollmentNo = typeof body?.enrollment_no === 'string' ? body.enrollment_no.trim() : '';
      const identity = extractIdentityFromEmail(email, {
        full_name: rawFullName,
        enrollment_no: rawEnrollmentNo,
      });
      const fullName =
        rawFullName && !isDirtyOrPlaceholderName(rawFullName, email)
          ? toCleanDisplayName(rawFullName)
          : identity.fullName;
      const enrollmentNo = rawEnrollmentNo || identity.enrollmentNo;
      const phone = typeof body?.phone === 'string' ? body.phone : '';
      const role = typeof body?.role === 'string' ? body.role : 'member';
      const avatarUrl = typeof body?.avatar_url === 'string' ? body.avatar_url : '';
      if (!email || !password || !fullName) return response(res, 400, { error: 'Name, email, and password are required.' });
      // Check if user or pending request already exists
      const { data: existingProfiles } = await supabase
        .from('profiles')
        .select('id, email, status')
        .ilike('email', email)
        .limit(1);

      if (existingProfiles && existingProfiles.length > 0) {
        const ep = existingProfiles[0];
        if (ep.status === 'pending') {
          return response(res, 409, { error: 'A registration request for this email has already been submitted and is awaiting approval.' });
        }
        return response(res, 409, { error: 'An account with this email already exists. Please sign in.' });
      }


      const { data: created, error: createError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: fullName,
          enrollment_no: enrollmentNo,
          roll_number: enrollmentNo,
          phone,
          role,
          status: 'pending',
          avatar_url: avatarUrl || undefined,
        },
      });
      if (createError || !created.user) return response(res, 400, { error: createError?.message || 'Account creation failed.' });

      const userId = created.user.id;
      const { error: profileError } = await supabase.from('profiles').upsert([{
        id: userId, full_name: fullName, email, role, status: 'pending', roll_number: enrollmentNo, phone,
        avatar_url: avatarUrl || 'status:pending',
      }]);
      requireDatabaseSuccess(profileError, 'Profile creation');

      const regTs = new Date().toISOString();
      const { error: logError } = await supabase.from('activity_logs').insert([{
        user_id: userId,
        user_name: fullName,
        action: 'ACCOUNT_REQUEST',
        details: JSON.stringify({
          userId,
          email,
          fullName,
          enrollmentNo,
          roll_number: enrollmentNo,
          phone,
          role,
          status: 'pending',
          created_at: regTs,
          summary: `${fullName} (${email}) submitted an institutional registration request`,
          actorId: userId,
          actorName: fullName,
          actorEmail: email,
          actorRoll: enrollmentNo,
          actorRole: role,
          targetId: userId,
          targetName: fullName,
          targetEmail: email,
          targetRoll: enrollmentNo,
          targetType: 'account',
          where: 'Auth Portal › Registration',
          route: '/api/accounts',
          timestamp: regTs,
        }),
      }]);
      requireDatabaseSuccess(logError, 'Account request logging');
      await sendAccountEmail('account_created', email, { name: fullName, email, role, status: 'pending', appUrl: resolveServerAppUrl(req) });
      return response(res, 201, { success: true });
    }

    if (action === 'list_roster') {
      await requireAdmin(req, supabase);

      const [profRes, usersRes, reqLogsRes] = await Promise.all([
        supabase.from('profiles').select('*').order('full_name', { ascending: true }),
        supabase.auth.admin.listUsers({ page: 1, perPage: 1000 }),
        supabase.from('activity_logs').select('*').eq('action', 'ACCOUNT_REQUEST').order('created_at', { ascending: false }).limit(200),
      ]);

      requireDatabaseSuccess(profRes.error, 'Fetch member profiles');
      if (usersRes.error) throw usersRes.error;

      const profData = (profRes.data || []) as Array<Record<string, any>>;
      const authUsers = (usersRes.data?.users || []) as Array<{ id: string; email?: string; user_metadata?: Record<string, unknown>; created_at?: string }>;
      const reqLogs = (reqLogsRes.data || []) as Array<Record<string, any>>;

      const authById = new Map<string, (typeof authUsers)[number]>();
      const authByEmail = new Map<string, (typeof authUsers)[number]>();
      for (const au of authUsers) {
        if (au.id) authById.set(au.id, au);
        const e = (au.email || '').toLowerCase().trim();
        if (e && !authByEmail.has(e)) authByEmail.set(e, au);
      }

      const parsedReqLogs = reqLogs.map((log) => {
        let details: Record<string, any> = {};
        try {
          details = typeof log.details === 'string' ? JSON.parse(log.details) : log.details || {};
        } catch {
          details = {};
        }
        return { log, details };
      });

      const reqDetailsById = new Map<string, Record<string, any>>();
      const reqDetailsByEmail = new Map<string, Record<string, any>>();
      for (const { log, details } of parsedReqLogs) {
        const uid = String(details?.userId || log.user_id || '').trim();
        const em = String(details?.email || '').toLowerCase().trim();
        if (uid && !reqDetailsById.has(uid)) reqDetailsById.set(uid, details);
        if (em && !reqDetailsByEmail.has(em)) reqDetailsByEmail.set(em, details);
      }

      const healTasks: PromiseLike<unknown>[] = [];

      const enrichedProfiles: Array<Record<string, any>> = profData.map((p): Record<string, any> => {
        const email = String(p.email || '').toLowerCase().trim();
        const au = authById.get(p.id) || (email ? authByEmail.get(email) : undefined);
        const authMeta = (au?.user_metadata || {}) as Record<string, unknown>;
        const reqDetail = reqDetailsById.get(p.id) || (email ? reqDetailsByEmail.get(email) : undefined) || {};

        const pHasCleanName = !isDirtyOrPlaceholderName(p.full_name, email);
        const fallbackNameCand =
          (typeof authMeta.full_name === 'string' ? authMeta.full_name : '') ||
          (typeof authMeta.name === 'string' ? authMeta.name : '') ||
          (typeof authMeta.display_name === 'string' ? authMeta.display_name : '') ||
          (typeof reqDetail.fullName === 'string' ? reqDetail.fullName : '') ||
          (typeof reqDetail.full_name === 'string' ? reqDetail.full_name : '') ||
          '';

        const identity = extractIdentityFromEmail(email, {
          ...authMeta,
          full_name: pHasCleanName ? p.full_name : fallbackNameCand || p.full_name,
          enrollment_no:
            p.roll_number ||
            reqDetail.enrollmentNo ||
            reqDetail.roll_number ||
            authMeta.enrollment_no ||
            authMeta.roll_number,
        });

        const resolvedName = pHasCleanName
          ? toCleanDisplayName(p.full_name) || identity.fullName
          : identity.fullName;
        const safeName = isDirtyOrPlaceholderName(resolvedName, email) ? 'Member' : resolvedName;
        const resolvedRoll = identity.enrollmentNo || String(p.roll_number || '').trim();

        const metaAvatar =
          (typeof authMeta.avatar_url === 'string' && !authMeta.avatar_url.startsWith('status:') ? authMeta.avatar_url : '') ||
          (typeof authMeta.picture === 'string' ? authMeta.picture : '');
        const resolvedAvatar =
          typeof p.avatar_url === 'string' && p.avatar_url && !p.avatar_url.startsWith('status:')
            ? p.avatar_url
            : metaAvatar || p.avatar_url || '';

        const patch: Record<string, unknown> = {};
        if (isDirtyOrPlaceholderName(p.full_name, email) && safeName !== p.full_name) {
          patch.full_name = safeName;
        }
        if (resolvedRoll && (!p.roll_number || String(p.roll_number).trim() === '' || (identity.enrollmentFromEmail && p.roll_number !== identity.enrollmentFromEmail))) {
          patch.roll_number = resolvedRoll;
        }
        if (metaAvatar && (!p.avatar_url || String(p.avatar_url).startsWith('status:'))) {
          patch.avatar_url = metaAvatar;
        }

        if (Object.keys(patch).length > 0 && p.id) {
          patch.updated_at = new Date().toISOString();
          healTasks.push(supabase.from('profiles').update(patch).eq('id', p.id));
        }

        return {
          ...p,
          full_name: safeName,
          roll_number: resolvedRoll,
          enrollment_no: resolvedRoll,
          avatar_url: resolvedAvatar,
        };
      });

      if (healTasks.length > 0) {
        await Promise.allSettled(healTasks);
      }

      const members = enrichedProfiles.filter(
        (m) => m.status === 'approved' || m.role === 'admin' || m.avatar_url === 'status:approved'
      );

      const isProfileResolved = (p: Record<string, any>) =>
        p.status === 'approved' ||
        p.status === 'rejected' ||
        p.role === 'admin' ||
        p.avatar_url === 'status:approved' ||
        p.avatar_url === 'status:rejected';

      const resolvedEmails = new Set(
        enrichedProfiles
          .filter(isProfileResolved)
          .map((p) => String(p.email || '').toLowerCase().trim())
          .filter(Boolean)
      );
      const resolvedUserIds = new Set(enrichedProfiles.filter(isProfileResolved).map((p) => p.id));

      const pendingMap = new Map<string, Record<string, any>>();
      for (const p of enrichedProfiles) {
        const emailKey = String(p.email || '').toLowerCase().trim();
        const isPending = p.status === 'pending' || p.avatar_url === 'status:pending' || !p.status;
        if (!isProfileResolved(p) && isPending && emailKey && !resolvedEmails.has(emailKey)) {
          pendingMap.set(emailKey, p);
        }
      }

      for (const { log, details } of parsedReqLogs) {
        const email = String(details?.email || '').toLowerCase().trim();
        const userId = details?.userId || log.user_id;
        const isPending = !details?.status || details?.status === 'pending';
        if (
          isPending &&
          email &&
          !resolvedEmails.has(email) &&
          (!userId || !resolvedUserIds.has(userId)) &&
          !pendingMap.has(email)
        ) {
          const au = (userId ? authById.get(userId) : undefined) || authByEmail.get(email);
          const authMeta = (au?.user_metadata || {}) as Record<string, unknown>;
          const rawLogName = details?.fullName || details?.full_name || log.user_name || '';
          const fallbackMetaName =
            (typeof authMeta.full_name === 'string' ? authMeta.full_name : '') ||
            (typeof authMeta.name === 'string' ? authMeta.name : '') ||
            '';
          const identity = extractIdentityFromEmail(email, {
            ...authMeta,
            full_name: !isDirtyOrPlaceholderName(rawLogName, email) ? rawLogName : fallbackMetaName || rawLogName,
            enrollment_no: details?.enrollmentNo || details?.roll_number || authMeta.enrollment_no || authMeta.roll_number,
          });
          pendingMap.set(email, {
            id: userId || log.id,
            full_name: isDirtyOrPlaceholderName(identity.fullName, email) ? 'Member' : identity.fullName,
            email: details?.email || email,
            roll_number: identity.enrollmentNo || '',
            enrollment_no: identity.enrollmentNo || '',
            phone: details?.phone || '',
            role: details?.role || 'member',
            status: 'pending',
            avatar_url:
              (typeof authMeta.avatar_url === 'string' && !authMeta.avatar_url.startsWith('status:') ? authMeta.avatar_url : '') ||
              (typeof authMeta.picture === 'string' ? authMeta.picture : '') ||
              '',
            created_at: log.created_at,
          });
        }
      }

      return response(res, 200, {
        success: true,
        members,
        pendingAccounts: Array.from(pendingMap.values()),
      });
    }

    if (action === 'verify_role') {
      const authorization = req.headers.authorization;
      if (!authorization?.startsWith('Bearer ')) return response(res, 401, { error: 'Authentication required.' });
      const { data, error } = await supabase.auth.getUser(authorization.slice(7));
      if (error || !data.user) return response(res, 401, { error: 'Invalid session.' });
      const email = (data.user.email || '').toLowerCase();
      const isSuperadmin = MASTER_ADMIN_EMAILS.includes(email);
      const { data: profile } = await supabase
        .from('profiles')
        .select('role, status')
        .eq('id', data.user.id)
        .maybeSingle();

      const realRole = isSuperadmin ? 'admin' : (profile?.role || 'member');
      const realStatus = isSuperadmin ? 'approved' : (profile?.status || 'pending');

      return response(res, 200, {
        success: true,
        userId: data.user.id,
        role: realRole,
        status: realStatus,
        isAdmin: isSuperadmin || realRole === 'admin',
      });
    }

    // Both 'approve' and 'reject' strictly require verified administrator privileges!
    const adminUser = await requireAdmin(req, supabase);
    const actor = await resolveAdminActor(supabase, adminUser);

    const targetId = typeof body?.target_id === 'string' ? body.target_id : '';
    const bodyEmail = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    const bodyTargetName = typeof body?.target_name === 'string' ? body.target_name.trim() : '';
    if (!targetId || !['approve', 'reject'].includes(action)) return response(res, 400, { error: 'Invalid account action.' });

    const { data: logs, error: logsError } = await supabase
      .from('activity_logs').select('*').eq('action', 'ACCOUNT_REQUEST').order('created_at', { ascending: false });
    if (logsError) throw logsError;

    const targetLog = (logs || []).find((log) => {
      let details: any = {};
      try {
        details = typeof log.details === 'string' ? JSON.parse(log.details) : log.details;
      } catch {
        details = {};
      }
      return (
        details?.userId === targetId ||
        log.user_id === targetId ||
        log.id === targetId ||
        (details?.email && details.email.toLowerCase() === targetId.toLowerCase()) ||
        (bodyEmail && details?.email?.toLowerCase() === bodyEmail)
      );
    });

    let details: any = {};
    try {
      details = targetLog && typeof targetLog.details === 'string' ? JSON.parse(targetLog.details) : targetLog?.details || {};
    } catch {
      details = {};
    }

    const { data: users, error: usersError } = await supabase.auth.admin.listUsers();
    if (usersError) throw usersError;
    const tentativeEmail = bodyEmail || (typeof details?.email === 'string' ? details.email.toLowerCase() : '');
    const existing = (users.users as Array<{ id: string; email?: string; user_metadata?: Record<string, unknown> }>).find(
      (user) => user.id === targetId || (!!tentativeEmail && user.email?.toLowerCase() === tentativeEmail)
    );
    const resolvedUserId = existing?.id || targetId;

    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('full_name, email, roll_number, phone, role, avatar_url')
      .eq('id', resolvedUserId)
      .maybeSingle();

    const email = (tentativeEmail || existing?.email || existingProfile?.email || '').toLowerCase();
    const existingMeta = (existing?.user_metadata || {}) as Record<string, unknown>;
    const rawNameCand =
      (typeof existingProfile?.full_name === 'string' && !isDirtyOrPlaceholderName(existingProfile.full_name, email) ? existingProfile.full_name : '') ||
      (typeof details?.fullName === 'string' && !isDirtyOrPlaceholderName(details.fullName, email) ? details.fullName : '') ||
      (typeof bodyTargetName === 'string' && !isDirtyOrPlaceholderName(bodyTargetName, email) ? bodyTargetName : '') ||
      (typeof existingMeta?.full_name === 'string' ? existingMeta.full_name : '') ||
      (typeof existingMeta?.name === 'string' ? existingMeta.name : '') ||
      (typeof targetLog?.user_name === 'string' ? targetLog.user_name : '');

    const identity = extractIdentityFromEmail(email, {
      ...existingMeta,
      full_name: rawNameCand || existingMeta.full_name || existingMeta.name,
      enrollment_no:
        existingProfile?.roll_number ||
        details?.enrollmentNo ||
        details?.roll_number ||
        existingMeta?.enrollment_no ||
        existingMeta?.roll_number,
    });

    const fullName =
      rawNameCand && !isDirtyOrPlaceholderName(rawNameCand, email)
        ? toCleanDisplayName(rawNameCand)
        : identity.fullName;

    const rollNumber = identity.enrollmentNo || existingProfile?.roll_number || '';
    const status = action === 'approve' ? 'approved' : 'rejected';

    // Preserve real Google/uploaded photo URLs rather than overwriting avatar_url with status:...
    const preservedAvatar =
      (typeof existingProfile?.avatar_url === 'string' && !existingProfile.avatar_url.startsWith('status:')
        ? existingProfile.avatar_url
        : '') ||
      (typeof existingMeta?.avatar_url === 'string' && !String(existingMeta.avatar_url).startsWith('status:')
        ? String(existingMeta.avatar_url)
        : '') ||
      (typeof existingMeta?.picture === 'string' ? String(existingMeta.picture) : '');

    const finalAvatarValue = preservedAvatar || `status:${status}`;

    if (existing) {
      await supabase.auth.admin.updateUserById(existing.id, {
        email_confirm: true,
        user_metadata: {
          ...existingMeta,
          status,
          full_name: fullName,
          enrollment_no: rollNumber,
          roll_number: rollNumber,
          ...(preservedAvatar ? { avatar_url: preservedAvatar } : {}),
        },
      });
    }

    if (action === 'approve') {
      const { error: profileError } = await supabase.from('profiles').upsert([{
        id: resolvedUserId,
        full_name: fullName,
        email: email || existing?.email,
        role: existingProfile?.role || details?.role || 'member',
        status: 'approved',
        roll_number: rollNumber,
        phone: existingProfile?.phone || details?.phone || '',
        avatar_url: finalAvatarValue,
        updated_at: new Date().toISOString(),
      }]);
      requireDatabaseSuccess(profileError, 'Approved profile update');
    } else {
      const { error: profileError } = await supabase.from('profiles').upsert([{
        id: resolvedUserId,
        full_name: fullName,
        email: email || existing?.email,
        role: existingProfile?.role || details?.role || 'member',
        status: 'rejected',
        avatar_url: finalAvatarValue,
        roll_number: rollNumber,
        phone: existingProfile?.phone || details?.phone || '',
        updated_at: new Date().toISOString(),
      }]);
      requireDatabaseSuccess(profileError, 'Rejected profile update');
    }

    // Mirror to Neon PostgreSQL if configured
    if (process.env.NEON_DATABASE_URL) {
      try {
        const pgClient = new Client({
          connectionString: process.env.NEON_DATABASE_URL,
          ssl: { rejectUnauthorized: true },
          connectionTimeoutMillis: 3000,
        });
        await pgClient.connect();
        await pgClient.query(
          'UPDATE profiles SET status = $1, full_name = $2, roll_number = COALESCE(NULLIF(roll_number, \'\'), $3), avatar_url = $4, updated_at = NOW() WHERE id = $5 OR email = $6',
          [status, fullName, rollNumber, finalAvatarValue, resolvedUserId, email || '']
        );
        await pgClient.end();
      } catch (neonErr) {
        console.warn('Neon status sync notice:', neonErr);
      }
    }

    const decisionTs = new Date().toISOString();

    // Update ALL matching ACCOUNT_REQUEST logs so they are permanently marked
    for (const log of logs || []) {
      let lDetails: any = {};
      try {
        lDetails = typeof log.details === 'string' ? JSON.parse(log.details) : log.details;
      } catch {
        lDetails = {};
      }
      const logEmail = (lDetails?.email || '').toLowerCase();
      if (
        log.id === targetId ||
        log.user_id === resolvedUserId ||
        lDetails?.userId === resolvedUserId ||
        (email && logEmail === email)
      ) {
        await supabase
          .from('activity_logs')
          .update({
            user_name: fullName,
            details: JSON.stringify({
              ...lDetails,
              fullName,
              enrollmentNo: rollNumber,
              roll_number: rollNumber,
              status,
              [`${status}_at`]: decisionTs,
              [`${status}_by`]: actor.name,
            }),
          })
          .eq('id', log.id);
      }
    }

    const { error: actionLogError } = await supabase.from('activity_logs').insert([{
      user_id: actor.id,
      user_name: actor.name,
      action: action === 'approve' ? 'ACCOUNT_APPROVED' : 'ACCOUNT_REJECTED',
      details: JSON.stringify({
        summary: `${actor.name} ${status} registration account for ${fullName}${email ? ` (${email})` : ''}`,
        actorId: actor.id,
        actorName: actor.name,
        actorEmail: actor.email,
        actorRoll: actor.roll,
        actorRole: 'admin',
        targetId: resolvedUserId,
        targetName: fullName,
        targetEmail: email,
        targetRoll: rollNumber,
        targetType: 'account',
        where: 'Management Hub › Account Requests',
        route: '/api/accounts',
        changes: [`Account Status: PENDING → ${status.toUpperCase()}`],
        timestamp: decisionTs,
      }),
    }]);
    requireDatabaseSuccess(actionLogError, 'Account action logging');
    if (email) { void sendAccountEmail(action === 'approve' ? 'account_approved' : 'account_rejected', email, { name: fullName, email, role: details?.role, status, appUrl: resolveServerAppUrl(req) }).catch(err => console.warn('Background email notice:', err)); }
    return response(res, 200, { success: true });
  } catch (error) {
    console.error('Account operation failed:', error);
    return response(res, 502, { error: error instanceof Error ? error.message : 'Account operation failed.' });
  }
}
