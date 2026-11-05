import nodemailer from 'nodemailer';

const DEFAULT_SMTP_HOST = 'smtp.gmail.com';
const DEFAULT_SMTP_PORT = 465;

export const smtpHost = (process.env.SMTP_HOST || DEFAULT_SMTP_HOST).trim();
export const smtpPort = Number(process.env.SMTP_PORT) || DEFAULT_SMTP_PORT;
export const smtpSecure =
  process.env.SMTP_SECURE === 'true' ||
  (process.env.SMTP_SECURE !== 'false' && smtpPort === 465);

const rawUser = process.env.SMTP_USER || '';
export const smtpUser = rawUser ? rawUser.trim().replace(/^['"]|['"]$/g, '') : '';

const rawPass = process.env.SMTP_PASS || '';
// Clean Google 16-character App Passwords (stripping spaces and quotes)
export const smtpPass = rawPass ? rawPass.trim().replace(/[\s'"]/g, '') : '';

export function getTransporter() {
  return nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpSecure,
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
    pool: false, // Critical in serverless to prevent frozen/dead socket reuse
    connectionTimeout: 4000,
    greetingTimeout: 4000,
    socketTimeout: 4000,
  } as any);
}

export function getMailFrom(): string {
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || (smtpUser ? `CICR Inventory <${smtpUser}>` : '');
  return from.trim().replace(/^['"]|['"]$/g, '');
}

export function isSmtpConfigured(): boolean {
  return Boolean(smtpUser && smtpPass && getMailFrom());
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function renderEmail(event: string, data: Record<string, unknown>) {
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
    login: { label: 'SECURITY // ACCESS AUTHORIZED', title: 'New login detected', action: 'REVIEW ACCOUNT', path: '/profile' },
    logout: { label: 'SECURITY // SESSION CLOSED', title: 'Session closed successfully', action: 'OPEN CICR VAULT', path: '/' },
    account_created: { label: 'ACCOUNT // REVIEW PENDING', title: 'Registration received', action: 'CHECK ACCOUNT STATUS', path: '/profile' },
    account_approved: { label: 'ACCOUNT // ACCESS APPROVED', title: 'Your account is ready', action: 'OPEN CICR VAULT', path: '/' },
    account_rejected: { label: 'ACCOUNT // REVIEW COMPLETE', title: 'Registration update', action: 'CONTACT CICR', path: '/profile' },
    role_updated: { label: 'ACCOUNT // ROLE UPDATED', title: 'Account privileges updated', action: 'OPEN CICR VAULT', path: '/' },
    borrow_requested: { label: 'REQUEST // SUBMITTED', title: 'Borrow request submitted', action: 'VIEW MY REQUESTS', path: '/requests' },
    borrow_approved: { label: 'REQUEST // APPROVED', title: 'Borrow request approved', action: 'VIEW EQUIPMENT', path: '/inventory' },
    borrow_rejected: { label: 'REQUEST // DECLINED', title: 'Borrow request needs attention', action: 'VIEW REQUEST DETAILS', path: '/requests' },
    item_returned: { label: 'INVENTORY // RETURN RECORDED', title: 'Return recorded', action: 'VIEW INVENTORY', path: '/inventory' },
    return_reminder: { label: 'REMINDER // ACTION REQUIRED', title: 'Return reminder', action: 'VIEW ACTIVE LOANS', path: '/profile' },
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
  const appUrl = process.env.APP_URL || 'https://cicr-inventory.vercel.app';
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
