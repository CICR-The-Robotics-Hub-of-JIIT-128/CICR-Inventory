/**
 * Shared server side Supabase authentication, authorization, IST date validation,
 * and forensic activity log writers for CICR serverless inventory endpoints.
 */

import type { VercelRequest } from '@vercel/node';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export interface VerifiedActorMeta {
  id: string;
  name: string;
  email: string;
  roll: string;
  role: 'admin' | 'member';
}

export interface ApprovedCallerContext {
  authClient: SupabaseClient<any, any, any>;
  adminClient: SupabaseClient<any, any, any>;
  user: { id: string; email?: string; user_metadata?: Record<string, unknown> };
  profile: {
    id: string;
    email: string;
    full_name: string;
    roll_number?: string | null;
    role: string;
    status: string;
    avatar_url?: string | null;
  };
  actor: VerifiedActorMeta;
}

/**
 * Typed HTTP error enabling API handlers to return explicit REST status codes
 * without leaking internal stack traces or database implementation details.
 */
export class HttpError extends Error {
  public readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
  }
}

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const PLACEHOLDER_NAMES = new Set([
  'member', 'new member', 'student', 'student member', 'user', 'applicant',
  'administrator', 'admin', 'system', 'system operator', 'unknown',
]);

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
 * Builds authenticated public and privileged service role Supabase clients
 * strictly from environment variables while enforcing project ref consistency.
 */
export function getServerSupabaseClients(): {
  authClient: SupabaseClient<any, any, any>;
  adminClient: SupabaseClient<any, any, any>;
} {
  const supabaseUrl = (process.env.SUPABASE_URL || '').trim();
  const anonKey = (process.env.SUPABASE_ANON_KEY || '').trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!supabaseUrl || !anonKey || !serviceKey) {
    throw new HttpError(503, 'Supabase server configuration is missing.');
  }

  const expectedRef = extractSupabaseUrlRef(supabaseUrl);
  const anonRef = extractJwtRef(anonKey);
  const serviceRef = extractJwtRef(serviceKey);
  if ((anonRef && expectedRef && anonRef !== expectedRef) || (serviceRef && expectedRef && serviceRef !== expectedRef)) {
    throw new HttpError(503, 'Supabase key configuration does not match project URL.');
  }

  const opts = { auth: { autoRefreshToken: false, persistSession: false } };
  return {
    authClient: createClient(supabaseUrl, anonKey, opts),
    adminClient: createClient(supabaseUrl, serviceKey, opts),
  };
}

/**
 * Formats today's calendar date in Asia/Kolkata (`YYYY-MM-DD`) regardless of UTC host clock.
 */
export function formatTodayIstDate(referenceDate: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(referenceDate);
  const year = parts.find((p) => p.type === 'year')?.value || '1970';
  const month = parts.find((p) => p.type === 'month')?.value || '01';
  const day = parts.find((p) => p.type === 'day')?.value || '01';
  return `${year}-${month}-${day}`;
}

/**
 * Validates that an expected return date is canonical `YYYY-MM-DD`, represents a valid
 * Gregorian calendar day without rollover, and is today or in the future (IST calendar).
 */
export function validateFutureOrTodayIstDate(rawDate: unknown, referenceDate: Date = new Date()): string {
  const normalized = typeof rawDate === 'string' ? rawDate.trim() : '';
  if (!normalized) throw new HttpError(400, 'Expected return date is required.');

  const match = ISO_DATE_PATTERN.exec(normalized);
  if (!match) throw new HttpError(400, 'Expected return date must follow YYYY-MM-DD format.');

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const probe = new Date(2000, month - 1, day);
  probe.setFullYear(year);
  if (probe.getFullYear() !== year || probe.getMonth() !== month - 1 || probe.getDate() !== day) {
    throw new HttpError(400, 'Please enter a valid expected return date.');
  }

  const minIstDate = formatTodayIstDate(referenceDate);
  if (normalized < minIstDate) {
    throw new HttpError(400, 'Expected return date cannot be in the past. Please choose today or a future date.');
  }
  return normalized;
}

/**
 * Normalizes a human display name and enrollment roll digits from verified profile metadata.
 */
export function resolveCleanActorMeta(
  user: { id: string; email?: string; user_metadata?: Record<string, unknown> },
  profile: { full_name?: string | null; email?: string | null; roll_number?: string | null; role?: string | null }
): VerifiedActorMeta {
  const email = (profile.email || user.email || '').toLowerCase().trim();
  const local = email.split('@')[0] || '';
  const rollFromEmail = (local.match(/(\d{6,})/) || [])[1] || (/^\d{4,}$/.test(local) ? local : '');
  const roll = String(profile.roll_number || rollFromEmail || '').trim();

  const candidates = [
    profile.full_name,
    typeof user.user_metadata?.full_name === 'string' ? user.user_metadata.full_name : '',
    typeof user.user_metadata?.name === 'string' ? user.user_metadata.name : '',
  ];
  let cleanName = '';
  for (const cand of candidates) {
    if (typeof cand !== 'string') continue;
    const stripped = cand.replace(/\d{6,}|[()[\]]/g, ' ').replace(/\s+/g, ' ').trim();
    if (stripped && /[a-zA-Z]/.test(stripped) && !PLACEHOLDER_NAMES.has(stripped.toLowerCase())) {
      cleanName = stripped;
      break;
    }
  }
  if (!cleanName) {
    const emailWords = local.replace(/\d{6,}|[._\-+]+/g, ' ').replace(/\s+/g, ' ').trim();
    cleanName = emailWords && /[a-zA-Z]{2,}/.test(emailWords)
      ? emailWords.replace(/\b\w/g, (c) => c.toUpperCase())
      : 'Member';
  }

  return {
    id: user.id,
    name: cleanName,
    email,
    roll,
    role: profile.role === 'admin' ? 'admin' : 'member',
  };
}

/**
 * Authenticates the caller via Supabase Bearer JWT and requires an approved DB profile.
 */
export async function requireApprovedUser(req: VercelRequest): Promise<ApprovedCallerContext> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    throw new HttpError(401, 'Authentication is required.');
  }
  const token = authHeader.slice(7).trim();
  if (!token) throw new HttpError(401, 'Authentication token is missing.');

  const { authClient, adminClient } = getServerSupabaseClients();
  const { data: userData, error: authErr } = await authClient.auth.getUser(token);
  if (authErr || !userData?.user) {
    throw new HttpError(401, 'Invalid or expired authentication session.');
  }

  const { data: profile, error: profErr } = await adminClient
    .from('profiles')
    .select('id, email, full_name, roll_number, role, status, avatar_url')
    .eq('id', userData.user.id)
    .maybeSingle();

  if (profErr) {
    throw new HttpError(500, `Authorization profile lookup failed: ${profErr.message}`);
  }
  if (!profile || profile.status !== 'approved' || profile.avatar_url === 'status:pending' || profile.avatar_url === 'status:rejected') {
    throw new HttpError(403, 'Unauthorized: Approved CICR membership is required.');
  }

  return {
    authClient,
    adminClient,
    user: userData.user,
    profile,
    actor: resolveCleanActorMeta(userData.user, profile),
  };
}

/**
 * Enforces strict administrator authorization strictly from verified PostgreSQL `profiles`.
 */
export async function requireApprovedAdmin(req: VercelRequest): Promise<ApprovedCallerContext> {
  const caller = await requireApprovedUser(req);
  if (caller.profile.role !== 'admin') {
    throw new HttpError(403, 'Unauthorized: Approved administrator clearance is required.');
  }
  return caller;
}

/**
 * Persists a structured forensic audit entry in `activity_logs` via service role client.
 */
export async function recordServerAuditLog(
  adminClient: SupabaseClient<any, any, any>,
  entry: {
    action: string;
    summary: string;
    actor: VerifiedActorMeta;
    itemId?: string;
    targetId?: string;
    targetName?: string;
    targetType: string;
    location?: string;
    where: string;
    changes?: string[];
    meta?: Record<string, unknown>;
  }
): Promise<Record<string, unknown>> {
  const ts = new Date().toISOString();
  const payloadObj: Record<string, unknown> = {
    ...(entry.meta || {}),
    summary: entry.summary,
    actorId: entry.actor.id,
    actorName: entry.actor.name,
    actorEmail: entry.actor.email,
    actorRoll: entry.actor.roll || undefined,
    actorRole: entry.actor.role,
    targetId: entry.targetId,
    targetName: entry.targetName,
    targetType: entry.targetType,
    location: entry.location || undefined,
    where: entry.where,
    route: '/api/inventory',
    changes: entry.changes && entry.changes.length > 0 ? entry.changes : undefined,
    timestamp: ts,
  };
  for (const key of Object.keys(payloadObj)) {
    if (payloadObj[key] === undefined || payloadObj[key] === '') delete payloadObj[key];
  }

  const rowPayload = {
    user_id: entry.actor.id,
    user_name: entry.actor.name,
    action: entry.action,
    details: JSON.stringify(payloadObj),
    item_id: entry.itemId || null,
    created_at: ts,
  };

  try {
    const { data } = await adminClient.from('activity_logs').insert([rowPayload]).select().single();
    if (data) return data;
  } catch (err) {
    console.warn('Server audit log insert notice:', err);
  }
  return { id: `srv-${Date.now()}`, ...rowPayload };
}

