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

function getAdminClient() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || DEFAULT_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.VITE_SUPABASE_SERVICE_ROLE_KEY ||
    DEFAULT_SERVICE_ROLE_KEY;
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
  const appUrl = process.env.APP_URL || 'https://cicr-inventory.vercel.app';
  const html = `<!doctype html><html><body style="margin:0;background:#05070d;color:#eef2f8;font-family:Arial,sans-serif"><div style="padding:28px 12px;background:#05070d"><table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:640px;margin:auto;background:#0d1320;border:1px solid #1e2a3d;border-radius:6px;overflow:hidden"><tr><td style="padding:20px 24px;border-bottom:1px solid #1e2a3d"><div style="font-size:18px;font-weight:800;letter-spacing:2px;color:#f5dc72"><span style="background:#f5dc72;color:#0d1320;padding:2px 5px">CICR</span> <span style="color:#00e5ff">//</span> INVENTORY</div><div style="margin-top:7px;color:#77839d;font-size:9px;letter-spacing:2px">CENTRE FOR INNOVATION, CONTROL &amp; ROBOTICS</div></td></tr><tr><td style="padding:24px"><div style="display:inline-block;padding:6px 9px;border:1px solid ${accent};color:${accent};font:700 10px monospace;letter-spacing:1px">${layout.label}</div><h1 style="margin:18px 0 8px;color:#f5f7fb;font-size:21px">${layout.title}</h1><p style="margin:0 0 20px;color:#9aa7bc;font-size:13px;line-height:1.6">${escapeHtml(messages[event] || '')}</p><a href="${appUrl}${layout.path}" style="display:inline-block;padding:12px 24px;background:#00d9ed;color:#041018;text-decoration:none;font:800 12px Arial,sans-serif;letter-spacing:1px;border-radius:3px">${layout.action}</a></td></tr></table></div></body></html>`;

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
      const targetEmail = targetProfile?.email || targetAuth?.user?.email || '';
      const targetName = targetProfile?.full_name || targetAuth?.user?.user_metadata?.full_name || targetEmail || 'Member';

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

      // 1. Update Supabase profiles table
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ role, updated_at: new Date().toISOString() })
        .eq('id', targetId);
      requireDatabaseSuccess(profileError, 'Role update');

      // 2. Update Supabase Auth user_metadata
      const currentMeta = targetAuth?.user?.user_metadata || {};
      const { error: authError } = await supabase.auth.admin.updateUserById(targetId, {
        user_metadata: { ...currentMeta, role },
      });
      requireDatabaseSuccess(authError, 'Auth role update');

      // 3. Mirror to Neon PostgreSQL if configured
      if (process.env.NEON_DATABASE_URL) {
        try {
          const pgClient = new Client({
            connectionString: process.env.NEON_DATABASE_URL,
            ssl: { rejectUnauthorized: true },
          });
          await pgClient.connect();
          await pgClient.query('UPDATE profiles SET role = $1, updated_at = NOW() WHERE id = $2', [role, targetId]);
          await pgClient.end();
        } catch (neonErr) {
          console.warn('Neon role sync notice:', neonErr);
        }
      }

      // 4. Record audit log
      const adminName = adminUser?.user_metadata?.full_name || adminUser?.email || 'Administrator';
      const { error: logError } = await supabase.from('activity_logs').insert([{
        user_id: targetId,
        user_name: targetName,
        action: 'ROLE_UPDATED',
        details: `${targetName}'s role was updated to ${role.toUpperCase()} by ${adminName}.`,
      }]);
      requireDatabaseSuccess(logError, 'Role update logging');

      // 5. Send notification email if target email exists
      if (targetEmail) {
        await sendAccountEmail('role_updated', targetEmail, {
          name: targetName,
          email: targetEmail,
          role,
        });
      }

      return response(res, 200, { success: true, role });
    }

    if (action === 'register') {
      const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
      const password = typeof body?.password === 'string' ? body.password : '';
      const fullName = typeof body?.full_name === 'string' ? body.full_name.trim() : '';
      const emailPrefix = email.split('@')[0];
      const rollMatch = emailPrefix.match(/\d{6,}/) || emailPrefix.match(/\d+/);
      const enrollmentNo =
        typeof body?.enrollment_no === 'string' && body.enrollment_no.trim()
          ? body.enrollment_no.trim()
          : (rollMatch ? rollMatch[0] : emailPrefix);
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
        user_metadata: { full_name: fullName, enrollment_no: enrollmentNo, phone, role, status: 'pending', avatar_url: avatarUrl || undefined },
      });
      if (createError || !created.user) return response(res, 400, { error: createError?.message || 'Account creation failed.' });

      const userId = created.user.id;
      const { error: profileError } = await supabase.from('profiles').upsert([{
        id: userId, full_name: fullName, email, role, status: 'pending', roll_number: enrollmentNo, phone,
        avatar_url: avatarUrl || 'status:pending',
      }]);
      requireDatabaseSuccess(profileError, 'Profile creation');

      const { error: logError } = await supabase.from('activity_logs').insert([{
        user_id: userId,
        user_name: fullName,
        action: 'ACCOUNT_REQUEST',
        details: JSON.stringify({ userId, email, fullName, enrollmentNo, phone, role, status: 'pending', created_at: new Date().toISOString() }),
      }]);
      requireDatabaseSuccess(logError, 'Account request logging');
      await sendAccountEmail('account_created', email, { name: fullName, email, role, status: 'pending' });
      return response(res, 201, { success: true });
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
    await requireAdmin(req, supabase);

    const targetId = typeof body?.target_id === 'string' ? body.target_id : '';
    const bodyEmail = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
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

    const email = bodyEmail || (typeof details?.email === 'string' ? details.email.toLowerCase() : '');
    const fullName = typeof details?.fullName === 'string' ? details.fullName : targetLog?.user_name || 'Member';
    const status = action === 'approve' ? 'approved' : 'rejected';

    const { data: users, error: usersError } = await supabase.auth.admin.listUsers();
    if (usersError) throw usersError;
    const existing = (users.users as Array<{ id: string; email?: string; user_metadata?: Record<string, unknown> }>).find(
      (user) => user.id === targetId || (!!email && user.email?.toLowerCase() === email)
    );
    const resolvedUserId = existing?.id || targetId;

    if (existing) {
      await supabase.auth.admin.updateUserById(existing.id, {
        email_confirm: true,
        user_metadata: { ...existing.user_metadata, status },
      });
    }

    if (action === 'approve') {
      const { error: profileError } = await supabase.from('profiles').upsert([{
        id: resolvedUserId,
        full_name: fullName,
        email: email || existing?.email,
        role: details?.role || 'member',
        status: 'approved',
        roll_number: details?.enrollmentNo || '',
        phone: details?.phone || '',
        avatar_url: 'status:approved',
        updated_at: new Date().toISOString(),
      }]);
      requireDatabaseSuccess(profileError, 'Approved profile update');
    } else {
      const { error: profileError } = await supabase.from('profiles').upsert([{
        id: resolvedUserId,
        full_name: fullName,
        email: email || existing?.email,
        role: details?.role || 'member',
        status: 'rejected',
        avatar_url: 'status:rejected',
        roll_number: details?.enrollmentNo || '',
        phone: details?.phone || '',
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
        });
        await pgClient.connect();
        await pgClient.query('UPDATE profiles SET status = $1, avatar_url = $2, updated_at = NOW() WHERE id = $3 OR email = $4', [
          status,
          `status:${status}`,
          resolvedUserId,
          email || '',
        ]);
        await pgClient.end();
      } catch (neonErr) {
        console.warn('Neon status sync notice:', neonErr);
      }
    }

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
            details: JSON.stringify({ ...lDetails, status, [`${status}_at`]: new Date().toISOString() }),
          })
          .eq('id', log.id);
      }
    }

    const { error: actionLogError } = await supabase.from('activity_logs').insert([{
      user_id: resolvedUserId,
      user_name: fullName,
      action: action === 'approve' ? 'ACCOUNT_APPROVED' : 'ACCOUNT_REJECTED',
      details: `Account for ${fullName} was ${status}.`,
    }]);
    requireDatabaseSuccess(actionLogError, 'Account action logging');
    if (email) { void sendAccountEmail(action === 'approve' ? 'account_approved' : 'account_rejected', email, { name: fullName, email, role: details?.role, status }).catch(err => console.warn('Background email notice:', err)); }
    return response(res, 200, { success: true });
  } catch (error) {
    console.error('Account operation failed:', error);
    return response(res, 502, { error: error instanceof Error ? error.message : 'Account operation failed.' });
  }
}
