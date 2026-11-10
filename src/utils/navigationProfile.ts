/**
 * Shared navigation metadata, hardware vault category shortcuts, and operator
 * identity resolution helpers consumed by both the desktop BottomNavbar dock
 * and the mobile slide out navigation sidebar.
 */

import { Boxes, Cpu, Radio, Compass, Zap, Wrench, type LucideIcon } from 'lucide-react';
import { BorrowRequest, isReturnRequested } from '../types/inventory';
import {
  extractIdentityFromEmail,
  isDirtyOrPlaceholderName,
  toCleanDisplayName,
} from '../lib/identity';

/**
 * Primary workspace view identifiers synchronized with URL history navigation.
 */
export type ActiveView = 'dashboard' | 'inventory' | 'review-requests' | 'logs' | 'developers';

/**
 * Hardware category filter descriptor rendered inside navigation menus.
 */
export interface VaultCategoryNavItem {
  key: string;
  label: string;
  icon: LucideIcon;
}

/**
 * Canonical ordered hardware vault category shortcuts shared across navigation surfaces.
 */
export const VAULT_CATEGORY_ITEMS: readonly VaultCategoryNavItem[] = [
  { key: 'all', label: 'All Catalog', icon: Boxes },
  { key: 'mcu', label: 'Microcontrollers', icon: Cpu },
  { key: 'sensors', label: 'Sensors', icon: Radio },
  { key: 'actuators', label: 'Actuators', icon: Compass },
  { key: 'power', label: 'Power', icon: Zap },
  { key: 'tools', label: 'Tools', icon: Wrench },
];

/**
 * Official institutional feedback and bug report form URL.
 */
export const BUG_FEEDBACK_FORM_URL =
  'https://docs.google.com/forms/d/e/1FAIpQLScF-vaE7NEi-teLfHsB3FkIkW2ggAzRLV3nr7jM0rp1pP5w8g/viewform';

/**
 * Resolved operator identity and notification count metadata for navigation chrome.
 */
export interface NavigationOperatorMeta {
  rawEmail: string;
  displayName: string;
  enrollmentNo: string;
  roleName: 'ADMIN' | 'MEMBER';
  avatarSrc: string;
  initial: string;
  pendingCount: number;
}

interface ResolveNavigationMetaParams {
  user: any;
  profile: any;
  isAdmin: boolean;
  requests: BorrowRequest[];
}

/**
 * Resolves sanitized operator identity fields, profile avatar fallback, and pending
 * requisition counter consistently for desktop and mobile navigation components.
 *
 * @param params Authenticated user session, profile record, admin flag, and active requests.
 * @returns Normalized display metadata safe against raw email prefixes and pending badges.
 */
export function resolveNavigationOperatorMeta({
  user,
  profile,
  isAdmin,
  requests,
}: ResolveNavigationMetaParams): NavigationOperatorMeta {
  const rawEmail = profile?.email || user?.email || '';
  const validProfileName =
    profile?.full_name && !isDirtyOrPlaceholderName(profile.full_name, rawEmail)
      ? profile.full_name
      : '';
  const metaNameCandidate =
    (user?.user_metadata?.full_name as string) ||
    (user?.user_metadata?.name as string) ||
    '';

  const extractedIdentity = extractIdentityFromEmail(rawEmail, {
    ...(user?.user_metadata || {}),
    full_name: validProfileName || metaNameCandidate || profile?.full_name,
    enrollment_no:
      profile?.roll_number ||
      profile?.enrollment_no ||
      (user?.user_metadata?.enrollment_no as string) ||
      (user?.user_metadata?.roll_number as string),
  });

  const displayName =
    validProfileName
      ? toCleanDisplayName(validProfileName)
      : extractedIdentity.fullName || 'Member';

  const enrollmentNo = (
    profile?.roll_number ||
    profile?.enrollment_no ||
    extractedIdentity.enrollmentNo ||
    ''
  ).trim();

  const avatarSrc =
    (profile?.avatar_url && !profile.avatar_url.startsWith('status:') ? profile.avatar_url : '') ||
    (typeof user?.user_metadata?.avatar_url === 'string' ? user.user_metadata.avatar_url : '') ||
    (typeof user?.user_metadata?.picture === 'string' ? user.user_metadata.picture : '') ||
    '';

  const normalizedUserEmail = (user?.email || '').toLowerCase();
  const pendingCount = isAdmin
    ? requests.filter((r) => r.status === 'pending' || isReturnRequested(r)).length
    : requests.filter(
        (r) =>
          (r.user_id === user?.id || r.user_email?.toLowerCase() === normalizedUserEmail) &&
          (r.status === 'pending' || isReturnRequested(r))
      ).length;

  return {
    rawEmail,
    displayName,
    enrollmentNo,
    roleName: isAdmin ? 'ADMIN' : 'MEMBER',
    avatarSrc,
    initial: displayName ? displayName.charAt(0).toUpperCase() : 'U',
    pendingCount,
  };
}

