import { BorrowRequest, InventoryItem } from '../types/inventory';
import {
  extractEnrollmentDigits,
  extractIdentityFromEmail,
  isDirtyOrPlaceholderName,
  toCleanDisplayName,
} from './identity';

export type AuditCategory = 'borrow' | 'return' | 'account' | 'inventory';

export type AuditBadgeVariant =
  | 'signin'
  | 'signout'
  | 'account_request'
  | 'account_approved'
  | 'account_rejected'
  | 'role_updated'
  | 'profile_updated'
  | 'borrow_request'
  | 'borrow_approved'
  | 'borrow_rejected'
  | 'return_request'
  | 'return_cleared'
  | 'return_declined'
  | 'item_created'
  | 'item_edited'
  | 'item_deleted'
  | 'default';

export interface BuildAuditInput {
  summary: string;
  actorId?: string;
  actorName: string;
  actorEmail?: string;
  actorRoll?: string;
  actorRole?: string;
  targetId?: string;
  targetName?: string;
  targetEmail?: string;
  targetRoll?: string;
  targetType?: string;
  where: string;
  route?: string;
  location?: string;
  changes?: string[];
  timestamp?: string;
  meta?: Record<string, unknown>;
}

export interface ParsedAuditEntry {
  id: string;
  rawAction: string;
  actionLabel: string;
  category: AuditCategory;
  badgeVariant: AuditBadgeVariant;
  actor: {
    id?: string;
    name: string;
    email?: string;
    roll?: string;
    role: 'admin' | 'lead' | 'member' | 'system';
  };
  target: {
    id?: string;
    name?: string;
    email?: string;
    roll?: string;
    type?: string;
    location?: string;
  };
  requester?: {
    id?: string;
    name?: string;
    email?: string;
    roll?: string;
  };
  componentName?: string;
  quantity?: number;
  adminName?: string;
  assignedRole?: string;
  targetIdentifier?: string;
  decision?: 'approved' | 'rejected' | 'declined' | 'pending';
  where: string;
  route?: string;
  summary: string;
  changes: string[];
  when: {
    isoUtc: string;
    dateStr: string;
    timeStr: string;
    tzLabel: string;
    fullLocal: string;
    relativeTime: string;
    ms: number;
  };
  rawMeta?: Record<string, any>;
  rawDetails: string;
}

const MASTER_ADMIN_SET = new Set([
  'vardaansaxena096@gmail.com',
  'cicrinventory@gmail.com',
  'cicrinventoryofficial@gmail.com',
  '992501030399@mail.jiit.ac.in',
]);

export function getCurrentRoute(): string {
  if (typeof window === 'undefined') return '/api';
  const path = window.location.pathname || '/';
  const hash = window.location.hash || '';
  return `${path}${hash}` || '/';
}

export function buildAuditDetails(input: BuildAuditInput): string {
  const ts = input.timestamp || new Date().toISOString();
  const payload: Record<string, unknown> = {
    ...(input.meta || {}),
    summary: input.summary,
    actorId: input.actorId,
    actorName: input.actorName,
    actorEmail: input.actorEmail,
    actorRoll: input.actorRoll,
    actorRole: input.actorRole || 'member',
    targetId: input.targetId,
    targetName: input.targetName,
    targetEmail: input.targetEmail,
    targetRoll: input.targetRoll,
    targetType: input.targetType,
    where: input.where,
    route: input.route || getCurrentRoute(),
    location: input.location,
    changes: input.changes && input.changes.length > 0 ? input.changes : undefined,
    timestamp: ts,
  };

  Object.keys(payload).forEach((k) => {
    if (payload[k] === undefined || payload[k] === '') {
      delete payload[k];
    }
  });

  return JSON.stringify(payload);
}

function normalizeRole(role?: string, email?: string): 'admin' | 'lead' | 'member' | 'system' {
  if (email && MASTER_ADMIN_SET.has(email.toLowerCase().trim())) return 'admin';
  const r = (role || '').toLowerCase().trim();
  if (r === 'admin' || r === 'administrator' || r === 'superadmin') return 'admin';
  if (r === 'lead') return 'lead';
  if (r === 'system') return 'system';
  return 'member';
}

function findMember(
  members: any[] | undefined,
  opts: { id?: string; email?: string; name?: string }
) {
  if (!members || members.length === 0) return undefined;
  if (opts.id) {
    const byId = members.find((m) => m.id === opts.id);
    if (byId) return byId;
  }
  if (opts.email) {
    const lowerEmail = opts.email.toLowerCase().trim();
    const byEmail = members.find((m) => (m.email || '').toLowerCase().trim() === lowerEmail);
    if (byEmail) return byEmail;
  }
  if (opts.name && opts.name.toLowerCase() !== 'member' && opts.name.toLowerCase() !== 'admin') {
    const cleanedOpt = extractIdentityFromEmail(opts.email, { full_name: opts.name }).fullName.toLowerCase().trim();
    const canMatchClean = Boolean(cleanedOpt && !isDirtyOrPlaceholderName(cleanedOpt, opts.email));
    const optDigits = extractEnrollmentDigits(opts.name);
    const lowerName = opts.name.toLowerCase().trim();
    const byName = members.find((m) => {
      const mRaw = (m.full_name || '').toLowerCase().trim();
      if (canMatchClean) {
        const mClean = extractIdentityFromEmail(m.email, { full_name: m.full_name }).fullName.toLowerCase().trim();
        const mHasClean = Boolean(mClean && !isDirtyOrPlaceholderName(mClean, m.email));
        if ((mRaw && mRaw === cleanedOpt) || (mHasClean && (mClean === cleanedOpt || mClean === lowerName))) {
          return true;
        }
      }
      if (!isDirtyOrPlaceholderName(opts.name, opts.email) && mRaw && mRaw === lowerName) {
        return true;
      }
      if (optDigits) {
        const mRoll = (m.roll_number || m.enrollment_no || '').trim();
        if (mRoll && mRoll === optDigits) return true;
      }
      return false;
    });
    if (byName) return byName;
  }
  return undefined;
}

function findItem(
  items: InventoryItem[] | undefined,
  opts: { id?: string; name?: string }
) {
  if (!items || items.length === 0) return undefined;
  if (opts.id) {
    const byId = items.find((i) => i.id === opts.id);
    if (byId) return byId;
  }
  if (opts.name) {
    const lower = opts.name.toLowerCase().trim();
    const byName = items.find((i) => i.name.toLowerCase().trim() === lower);
    if (byName) return byName;
  }
  return undefined;
}

/**
 * Resolves a raw member/admin display name cleanly using the roster and email identity rules.
 */
function resolveCleanMemberName(
  rawName: string | undefined,
  membersRoster: any[] | undefined,
  opts?: { id?: string; email?: string; fallback?: string }
): string {
  const matched = findMember(membersRoster, {
    id: opts?.id,
    email: opts?.email,
    name: rawName,
  });
  const sourceName = matched?.full_name || rawName || '';
  const sourceEmail = matched?.email || opts?.email;
  const sourceRoll = matched?.roll_number || matched?.enrollment_no;
  if (!sourceName && !sourceEmail) return opts?.fallback || '';
  const identity = extractIdentityFromEmail(sourceEmail, {
    full_name: sourceName,
    enrollment_no: sourceRoll,
  });
  if (isDirtyOrPlaceholderName(sourceName, sourceEmail)) {
    return identity.fullName || opts?.fallback || '';
  }
  return toCleanDisplayName(sourceName) || identity.fullName || opts?.fallback || '';
}

/**
 * Matches a borrow/return audit log against live borrow_requests so legacy logs that omitted
 * borrower or approving admin metadata still display person, component, and admin names.
 */
function findMatchingRequest(
  requestsRoster: BorrowRequest[] | undefined,
  opts: {
    requestId?: string;
    itemId?: string;
    itemName?: string;
    quantity?: number;
    userId?: string;
    userEmail?: string;
    badgeVariant?: AuditBadgeVariant;
    createdAt?: string;
  }
): BorrowRequest | undefined {
  if (!requestsRoster || requestsRoster.length === 0) return undefined;
  if (opts.requestId) {
    const exact = requestsRoster.find((r) => r.id === opts.requestId);
    if (exact) return exact;
  }

  const normalizedItem = (opts.itemName || '').toLowerCase().trim();
  const candidates = requestsRoster.filter((r) => {
    const itemMatches =
      (opts.itemId && r.item_id === opts.itemId) ||
      (normalizedItem && (r.item_name || '').toLowerCase().trim() === normalizedItem);
    if (!itemMatches) return false;
    if (opts.quantity && Number(r.quantity) !== Number(opts.quantity)) return false;
    return true;
  });

  if (candidates.length === 0) return undefined;
  if (candidates.length === 1) return candidates[0];

  const logMs = opts.createdAt ? new Date(opts.createdAt).getTime() : NaN;

  let best = candidates[0];
  let bestScore = -Infinity;

  for (const r of candidates) {
    let score = 0;
    if (opts.userId && r.user_id === opts.userId) score += 20;
    if (opts.userEmail && (r.user_email || '').toLowerCase() === opts.userEmail.toLowerCase()) score += 20;

    if (opts.badgeVariant === 'borrow_approved' && ['approved', 'returned', 'overdue'].includes(r.status)) score += 10;
    else if (opts.badgeVariant === 'borrow_rejected' && r.status === 'rejected') score += 10;
    else if (opts.badgeVariant === 'return_cleared' && r.status === 'returned') score += 10;
    else if (opts.badgeVariant === 'return_declined' && ['approved', 'overdue'].includes(r.status)) score += 10;

    if (!Number.isNaN(logMs)) {
      const reqMs = new Date(r.updated_at || r.created_at).getTime();
      if (!Number.isNaN(reqMs)) {
        const diffHours = Math.abs(logMs - reqMs) / (1000 * 60 * 60);
        score -= Math.min(diffHours, 100) * 0.05;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      best = r;
    }
  }

  return best;
}

export function formatAuditTimestamp(rawTs?: string, nowMs: number = Date.now()) {
  const parsed = rawTs ? new Date(rawTs) : new Date(nowMs);
  const valid = !Number.isNaN(parsed.getTime()) ? parsed : new Date(nowMs);
  const ms = valid.getTime();

  const dateStr = valid.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  const timeStr = valid.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  let tzLabel = 'Local';
  try {
    const parts = new Intl.DateTimeFormat('en-IN', { timeZoneName: 'short' }).formatToParts(valid);
    const tzPart = parts.find((p) => p.type === 'timeZoneName')?.value;
    if (tzPart) tzLabel = tzPart;
  } catch {
    tzLabel = 'Local';
  }

  const diffSeconds = Math.max(0, Math.floor((nowMs - ms) / 1000));
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  let relativeTime = 'Just now';
  if (diffSeconds < 60 && diffSeconds >= 10) relativeTime = `${diffSeconds}s ago`;
  else if (diffMinutes >= 1 && diffMinutes < 60) relativeTime = `${diffMinutes}m ago`;
  else if (diffHours >= 1 && diffHours < 24) relativeTime = `${diffHours}h ago`;
  else if (diffDays === 1) relativeTime = 'Yesterday';
  else if (diffDays > 1) relativeTime = `${diffDays}d ago`;

  return {
    isoUtc: valid.toISOString(),
    dateStr,
    timeStr,
    tzLabel,
    fullLocal: `${dateStr}, ${timeStr} ${tzLabel}`,
    relativeTime,
    ms,
  };
}

/**
 * Parses and normalizes raw activity log records (structured JSON or legacy plain text)
 * into clean, identity-enriched audit entries without exposing location/timestamp clutter in views.
 *
 * @param log Raw row from `activity_logs`
 * @param membersRoster Normalized member roster for actor/target identity resolution
 * @param itemsRoster Inventory catalog for item name resolution
 * @param nowMs Reference epoch milliseconds for internal timeframe filtering
 * @param requestsRoster Borrow requests roster for enriching legacy issue/return logs
 */
export function parseAuditLog(
  log: any,
  membersRoster?: any[],
  itemsRoster?: InventoryItem[],
  nowMs: number = Date.now(),
  requestsRoster?: BorrowRequest[]
): ParsedAuditEntry {
  const rawDetails = typeof log?.details === 'string' ? log.details : JSON.stringify(log?.details || '');
  const rawAction = String(log?.action || 'ACTIVITY').trim();
  const actionUpper = rawAction.toUpperCase();

  let meta: Record<string, any> | undefined;
  const trimmed = rawDetails.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      meta = JSON.parse(trimmed);
    } catch {
      meta = undefined;
    }
  }

  // Determine exact classification FIRST without overlapping substrings
  let badgeVariant: AuditBadgeVariant = 'default';
  let actionLabel = rawAction.replace(/_/g, ' ');
  let category: AuditCategory = 'account';
  let inferredWhere = 'CICR Inventory Vault';

  const detailsLower = rawDetails.toLowerCase();

  if (actionUpper === 'ROLE_UPDATED' || (actionUpper.includes('ROLE') && !actionUpper.includes('ITEM'))) {
    badgeVariant = 'role_updated';
    actionLabel = 'Role Updated';
    category = 'account';
    inferredWhere = 'Management Hub > Club Members';
  } else if (actionUpper === 'PROFILE_UPDATED') {
    badgeVariant = 'profile_updated';
    actionLabel = 'Profile Updated';
    category = 'account';
    inferredWhere = 'Operator Profile > Settings';
  } else if (actionUpper === 'ACCOUNT_REQUEST') {
    badgeVariant = 'account_request';
    actionLabel = 'Account Request';
    category = 'account';
    inferredWhere = 'Auth Portal > Google SSO Registration';
  } else if (actionUpper === 'ACCOUNT_APPROVED') {
    badgeVariant = 'account_approved';
    actionLabel = 'Account Approved';
    category = 'account';
    inferredWhere = 'Management Hub > Account Requests';
  } else if (actionUpper === 'ACCOUNT_REJECTED') {
    badgeVariant = 'account_rejected';
    actionLabel = 'Account Rejected';
    category = 'account';
    inferredWhere = 'Management Hub > Account Requests';
  } else if (actionUpper === 'USER_SIGNIN' || actionUpper === 'LOGIN') {
    badgeVariant = 'signin';
    actionLabel = 'Sign In';
    category = 'account';
    inferredWhere = 'Auth Portal > Session Start';
  } else if (actionUpper === 'USER_SIGNOUT') {
    badgeVariant = 'signout';
    actionLabel = 'Sign Out';
    category = 'account';
    inferredWhere = 'CICR Vault > Session End';
  } else if (actionUpper === 'CREATE_ITEM') {
    badgeVariant = 'item_created';
    actionLabel = 'Component Added';
    category = 'inventory';
    inferredWhere = 'Inventory Vault > Catalog Manager';
  } else if (actionUpper === 'UPDATE_ITEM') {
    badgeVariant = 'item_edited';
    actionLabel = 'Component Edited';
    category = 'inventory';
    inferredWhere = 'Inventory Vault > Component Editor';
  } else if (actionUpper === 'DELETE_ITEM') {
    badgeVariant = 'item_deleted';
    actionLabel = 'Component Deleted';
    category = 'inventory';
    inferredWhere = 'Inventory Vault > Component Removal';
  } else if (actionUpper === 'BORROW_REQUEST') {
    badgeVariant = 'borrow_request';
    actionLabel = 'Requisition';
    category = 'borrow';
    inferredWhere = 'Inventory Vault > Requisition Checkout';
  } else if (actionUpper === 'BORROW_APPROVED' || actionUpper === 'APPROVED') {
    badgeVariant = 'borrow_approved';
    actionLabel = 'Borrow Approved';
    category = 'borrow';
    inferredWhere = 'Requisitions > Review Queue';
  } else if (actionUpper === 'BORROW_REJECTED' || actionUpper === 'REJECTED') {
    badgeVariant = 'borrow_rejected';
    actionLabel = 'Borrow Rejected';
    category = 'borrow';
    inferredWhere = 'Requisitions > Review Queue';
  } else if (actionUpper === 'RETURN_REQUEST') {
    badgeVariant = 'return_request';
    actionLabel = 'Return Requested';
    category = 'return';
    inferredWhere = 'Requisitions > My Requisitions';
  } else if (actionUpper === 'RETURN_DECLINED') {
    badgeVariant = 'return_declined';
    actionLabel = 'Return Declined';
    category = 'return';
    inferredWhere = 'Requisitions > Return Clearance';
  } else if (actionUpper === 'ITEM_RETURNED' || actionUpper === 'RETURNED') {
    badgeVariant = 'return_cleared';
    actionLabel = 'Return Cleared';
    category = 'return';
    inferredWhere = 'Requisitions > Return Clearance';
  } else if (detailsLower.includes('signed in') || detailsLower.includes('logged in')) {
    badgeVariant = 'signin';
    actionLabel = 'Sign In';
    category = 'account';
    inferredWhere = 'Auth Portal > Session Start';
  } else if (detailsLower.includes('signed out') || detailsLower.includes('logged out')) {
    badgeVariant = 'signout';
    actionLabel = 'Sign Out';
    category = 'account';
    inferredWhere = 'CICR Vault > Session End';
  } else if (detailsLower.includes('registration request')) {
    badgeVariant = 'account_request';
    actionLabel = 'Account Request';
    category = 'account';
    inferredWhere = 'Auth Portal > Registration';
  } else if (detailsLower.includes('account for') && detailsLower.includes('approved')) {
    badgeVariant = 'account_approved';
    actionLabel = 'Account Approved';
    category = 'account';
    inferredWhere = 'Management Hub > Account Requests';
  } else if (detailsLower.includes('account for') && detailsLower.includes('rejected')) {
    badgeVariant = 'account_rejected';
    actionLabel = 'Account Rejected';
    category = 'account';
    inferredWhere = 'Management Hub > Account Requests';
  } else if (detailsLower.includes('requested to return')) {
    badgeVariant = 'return_request';
    actionLabel = 'Return Requested';
    category = 'return';
    inferredWhere = 'Requisitions > Return Request';
  } else if (detailsLower.includes('returned')) {
    badgeVariant = 'return_cleared';
    actionLabel = 'Return Cleared';
    category = 'return';
    inferredWhere = 'Requisitions > Return Clearance';
  } else if (detailsLower.includes('requested')) {
    badgeVariant = 'borrow_request';
    actionLabel = 'Requisition';
    category = 'borrow';
    inferredWhere = 'Inventory Vault > Requisition Checkout';
  } else if (detailsLower.includes('edited') || detailsLower.includes('component')) {
    badgeVariant = 'item_edited';
    actionLabel = 'Component Edited';
    category = 'inventory';
    inferredWhere = 'Inventory Vault > Component Editor';
  }

  // Extract structured or legacy Actor, Target, Summary, Changes
  let actorId: string | undefined = meta?.actorId || log?.user_id;
  let actorName: string = meta?.actorName || '';
  let actorEmail: string | undefined = meta?.actorEmail;
  let actorRoll: string | undefined = meta?.actorRoll;
  let actorRoleRaw: string | undefined = meta?.actorRole;

  let targetId: string | undefined = meta?.targetId;
  let targetName: string | undefined = meta?.targetName;
  let targetEmail: string | undefined = meta?.targetEmail;
  let targetRoll: string | undefined = meta?.targetRoll;
  let targetType: string | undefined = meta?.targetType;
  let targetLocation: string | undefined = meta?.location;

  let parsedQty: number | undefined =
    typeof meta?.quantity === 'number' && meta.quantity > 0 ? meta.quantity : undefined;
  let parsedItemName: string | undefined =
    typeof meta?.itemName === 'string' && meta.itemName.trim() ? meta.itemName.trim() : undefined;
  let assignedRole: string | undefined =
    typeof meta?.newRole === 'string' && meta.newRole.trim()
      ? meta.newRole.trim().toUpperCase()
      : undefined;

  let requester: ParsedAuditEntry['requester'] =
    meta?.requesterName || meta?.requesterEmail
      ? {
          id: meta?.requesterId,
          name: meta?.requesterName,
          email: meta?.requesterEmail,
          roll: meta?.requesterRoll,
        }
      : undefined;

  const where: string = meta?.where || inferredWhere;
  const route: string | undefined = meta?.route;
  let summary: string = meta?.summary || '';
  let changes: string[] = Array.isArray(meta?.changes) ? meta.changes : [];

  if (meta) {
    // Handle structured JSON payloads (including older ACCOUNT_REQUEST JSON)
    if (actionUpper === 'ACCOUNT_REQUEST') {
      const reqName = meta.fullName || meta.full_name || meta.name || actorName || log?.user_name || 'Applicant';
      const reqEmail = meta.email || actorEmail || '';
      const reqRoll = meta.enrollmentNo || meta.enrollment_no || meta.roll_number || actorRoll || '';
      if (!actorName) actorName = reqName;
      if (!actorEmail) actorEmail = reqEmail;
      if (!actorRoll) actorRoll = reqRoll;
      if (!actorRoleRaw) actorRoleRaw = meta.role || 'member';
      if (!targetName) targetName = reqName;
      if (!targetEmail) targetEmail = reqEmail;
      if (!targetRoll) targetRoll = reqRoll;
      if (!targetType) targetType = 'account';
      if (!summary) {
        summary = `Registration request submitted by ${reqName}${reqEmail ? ` (${reqEmail})` : ''}${reqRoll ? ` • Roll: ${reqRoll}` : ''}`;
      }
    }
    if (badgeVariant === 'role_updated') {
      if (!targetType) targetType = 'account';
      if (!assignedRole && changes.length > 0) {
        const roleChg = changes.find((c) => /role/i.test(c));
        const roleMatch = roleChg?.match(/(?:→|->|to|:)\s*(admin|member|lead)\b/i);
        if (roleMatch) assignedRole = roleMatch[1].toUpperCase();
      }
      if (!assignedRole && summary) {
        const sumMatch = summary.match(/\bto\s+(admin|member|lead)\b/i);
        if (sumMatch) assignedRole = sumMatch[1].toUpperCase();
      }
    }
    if (!summary) {
      summary = rawDetails;
    }
  } else {
    // Parse legacy plain-text entries smartly
    if (badgeVariant === 'role_updated') {
      const match = rawDetails.match(/^(.+?)'s role was updated to ([A-Za-z]+) by (.+?)\.?$/i);
      if (match) {
        const rawTargetName = match[1].trim();
        const newRole = match[2].trim().toUpperCase();
        const rawActorName = match[3].trim();
        assignedRole = newRole;
        targetType = 'account';
        actorRoleRaw = 'admin';
        changes = [`Role updated to ${newRole}`];

        // Match target and actor strictly by their parsed names first so log.user_id ambiguity
        // (historically either target UUID or actor UUID) never swaps actor and target!
        let tMember =
          rawTargetName && rawTargetName.toLowerCase() !== 'member'
            ? findMember(membersRoster, { name: rawTargetName })
            : undefined;
        let aMember =
          rawActorName && rawActorName.toLowerCase() !== 'admin'
            ? findMember(membersRoster, { name: rawActorName })
            : undefined;

        if (!tMember && log?.user_id && log.user_id !== aMember?.id && (!rawTargetName || rawTargetName.toLowerCase() === 'member')) {
          tMember = findMember(membersRoster, { id: log.user_id });
        }
        if (!aMember && log?.user_id && log.user_id !== tMember?.id && (!rawActorName || rawActorName.toLowerCase() === 'admin')) {
          aMember = findMember(membersRoster, { id: log.user_id });
        }

        if (tMember) {
          targetId = tMember.id;
          targetEmail = tMember.email;
          targetRoll = tMember.roll_number || tMember.enrollment_no;
        } else {
          targetId = undefined;
        }
        const tIdentity = extractIdentityFromEmail(targetEmail, {
          full_name: tMember?.full_name || rawTargetName,
          enrollment_no: targetRoll,
        });
        targetName = isDirtyOrPlaceholderName(tMember?.full_name || rawTargetName, targetEmail)
          ? tIdentity.fullName
          : toCleanDisplayName(tMember?.full_name || rawTargetName);
        targetRoll = targetRoll || tIdentity.enrollmentNo || undefined;

        if (aMember) {
          actorId = aMember.id;
          actorEmail = aMember.email;
          actorRoll = aMember.roll_number || aMember.enrollment_no;
          actorRoleRaw = aMember.role;
        } else {
          actorId = undefined;
        }
        const aIdentity = extractIdentityFromEmail(actorEmail, {
          full_name: aMember?.full_name || rawActorName,
          enrollment_no: actorRoll,
        });
        actorName = isDirtyOrPlaceholderName(aMember?.full_name || rawActorName, actorEmail)
          ? aIdentity.fullName
          : toCleanDisplayName(aMember?.full_name || rawActorName);
        actorRoll = actorRoll || aIdentity.enrollmentNo || undefined;
      }
    } else if (badgeVariant === 'account_approved' || badgeVariant === 'account_rejected') {
      const match = rawDetails.match(/^Account for (.+?) was (approved|rejected)\.?$/i);
      const actionVerb = match ? match[2].toLowerCase() : badgeVariant === 'account_approved' ? 'approved' : 'rejected';
      const rawTarget = match ? match[1].trim() : log?.user_name || 'Member';
      // In old logs, log.user_id held the target user's UUID!
      const tMember = findMember(membersRoster, {
        id: log?.user_id,
        name: rawTarget !== 'Member' ? rawTarget : undefined,
      });
      targetId = tMember?.id || log?.user_id;
      targetEmail = tMember?.email;
      const tIdentity = extractIdentityFromEmail(targetEmail, {
        full_name: tMember?.full_name || (rawTarget !== 'Member' ? rawTarget : ''),
        enrollment_no: tMember?.roll_number || tMember?.enrollment_no,
      });
      targetName =
        (tMember?.full_name && !isDirtyOrPlaceholderName(tMember.full_name, targetEmail)
          ? toCleanDisplayName(tMember.full_name)
          : '') ||
        (rawTarget !== 'Member' && !isDirtyOrPlaceholderName(rawTarget, targetEmail)
          ? toCleanDisplayName(rawTarget)
          : '') ||
        tIdentity.fullName ||
        'Member Account';
      targetRoll = tMember?.roll_number || tMember?.enrollment_no || tIdentity.enrollmentNo || undefined;
      targetType = 'account';
      actorId = undefined;
      actorName = 'Administrator (Historical Record)';
      actorRoleRaw = 'admin';
      changes = [`Status → ${actionVerb.toUpperCase()}`];
      summary = `Account for ${targetName}${targetEmail ? ` (${targetEmail})` : ''} was ${actionVerb}`;
    } else if (badgeVariant === 'item_created') {
      const match = rawDetails.match(/^Registered new component "(.+?)" \((.+?)\)$/i);
      if (match) {
        parsedItemName = match[1].trim();
        targetName = parsedItemName;
        targetType = 'inventory_item';
        actorRoleRaw = 'admin';
        changes = [`Category: ${match[2].trim()}`];
        const item = findItem(itemsRoster, { id: log?.item_id, name: targetName });
        if (item?.location) targetLocation = item.location;
      }
    } else if (badgeVariant === 'item_edited') {
      const match = rawDetails.match(/^Admin (.+?) edited (?:component )?"?([^":]+)"?(?:: (.+))?$/i);
      if (match) {
        actorName = match[1].trim();
        parsedItemName = match[2].trim();
        targetName = parsedItemName;
        targetType = 'inventory_item';
        actorRoleRaw = 'admin';
        if (match[3]) {
          changes = match[3].split(', ').map((s: string) => s.trim()).filter(Boolean);
        }
        const item = findItem(itemsRoster, { id: log?.item_id, name: targetName });
        if (item?.location) targetLocation = item.location;
      }
    } else if (badgeVariant === 'item_deleted') {
      const match = rawDetails.match(/^Removed component "(.+?)" from vault inventory$/i);
      if (match) {
        parsedItemName = match[1].trim();
        targetName = parsedItemName;
        targetType = 'inventory_item';
        actorRoleRaw = 'admin';
      }
    } else if (badgeVariant === 'borrow_request') {
      const match = rawDetails.match(/^Requested (\d+)x (.+?) for "(.+?)"$/i);
      if (match) {
        parsedQty = Number(match[1]);
        parsedItemName = match[2].trim();
        targetName = `${parsedQty}x ${parsedItemName}`;
        targetType = 'borrow_request';
        const item = findItem(itemsRoster, { id: log?.item_id, name: parsedItemName });
        if (item?.location) targetLocation = item.location;
        changes = [`Project: "${match[3]}"`, `Qty: ${match[1]}`];
      }
    } else if (badgeVariant === 'return_request') {
      const match = rawDetails.match(/^(.+?) requested to return (\d+)x (.+?) for "(.+?)"/i);
      if (match) {
        if (!actorName) actorName = match[1].trim();
        parsedQty = Number(match[2]);
        parsedItemName = match[3].trim();
        targetName = `${parsedQty}x ${parsedItemName}`;
        targetType = 'borrow_request';
        const item = findItem(itemsRoster, { id: log?.item_id, name: parsedItemName });
        if (item?.location) targetLocation = item.location;
        changes = [`Project: "${match[4]}"`, `Qty: ${match[2]}`];
      }
    } else if (
      badgeVariant === 'borrow_approved' ||
      badgeVariant === 'borrow_rejected' ||
      badgeVariant === 'return_cleared'
    ) {
      const match = rawDetails.match(/^(.+?) marked as (\w+) \(x(\d+)\)$/i);
      if (match) {
        parsedItemName = match[1].trim();
        parsedQty = Number(match[3]);
        targetName = `${parsedQty}x ${parsedItemName}`;
        targetType = 'borrow_request';
        actorRoleRaw = 'admin';
        const item = findItem(itemsRoster, { id: log?.item_id, name: parsedItemName });
        if (item?.location) targetLocation = item.location;
      }
    }

    if (!actorName) {
      actorName = log?.user_name || 'System Member';
    }
    if (!summary) {
      summary = rawDetails || 'Activity logged';
    }
  }

  // Enrich legacy borrow/return records against live borrow_requests so person, component,
  // and approving/rejecting admin names remain visible even on older terse records.
  const isBorrowOrReturn =
    badgeVariant === 'borrow_request' ||
    badgeVariant === 'borrow_approved' ||
    badgeVariant === 'borrow_rejected' ||
    badgeVariant === 'return_request' ||
    badgeVariant === 'return_cleared' ||
    badgeVariant === 'return_declined';

  if (isBorrowOrReturn) {
    if (!parsedQty && targetName) {
      const qtyMatch = targetName.match(/^(\d+)x\s+(.+)$/i);
      if (qtyMatch) {
        parsedQty = Number(qtyMatch[1]);
        if (!parsedItemName) parsedItemName = qtyMatch[2].trim();
      }
    } else if (!parsedItemName && targetName) {
      parsedItemName = targetName.replace(/^\d+x\s+/i, '').trim();
    }
  }

  const matchedReq = isBorrowOrReturn
    ? findMatchingRequest(requestsRoster, {
        requestId: meta?.requestId,
        itemId: meta?.itemId || log?.item_id,
        itemName: parsedItemName,
        quantity: parsedQty,
        userId: requester?.id || meta?.requesterId || log?.user_id,
        userEmail: requester?.email || meta?.requesterEmail,
        badgeVariant,
        createdAt: meta?.timestamp || meta?.created_at || log?.created_at,
      })
    : undefined;

  if (isBorrowOrReturn && matchedReq) {
    if (!parsedItemName && matchedReq.item_name) parsedItemName = matchedReq.item_name;
    if (!parsedQty && matchedReq.quantity) parsedQty = Number(matchedReq.quantity);

    const isAdminAction =
      badgeVariant === 'borrow_approved' ||
      badgeVariant === 'borrow_rejected' ||
      badgeVariant === 'return_cleared' ||
      badgeVariant === 'return_declined';

    if (isAdminAction) {
      if (!requester?.name && (matchedReq.user_name || matchedReq.user_email)) {
        requester = {
          id: matchedReq.user_id,
          name: matchedReq.user_name,
          email: matchedReq.user_email,
        };
      }
      const genericActors = new Set([
        '',
        'System Member',
        'Member',
        'Admin',
        'System Operator',
        'Administrator (Historical Record)',
      ]);
      const actorIsBorrower = Boolean(
        (actorId && matchedReq.user_id && actorId === matchedReq.user_id) ||
          (actorName && requester?.name && actorName.toLowerCase() === requester.name.toLowerCase())
      );
      if ((genericActors.has(actorName) || actorIsBorrower) && matchedReq.approved_by) {
        actorId = undefined;
        actorEmail = undefined;
        actorRoll = undefined;
        actorName = matchedReq.approved_by;
        actorRoleRaw = 'admin';
      }
    } else if (!requester?.name && (matchedReq.user_name || matchedReq.user_email)) {
      requester = {
        id: matchedReq.user_id,
        name: matchedReq.user_name,
        email: matchedReq.user_email,
      };
    }
  }

  // Enrich Actor from roster and strip dirty roll tokens / placeholders
  const matchedActor = findMember(membersRoster, {
    id: actorId,
    email: actorEmail,
    name: actorName,
  });
  if (matchedActor) {
    actorId = matchedActor.id;
    const matchedActorEmail = matchedActor.email || actorEmail;
    if (
      matchedActor.full_name &&
      (!isDirtyOrPlaceholderName(matchedActor.full_name, matchedActorEmail) ||
        isDirtyOrPlaceholderName(actorName, matchedActorEmail))
    ) {
      actorName = matchedActor.full_name;
    }
    actorEmail = matchedActorEmail;
    actorRoll = matchedActor.roll_number || matchedActor.enrollment_no || actorRoll;
    actorRoleRaw = matchedActor.role || actorRoleRaw;
  }
  if (actorName && !actorName.includes('(Historical Record)')) {
    const actorIdentity = extractIdentityFromEmail(actorEmail, {
      full_name: actorName,
      enrollment_no: actorRoll,
    });
    if (isDirtyOrPlaceholderName(actorName, actorEmail)) {
      actorName = actorIdentity.fullName;
    } else {
      actorName = toCleanDisplayName(actorName);
    }
    if (!actorRoll && actorIdentity.enrollmentNo) {
      actorRoll = actorIdentity.enrollmentNo;
    }
  }

  // Enrich Target or Requester from roster or items and clean identity strings
  if (targetType === 'account' && (targetId || targetEmail || targetName)) {
    const matchedTarget = findMember(membersRoster, {
      id: targetId,
      email: targetEmail,
      name: targetName,
    });
    if (matchedTarget) {
      targetId = matchedTarget.id;
      const matchedTargetEmail = matchedTarget.email || targetEmail;
      if (
        matchedTarget.full_name &&
        (!isDirtyOrPlaceholderName(matchedTarget.full_name, matchedTargetEmail) ||
          isDirtyOrPlaceholderName(targetName, matchedTargetEmail))
      ) {
        targetName = matchedTarget.full_name;
      }
      targetEmail = matchedTargetEmail;
      targetRoll = matchedTarget.roll_number || matchedTarget.enrollment_no || targetRoll;
    }
    if (targetName || targetEmail) {
      const targetIdentity = extractIdentityFromEmail(targetEmail, {
        full_name: targetName,
        enrollment_no: targetRoll,
      });
      if (isDirtyOrPlaceholderName(targetName, targetEmail)) {
        targetName = targetIdentity.fullName;
      } else if (targetName) {
        targetName = toCleanDisplayName(targetName);
      }
      if (!targetRoll && targetIdentity.enrollmentNo) {
        targetRoll = targetIdentity.enrollmentNo;
      }
    }
  } else if (!targetLocation && (log?.item_id || meta?.itemId || targetName)) {
    const bareName = (parsedItemName || meta?.itemName || targetName || '').replace(/^\d+x\s+/i, '').trim();
    const matchedItem = findItem(itemsRoster, { id: log?.item_id || meta?.itemId, name: bareName });
    if (matchedItem?.location) {
      targetLocation = matchedItem.location;
    }
  }

  if (requester && (requester.id || requester.email || requester.name)) {
    const matchedReqMember = findMember(membersRoster, requester);
    if (matchedReqMember) {
      const matchedReqEmail = matchedReqMember.email || requester.email;
      const preferredReqName =
        matchedReqMember.full_name &&
        (!isDirtyOrPlaceholderName(matchedReqMember.full_name, matchedReqEmail) ||
          isDirtyOrPlaceholderName(requester.name, matchedReqEmail))
          ? matchedReqMember.full_name
          : requester.name;
      requester = {
        id: matchedReqMember.id,
        name: preferredReqName,
        email: matchedReqEmail,
        roll: matchedReqMember.roll_number || matchedReqMember.enrollment_no || requester.roll,
      };
    }
    const reqIdentity = extractIdentityFromEmail(requester.email, {
      full_name: requester.name,
      enrollment_no: requester.roll,
    });
    requester = {
      ...requester,
      name: isDirtyOrPlaceholderName(requester.name, requester.email)
        ? reqIdentity.fullName
        : toCleanDisplayName(requester.name),
      roll: requester.roll || reqIdentity.enrollmentNo || undefined,
    };
  }

  // Infer role for known inventory/admin ops if still member
  const resolvedRole = normalizeRole(
    actorRoleRaw ||
      ([
        'account_approved',
        'account_rejected',
        'role_updated',
        'borrow_approved',
        'borrow_rejected',
        'return_cleared',
        'return_declined',
        'item_created',
        'item_edited',
        'item_deleted',
      ].includes(badgeVariant)
        ? 'admin'
        : 'member'),
    actorEmail
  );

  // Domain-specific normalization for clean, unambiguous UI & summaries
  let componentName: string | undefined = undefined;
  let adminName: string | undefined = undefined;
  let decision: ParsedAuditEntry['decision'] = undefined;
  let targetIdentifier: string | undefined = undefined;

  if (badgeVariant === 'signin' || badgeVariant === 'signout') {
    const resolvedActor = actorName || 'Member';
    summary = badgeVariant === 'signin' ? `${resolvedActor} logged in` : `${resolvedActor} logged out`;
    targetId = undefined;
    targetName = undefined;
    targetEmail = undefined;
    targetRoll = undefined;
    targetType = undefined;
    targetLocation = undefined;
    changes = [];
  } else if (badgeVariant === 'role_updated') {
    const resolvedRoleGiven = assignedRole || 'MEMBER';
    assignedRole = resolvedRoleGiven;
    targetIdentifier = targetRoll || targetEmail || targetId || undefined;
    const targetDisplay =
      targetName && targetName.toLowerCase() !== 'member'
        ? targetName
        : targetIdentifier || 'Member';
    if (targetIdentifier && targetDisplay.toLowerCase() !== targetIdentifier.toLowerCase()) {
      summary = `${actorName} updated ${targetDisplay} (ID: ${targetIdentifier}) role to ${resolvedRoleGiven}`;
    } else if (targetIdentifier) {
      summary = `${actorName} updated ID ${targetIdentifier} role to ${resolvedRoleGiven}`;
    } else {
      summary = `${actorName} updated ${targetDisplay} role to ${resolvedRoleGiven}`;
    }
  } else if (isBorrowOrReturn) {
    const cleanItem = (parsedItemName || targetName || 'Component').replace(/^\d+x\s+/i, '').trim();
    componentName = parsedQty ? `${parsedQty}x ${cleanItem}` : cleanItem;
    targetName = componentName;

    if (!requester && (badgeVariant === 'borrow_request' || badgeVariant === 'return_request')) {
      requester = {
        id: actorId,
        name: actorName,
        email: actorEmail,
        roll: actorRoll,
      };
    }

    const personDisplay = requester?.name || actorName || 'Member';

    if (badgeVariant === 'borrow_approved') {
      adminName = actorName;
      decision = 'approved';
      summary = `${adminName} approved issue of ${componentName} for ${personDisplay}`;
    } else if (badgeVariant === 'borrow_rejected') {
      adminName = actorName;
      decision = 'rejected';
      summary = `${adminName} rejected issue of ${componentName} for ${personDisplay}`;
    } else if (badgeVariant === 'return_cleared') {
      adminName = actorName;
      decision = 'approved';
      summary = `${adminName} approved return of ${componentName} from ${personDisplay}`;
    } else if (badgeVariant === 'return_declined') {
      adminName = actorName;
      decision = 'declined';
      summary = `${adminName} rejected return of ${componentName} from ${personDisplay}`;
    } else if (badgeVariant === 'borrow_request') {
      if (matchedReq && matchedReq.status !== 'pending' && matchedReq.approved_by) {
        adminName = resolveCleanMemberName(matchedReq.approved_by, membersRoster, {
          fallback: matchedReq.approved_by,
        });
        decision = matchedReq.status === 'rejected' ? 'rejected' : 'approved';
        summary = `${personDisplay} requested issue of ${componentName} (${decision === 'rejected' ? 'Rejected' : 'Approved'} by ${adminName})`;
      } else {
        decision = 'pending';
        summary = `${personDisplay} requested issue of ${componentName}`;
      }
    } else if (badgeVariant === 'return_request') {
      if (matchedReq && matchedReq.status === 'returned' && matchedReq.approved_by) {
        adminName = resolveCleanMemberName(matchedReq.approved_by, membersRoster, {
          fallback: matchedReq.approved_by,
        });
        decision = 'approved';
        summary = `${personDisplay} requested return of ${componentName} (Approved by ${adminName})`;
      } else {
        decision = 'pending';
        summary = `${personDisplay} requested return of ${componentName}`;
      }
    }
  } else if (badgeVariant === 'item_created' || badgeVariant === 'item_edited' || badgeVariant === 'item_deleted') {
    const cleanItem = (parsedItemName || targetName || 'Component').trim();
    componentName = cleanItem;
  }

  const when = formatAuditTimestamp(meta?.timestamp || meta?.created_at || log?.created_at, nowMs);

  return {
    id: log?.id || `${when.ms}-${actorName}`,
    rawAction,
    actionLabel,
    category,
    badgeVariant,
    actor: {
      id: actorId,
      name: actorName || 'System Operator',
      email: actorEmail,
      roll: actorRoll,
      role: resolvedRole,
    },
    target: {
      id: targetId,
      name: targetName,
      email: targetEmail,
      roll: targetRoll,
      type: targetType,
      location: targetLocation,
    },
    requester,
    componentName,
    quantity: parsedQty,
    adminName,
    assignedRole,
    targetIdentifier,
    decision,
    where,
    route,
    summary,
    changes,
    when,
    rawMeta: meta,
    rawDetails,
  };
}
