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

export interface IdentityExtractionResult {
  fullName: string;
  enrollmentNo: string;
  emailPrefix: string;
  nameFromEmail: string;
  nameFromMeta: string;
  enrollmentFromEmail: string;
}

/**
 * Normalizes capitalization of a person's display name (converts ALL-CAPS
 * or all-lowercase tokens into Title Case while preserving mixed casing).
 */
export function toCleanDisplayName(raw?: string | null): string {
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

/**
 * Strips glued enrollment markers (such as "J992401030123", "'992501030043",
 * or "992501030399") and wrapper punctuation from a raw display name string.
 */
export function stripRollTokensFromName(raw?: string | null): string {
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

  if (!cleaned) return '';
  if (!/[a-zA-Z]/.test(cleaned)) return '';
  if (/^[jJ]?\d{4,}$/.test(cleaned)) return '';
  if (GENERIC_PLACEHOLDER_NAMES.has(cleaned.toLowerCase())) return '';
  return toCleanDisplayName(cleaned);
}

/**
 * Extracts a numeric student enrollment / roll number from raw string input
 * when a 6+ digit ID (or standalone institutional J+digits / quote-prefixed token) is present.
 */
export function extractEnrollmentDigits(raw?: string | null): string {
  if (!raw || typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';

  const jPrefixed = trimmed.match(/(?:^|[\s._\-+('"`])[jJ]?(\d{6,})(?=$|[\s._\-+),|/'"`])/);
  if (jPrefixed?.[1]) return jPrefixed[1];

  const genericLongDigits = trimmed.match(/\d{6,}/);
  if (genericLongDigits?.[0]) return genericLongDigits[0];

  return '';
}

/**
 * Parses an alphabetic human name directly out of the email local part
 * (e.g., "vardaan.saxena.992501030399@mail.jiit.ac.in" -> "Vardaan Saxena").
 */
export function extractNameFromEmailLocal(emailLocal: string): string {
  if (!emailLocal) return '';

  const withoutRoll = emailLocal
    // Strip leading/separator-delimited institutional "J" glued to enrollment digits (e.g. j992401030123)
    .replace(/(^|[._\-+])[jJ]\d{6,}(?=$|[._\-+])/g, ' ')
    // Strip 6+ digit enrollment sequences anywhere else while keeping attached name (e.g. palash992401030123 -> palash)
    .replace(/\d{6,}/g, ' ')
    // Convert email separators into spaces
    .replace(/[._\-+]+/g, ' ')
    .trim();

  if (!withoutRoll) return '';

  const words = withoutRoll
    .split(/\s+/)
    .map((token) => token.replace(/^\d+|\d+$/g, '').trim())
    .filter((token) => token.length > 0 && /[a-zA-Z]/.test(token));

  if (words.length === 0) return '';
  // Guard against lone single-letter noise unless paired with another name part
  if (words.length === 1 && words[0].length < 2) return '';

  const joined = words.join(' ');
  if (GENERIC_PLACEHOLDER_NAMES.has(joined.toLowerCase())) return '';
  return toCleanDisplayName(joined);
}

export function extractNameFromMetadata(
  metadata?: Record<string, any> | null,
  emailLocal?: string
): string {
  if (!metadata || typeof metadata !== 'object') return '';

  const combinedGivenFamily = [
    typeof metadata.given_name === 'string'
      ? metadata.given_name
      : typeof metadata.first_name === 'string'
      ? metadata.first_name
      : '',
    typeof metadata.family_name === 'string'
      ? metadata.family_name
      : typeof metadata.last_name === 'string'
      ? metadata.last_name
      : '',
  ]
    .filter(Boolean)
    .join(' ');

  const candidates = [
    metadata.full_name,
    metadata.name,
    metadata.display_name,
    combinedGivenFamily,
  ];

  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue;
    const cleaned = stripRollTokensFromName(candidate);
    if (!cleaned) continue;
    if (emailLocal && /^\d+$/.test(emailLocal) && cleaned === emailLocal) continue;
    return cleaned;
  }

  return '';
}

/**
 * Extracts clean Full Name and Enrollment Number directly from an email address
 * and optional OAuth/profile metadata.
 */
export function extractIdentityFromEmail(
  email?: string | null,
  metadata?: Record<string, any> | null
): IdentityExtractionResult {
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

  const explicitEnrollmentCandidates = [
    metadata?.enrollment_no,
    metadata?.enrollmentNo,
    metadata?.roll_number,
    metadata?.rollNumber,
  ];

  let explicitMetaEnrollment = '';
  for (const cand of explicitEnrollmentCandidates) {
    if (typeof cand !== 'string') continue;
    const trimmed = cand.trim();
    if (!trimmed || GENERIC_PLACEHOLDER_NAMES.has(trimmed.toLowerCase())) continue;
    // Ignore tiny 1-4 digit numbers (e.g. "096" from gmail usernames) unless explicitly numeric-only roll >= 5 digits
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

  const enrollmentNo =
    enrollmentFromEmail ||
    enrollmentFromMetaName ||
    explicitMetaEnrollment ||
    '';

  const nameFromEmail = extractNameFromEmailLocal(emailPrefix);
  const nameFromMeta = extractNameFromMetadata(metadata, emailPrefix);

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

  return {
    fullName,
    enrollmentNo,
    emailPrefix,
    nameFromEmail,
    nameFromMeta,
    enrollmentFromEmail,
  };
}

/**
 * Returns true if a stored display name is empty, a placeholder ("Member"),
 * raw email prefix / enrollment digits, or still contains glued roll tokens
 * (such as "DHRUVI GUPTA J992401030123" or "KSHITIKA BARNWAL '992501030043").
 */
export function isDirtyOrPlaceholderName(name?: string | null, email?: string | null): boolean {
  if (!name || typeof name !== 'string') return true;
  const trimmed = name.trim();
  if (!trimmed) return true;

  const lower = trimmed.toLowerCase();
  if (GENERIC_PLACEHOLDER_NAMES.has(lower)) return true;
  if (!/[a-zA-Z]/.test(trimmed)) return true;
  if (/^[jJ'"]?\d{4,}$/.test(trimmed)) return true;
  if (/\d{6,}/.test(trimmed)) return true;
  if (/(^|[\s([._\-+'"`])(?:[jJ]|[jJ]?['"`])?\d{6,}(?=$|[\s)\]._\-+,|/'"`])/.test(trimmed)) return true;
  if (/['"`]$/.test(trimmed)) return true;

  const emailLocal = (email || '').toLowerCase().trim().split('@')[0];
  if (emailLocal && lower === emailLocal && /[._\-\d]/.test(emailLocal)) {
    return true;
  }

  return false;
}

/**
 * Hydrates a profile or member record in place with extracted Full Name
 * and Enrollment Number when missing, placeholder, numeric, or glued with roll IDs.
 */
export function hydrateMemberIdentity<
  T extends {
    email?: string;
    full_name?: string;
    roll_number?: string;
    enrollment_no?: string;
  }
>(record: T, metadata?: Record<string, any> | null): T {
  const existingRoll = (record.roll_number || record.enrollment_no || '').trim();
  const recordHasCleanName = !isDirtyOrPlaceholderName(record.full_name, record.email);
  const metaNameFallback =
    (typeof metadata?.full_name === 'string' && metadata.full_name) ||
    (typeof metadata?.name === 'string' && metadata.name) ||
    '';

  const extracted = extractIdentityFromEmail(record.email, {
    ...(metadata || {}),
    full_name: recordHasCleanName ? record.full_name : metaNameFallback || record.full_name,
    enrollment_no: existingRoll || metadata?.enrollment_no || metadata?.roll_number,
  });

  const resolvedName = recordHasCleanName
    ? toCleanDisplayName(record.full_name) || extracted.fullName
    : extracted.fullName;

  const safeName = isDirtyOrPlaceholderName(resolvedName, record.email) ? 'Member' : resolvedName;
  const resolvedRoll = extracted.enrollmentNo || existingRoll;

  return {
    ...record,
    full_name: safeName,
    roll_number: resolvedRoll,
    enrollment_no: resolvedRoll,
  };
}

