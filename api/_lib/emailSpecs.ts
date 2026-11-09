/**
 * Notification event registry and structured template copy specifications for CICR emails.
 * Self contained inside the Vercel serverless api directory with zero frontend src imports.
 */

export type NotificationEventName =
  | 'login'
  | 'logout'
  | 'account_created'
  | 'account_approved'
  | 'account_rejected'
  | 'role_updated'
  | 'profile_updated'
  | 'borrow_requested'
  | 'borrow_approved'
  | 'borrow_rejected'
  | 'return_requested'
  | 'item_returned'
  | 'return_declined'
  | 'item_created'
  | 'item_edited'
  | 'item_deleted'
  | 'return_reminder';

export const ALLOWED_NOTIFICATION_EVENTS = new Set<string>([
  'login',
  'logout',
  'account_created',
  'account_approved',
  'account_rejected',
  'role_updated',
  'profile_updated',
  'borrow_requested',
  'borrow_approved',
  'borrow_rejected',
  'return_requested',
  'item_returned',
  'return_declined',
  'item_created',
  'item_edited',
  'item_deleted',
  'return_reminder',
]);

export const ADMIN_ALERT_EVENTS = new Set<string>([
  'account_created',
  'borrow_requested',
  'return_requested',
]);

export interface EventTemplateSpec {
  label: string;
  title: string;
  action: string;
  path: string;
  accent?: string;
  subject: (item: string) => string;
  body: (name: string, roleUpper: string) => string;
}

export const EVENT_SPECS: Record<string, EventTemplateSpec> = {
  login: {
    label: 'SECURITY // ACCESS AUTHORIZED',
    title: 'New login recorded',
    action: 'OPEN CICR VAULT',
    path: '/',
    subject: () => 'CICR Inventory: Sign in notification',
    body: (n) => `Hello ${n},\n\nA sign in session on your CICR Inventory account was recorded.`,
  },
  logout: {
    label: 'SECURITY // SESSION CLOSED',
    title: 'Session signed out',
    action: 'OPEN CICR VAULT',
    path: '/',
    subject: () => 'CICR Inventory: Sign out notification',
    body: (n) => `Hello ${n},\n\nYour CICR Inventory session has ended and you have signed out.`,
  },
  account_created: {
    label: 'ACCOUNT // REVIEW PENDING',
    title: 'Registration received',
    action: 'CHECK ACCOUNT STATUS',
    path: '/',
    subject: () => 'CICR Inventory: Registration received (awaiting approval)',
    body: (n) => `Hello ${n},\n\nYour CICR Inventory account registration has been received and is awaiting administrator approval. You will receive another email once an administrator reviews your request.`,
  },
  account_approved: {
    label: 'ACCOUNT // ACCESS APPROVED',
    title: 'Your account is ready',
    action: 'OPEN CICR VAULT',
    path: '/',
    subject: () => 'CICR Inventory: Account approved and active',
    body: (n) => `Hello ${n},\n\nYour CICR Inventory account has been approved by an administrator. You can now sign in to browse components and submit hardware requests.`,
  },
  account_rejected: {
    label: 'ACCOUNT // REVIEW COMPLETE',
    title: 'Registration update',
    action: 'OPEN CICR VAULT',
    path: '/',
    accent: '#ff2d8d',
    subject: () => 'CICR Inventory: Account registration declined',
    body: (n) => `Hello ${n},\n\nYour CICR Inventory registration request was reviewed and declined by an administrator. Please contact CICR leadership if you believe this was an error.`,
  },
  role_updated: {
    label: 'ACCOUNT // ROLE UPDATED',
    title: 'Account privileges updated',
    action: 'OPEN CICR VAULT',
    path: '/',
    subject: () => 'CICR Inventory: Account role updated',
    body: (n, r) => `Hello ${n},\n\nYour CICR Inventory account privilege role has been updated to ${r}.`,
  },
  profile_updated: {
    label: 'ACCOUNT // PROFILE UPDATED',
    title: 'Operator profile saved',
    action: 'OPEN CICR VAULT',
    path: '/',
    subject: () => 'CICR Inventory: Profile details updated',
    body: (n) => `Hello ${n},\n\nChanges to your CICR Inventory profile details were saved successfully.`,
  },
  borrow_requested: {
    label: 'REQUEST // SUBMITTED',
    title: 'Borrow request submitted',
    action: 'VIEW MY REQUESTS',
    path: '/#requests',
    subject: (i) => `CICR Inventory: Borrow request submitted${i ? ` (${i})` : ''}`,
    body: (n) => `Hello ${n},\n\nYour equipment borrow request has been submitted to the Admin Portal and is awaiting review.`,
  },
  borrow_approved: {
    label: 'REQUEST // APPROVED',
    title: 'Borrow request approved',
    action: 'VIEW MY REQUESTS',
    path: '/#requests',
    subject: (i) => `CICR Inventory: Borrow request approved${i ? ` (${i})` : ''}`,
    body: (n) => `Hello ${n},\n\nYour equipment borrow request has been approved and cleared for hardware issue.`,
  },
  borrow_rejected: {
    label: 'REQUEST // DECLINED',
    title: 'Borrow request declined',
    action: 'VIEW REQUEST DETAILS',
    path: '/#requests',
    accent: '#ff2d8d',
    subject: (i) => `CICR Inventory: Borrow request declined${i ? ` (${i})` : ''}`,
    body: (n) => `Hello ${n},\n\nYour equipment borrow request was declined by an administrator.`,
  },
  return_requested: {
    label: 'RETURN // CLEARANCE PENDING',
    title: 'Return request submitted',
    action: 'VIEW RETURN STATUS',
    path: '/#requests',
    subject: (i) => `CICR Inventory: Return request submitted${i ? ` (${i})` : ''}`,
    body: (n) => `Hello ${n},\n\nYour hardware return request has been submitted and is awaiting administrator inspection before restocking.`,
  },
  item_returned: {
    label: 'INVENTORY // RETURN ACCEPTED',
    title: 'Equipment return confirmed',
    action: 'VIEW INVENTORY',
    path: '/#inventory',
    subject: (i) => `CICR Inventory: Return accepted and restocked${i ? ` (${i})` : ''}`,
    body: (n) => `Hello ${n},\n\nYour equipment return has been inspected, accepted, and restocked in the CICR vault.`,
  },
  return_declined: {
    label: 'RETURN // DECLINED',
    title: 'Return request declined',
    action: 'VIEW ACTIVE LOANS',
    path: '/#requests',
    accent: '#ff2d8d',
    subject: (i) => `CICR Inventory: Return request declined${i ? ` (${i})` : ''}`,
    body: (n) => `Hello ${n},\n\nYour equipment return request was declined by an administrator, so this loan remains active under your account.`,
  },
  item_created: {
    label: 'VAULT // COMPONENT ADDED',
    title: 'Component registered in vault',
    action: 'OPEN COMPONENT VAULT',
    path: '/#inventory',
    subject: (i) => `CICR Inventory: Component added${i ? ` (${i})` : ''}`,
    body: (n) => `Hello ${n},\n\nA new hardware component has been added to the CICR Inventory vault catalog.`,
  },
  item_edited: {
    label: 'VAULT // COMPONENT EDITED',
    title: 'Component specification updated',
    action: 'OPEN COMPONENT VAULT',
    path: '/#inventory',
    subject: (i) => `CICR Inventory: Component updated${i ? ` (${i})` : ''}`,
    body: (n) => `Hello ${n},\n\nHardware component details or stock counts were updated in the CICR Inventory vault.`,
  },
  item_deleted: {
    label: 'VAULT // COMPONENT REMOVED',
    title: 'Component removed from vault',
    action: 'OPEN COMPONENT VAULT',
    path: '/#inventory',
    accent: '#ff2d8d',
    subject: (i) => `CICR Inventory: Component removed${i ? ` (${i})` : ''}`,
    body: (n) => `Hello ${n},\n\nA hardware component entry has been removed from the CICR Inventory vault.`,
  },
  return_reminder: {
    label: 'REMINDER // ACTION REQUIRED',
    title: 'Return reminder',
    action: 'VIEW ACTIVE LOANS',
    path: '/#requests',
    accent: '#ffc928',
    subject: (i) => `CICR Inventory: Equipment return reminder${i ? ` (${i})` : ''}`,
    body: (n) => `Hello ${n},\n\nThis is a reminder that an active equipment loan is due soon or overdue for return.`,
  },
};

