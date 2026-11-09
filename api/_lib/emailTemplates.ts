/**
 * Email HTML and plain text renderers for CICR Inventory member and administrator alerts.
 * Imports event metadata cleanly from ./emailSpecs without frontend src dependencies.
 */

import {
  ADMIN_ALERT_EVENTS,
  ALLOWED_NOTIFICATION_EVENTS,
  EVENT_SPECS,
  NotificationEventName,
} from './emailSpecs';

export { ADMIN_ALERT_EVENTS, ALLOWED_NOTIFICATION_EVENTS };
export type { NotificationEventName };

export interface RenderedEmailContent {
  subject: string;
  text: string;
  html: string;
}

/**
 * Escapes untrusted strings before interpolation into transactional HTML emails.
 */
export function escapeEmailHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatIstDateTime(): string {
  return new Date().toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Kolkata',
  });
}

function buildEmailHtml(
  layout: { label: string; title: string; action: string; path: string; accent?: string },
  messageText: string,
  detailRows: Array<[string, string]>,
  appUrl: string,
  footerNote: string
): string {
  const accent = layout.accent || '#00e5ff';
  const detailsHtml = detailRows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:8px 0;color:#77839d;font:11px Arial,sans-serif;letter-spacing:1px;width:34%">${label}</td><td style="padding:8px 0;color:#f5f7fb;font:600 13px Arial,sans-serif">${value}</td></tr>`
    )
    .join('');

  return `<!doctype html>
<html><body style="margin:0;background:#05070d;color:#eef2f8;font-family:Arial,sans-serif">
  <div style="padding:28px 12px;background:#05070d">
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:640px;margin:auto;background:#0d1320;border:1px solid #1e2a3d;border-radius:6px;overflow:hidden">
      <tr><td style="padding:20px 24px;border-bottom:1px solid #1e2a3d">
        <div style="font-size:18px;font-weight:800;letter-spacing:2px;color:#f5dc72"><span style="background:#f5dc72;color:#0d1320;padding:2px 5px">CICR</span> <span style="color:#00e5ff">//</span> INVENTORY</div>
        <div style="margin-top:7px;color:#77839d;font-size:9px;letter-spacing:2px">CENTRE FOR INNOVATION, CONTROL &amp; ROBOTICS</div>
      </td></tr>
      <tr><td style="padding:24px">
        <div style="display:inline-block;padding:6px 9px;border:1px solid ${accent};color:${accent};font:700 10px monospace;letter-spacing:1px">${escapeEmailHtml(layout.label)}</div>
        <h1 style="margin:18px 0 8px;color:#f5f7fb;font-size:21px">${escapeEmailHtml(layout.title)}</h1>
        <p style="margin:0;color:#9aa7bc;font-size:13px;line-height:1.6">${escapeEmailHtml(messageText).replace(/\n/g, '<br>')}</p>
        <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:22px 0;padding:12px 16px;background:#080c14;border:1px solid #202b3c;border-radius:5px">${detailsHtml}</table>
        <a href="${escapeEmailHtml(`${appUrl}${layout.path}`)}" style="display:inline-block;padding:13px 24px;background:#00d9ed;color:#041018;text-decoration:none;font:800 12px Arial,sans-serif;letter-spacing:1px;border-radius:3px">${escapeEmailHtml(layout.action)}</a>
        <p style="margin:22px 0 0;color:#77839d;font-size:11px;line-height:1.6">${escapeEmailHtml(footerNote)}</p>
      </td></tr>
      <tr><td style="padding:16px 24px;border-top:1px solid #1e2a3d;color:#66738b;font-size:10px;line-height:1.5">AUTOMATED TRANSMISSION // NO REPLY<br>CICR Inventory &bull; Centre for Innovation, Control &amp; Robotics</td></tr>
    </table>
  </div>
</body></html>`;
}

/**
 * Renders the primary transactional email for the acting or affected CICR member.
 */
export function renderNotificationEmail(
  event: string,
  data: Record<string, unknown>,
  resolvedAppUrl: string
): RenderedEmailContent {
  const name = String(data.name || 'CICR member');
  const item = data.item ? String(data.item) : '';
  const status = data.status ? String(data.status) : '';
  const dueDate = data.dueDate ? String(data.dueDate) : '';
  const project = data.project ? String(data.project) : '';
  const category = data.category ? String(data.category) : '';
  const adminName = data.adminName ? String(data.adminName) : '';
  const notes = data.notes ? String(data.notes) : '';
  const roleUpper = data.role ? String(data.role).toUpperCase() : 'MEMBER';
  const spec = EVENT_SPECS[event] || {
    label: 'SYSTEM // NOTIFICATION',
    title: 'CICR Inventory update',
    action: 'OPEN CICR VAULT',
    path: '/',
    subject: () => 'CICR Inventory notification',
    body: (n: string) => `Hello ${n},\n\nThere is an update on your CICR Inventory account.`,
  };

  const timestampStr = formatIstDateTime();
  const detailRows: Array<[string, string]> = [
    ['MEMBER', escapeEmailHtml(name)],
    ...(data.email ? [['EMAIL', escapeEmailHtml(data.email)] as [string, string]] : []),
    ...(data.role ? [['ROLE', escapeEmailHtml(roleUpper)] as [string, string]] : []),
    ...(item ? [['COMPONENT', escapeEmailHtml(item)] as [string, string]] : []),
    ...(category ? [['CATEGORY', escapeEmailHtml(category)] as [string, string]] : []),
    ...(status ? [['STATUS', escapeEmailHtml(status).toUpperCase()] as [string, string]] : []),
    ...(dueDate ? [['RETURN DUE', escapeEmailHtml(dueDate)] as [string, string]] : []),
    ...(project ? [['PROJECT', escapeEmailHtml(project)] as [string, string]] : []),
    ...(adminName ? [['REVIEWED BY', escapeEmailHtml(adminName)] as [string, string]] : []),
    ...(notes ? [['DETAILS', escapeEmailHtml(notes)] as [string, string]] : []),
    ['TIMESTAMP', escapeEmailHtml(timestampStr)],
  ];

  const bodyText = spec.body(name, roleUpper);
  const text = [
    bodyText,
    item ? `Component: ${item}` : '',
    status ? `Status: ${status}` : '',
    dueDate ? `Due date: ${dueDate}` : '',
    project ? `Project: ${project}` : '',
    adminName ? `Reviewed by: ${adminName}` : '',
    notes ? `Details: ${notes}` : '',
    `Time: ${timestampStr}`,
    'CICR Inventory',
  ]
    .filter(Boolean)
    .join('\n');

  return {
    subject: spec.subject(item),
    text,
    html: buildEmailHtml(
      spec,
      bodyText,
      detailRows,
      resolvedAppUrl,
      'This is an automated system notification. If you did not recognize this activity, please contact a CICR administrator.'
    ),
  };
}

/**
 * Renders an administrator alert email when a user submits a request awaiting clearance.
 */
export function renderAdminAlertEmail(
  event: string,
  data: Record<string, unknown>,
  resolvedAppUrl: string
): RenderedEmailContent {
  const name = String(data.name || 'CICR member');
  const email = data.email ? String(data.email) : '';
  const item = data.item ? String(data.item) : '';
  const project = data.project ? String(data.project) : '';
  const dueDate = data.dueDate ? String(data.dueDate) : '';
  const notes = data.notes ? String(data.notes) : '';
  const timestampStr = formatIstDateTime();

  const adminSpecs: Record<string, { subject: string; message: string; label: string; title: string; action: string; path: string; accent: string }> = {
    account_created: {
      subject: `CICR Admin Action: New registration from ${name}`,
      message: `${name}${email ? ` (${email})` : ''} submitted a registration request and is waiting for administrator approval in Management Hub.`,
      label: 'ADMIN ALERT // REGISTRATION',
      title: 'New account approval needed',
      action: 'REVIEW ACCOUNT REQUESTS',
      path: '/#management',
      accent: '#ffc928',
    },
    borrow_requested: {
      subject: `CICR Admin Action: New borrow request from ${name}${item ? ` (${item})` : ''}`,
      message: `${name}${email ? ` (${email})` : ''} requested ${item || 'hardware'}${project ? ` for "${project}"` : ''}. Please review and approve or decline the request.`,
      label: 'ADMIN ALERT // REQUISITION',
      title: 'New borrow request pending',
      action: 'REVIEW REQUISITION',
      path: '/#requests',
      accent: '#ffc928',
    },
    return_requested: {
      subject: `CICR Admin Action: Return clearance requested by ${name}${item ? ` (${item})` : ''}`,
      message: `${name}${email ? ` (${email})` : ''} submitted a return request for ${item || 'hardware'}. Please inspect the hardware and confirm restocking or decline.`,
      label: 'ADMIN ALERT // RETURN CHECK IN',
      title: 'Return clearance pending',
      action: 'REVIEW RETURN REQUEST',
      path: '/#requests',
      accent: '#00e5ff',
    },
  };

  const chosen = adminSpecs[event] || {
    subject: 'CICR Admin Action Required',
    message: 'A member request is awaiting administrator clearance.',
    label: 'ADMIN ALERT // ACTION NEEDED',
    title: 'Administrator review requested',
    action: 'OPEN ADMIN PORTAL',
    path: '/#requests',
    accent: '#ffc928',
  };

  const detailRows: Array<[string, string]> = [
    ['REQUESTER', escapeEmailHtml(name)],
    ...(email ? [['EMAIL', escapeEmailHtml(email)] as [string, string]] : []),
    ...(item ? [['COMPONENT', escapeEmailHtml(item)] as [string, string]] : []),
    ...(project ? [['PROJECT', escapeEmailHtml(project)] as [string, string]] : []),
    ...(dueDate ? [['RETURN DUE', escapeEmailHtml(dueDate)] as [string, string]] : []),
    ...(notes ? [['NOTES', escapeEmailHtml(notes)] as [string, string]] : []),
    ['TIMESTAMP', escapeEmailHtml(timestampStr)],
  ];

  const text = [chosen.message, item ? `Component: ${item}` : '', project ? `Project: ${project}` : '', dueDate ? `Due date: ${dueDate}` : '', notes ? `Notes: ${notes}` : '', `Time: ${timestampStr}`]
    .filter(Boolean)
    .join('\n');

  return {
    subject: chosen.subject,
    text,
    html: buildEmailHtml(chosen, chosen.message, detailRows, resolvedAppUrl, 'Sent to CICR Inventory administrators because review clearance is required.'),
  };
}
