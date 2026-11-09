/**
 * CICR Robotics Vault & Inventory : Expected Return Date Validation Utilities
 *
 * Isolates local calendar date formatting, parsing, and past date validation so
 * hardware borrow forms and context mutations never suffer UTC midnight rollover
 * bugs or accept historical return dates.
 */

export interface ReturnDateValidationResult {
  valid: boolean;
  normalizedDate?: string;
  minDate: string;
  error?: string;
}

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Formats a JavaScript Date instance into a canonical `YYYY-MM-DD` string
 * using the local calendar year, month, and day rather than UTC.
 *
 * Local calendar fields are mandatory because late night IST submissions
 * (00:00 to 05:29 IST) fall on the previous UTC day when formatted with
 * `toISOString()`.
 *
 * @param date Target Date object to format. Defaults to current system time.
 * @returns Canonical `YYYY-MM-DD` string, or empty string if date is invalid.
 */
export function formatLocalIsoDate(date: Date = new Date()): string {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return '';
  }
  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Computes today's local calendar date in `YYYY-MM-DD` format for `<input type="date">`
 * lower bounds and same day loan eligibility checks.
 *
 * @param referenceDate Optional clock override for deterministic unit tests.
 * @returns Local today date string (`YYYY-MM-DD`).
 */
export function getTodayIsoDate(referenceDate: Date = new Date()): string {
  const safeRef =
    referenceDate instanceof Date && !Number.isNaN(referenceDate.getTime())
      ? referenceDate
      : new Date();
  return formatLocalIsoDate(safeRef);
}

/**
 * Computes a default expected return date offset forward from today's local
 * calendar date. Negative offsets are clamped to `0` so defaults never start
 * in the past.
 *
 * @param daysAhead Number of days forward from today (defaults to 7).
 * @param referenceDate Optional clock override for deterministic unit tests.
 * @returns Future local date string (`YYYY-MM-DD`).
 */
export function getDefaultReturnDateIso(
  daysAhead = 7,
  referenceDate: Date = new Date()
): string {
  const safeRef =
    referenceDate instanceof Date && !Number.isNaN(referenceDate.getTime())
      ? referenceDate
      : new Date();
  const safeDays = Number.isFinite(daysAhead) ? Math.max(0, Math.floor(daysAhead)) : 7;
  const target = new Date(
    safeRef.getFullYear(),
    safeRef.getMonth(),
    safeRef.getDate() + safeDays
  );
  return formatLocalIsoDate(target);
}

/**
 * Strictly parses a `YYYY-MM-DD` string and verifies that it represents an
 * authentic Gregorian calendar date without rollover (rejecting dates such
 * as February 30 or non leap year February 29).
 *
 * @param dateStr Raw expected return date string from user input or payload.
 * @returns Parsed `{ year, month, day }` components, or `null` when invalid.
 */
export function parseIsoCalendarDate(
  dateStr: string
): { year: number; month: number; day: number } | null {
  if (typeof dateStr !== 'string') return null;
  const trimmed = dateStr.trim();
  const match = ISO_DATE_PATTERN.exec(trimmed);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isInteger(year) || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  // Construct via setFullYear so years outside 1900..2099 also validate accurately.
  const candidate = new Date(2000, month - 1, day);
  candidate.setFullYear(year);
  if (
    candidate.getFullYear() !== year ||
    candidate.getMonth() !== month - 1 ||
    candidate.getDate() !== day
  ) {
    return null;
  }

  return { year, month, day };
}

/**
 * Validates that an expected return date is present, syntactically and
 * calendrically valid, and strictly greater than or equal to today's local date.
 * Same day returns (`date === minDate`) are permitted for single session lab use,
 * while any earlier date is rejected.
 *
 * @param dateStr Raw expected return date string supplied by a borrower.
 * @param referenceDate Optional clock override for deterministic unit tests.
 * @returns Validation status, canonical `normalizedDate`, `minDate`, and error detail.
 */
export function validateExpectedReturnDate(
  dateStr: string,
  referenceDate: Date = new Date()
): ReturnDateValidationResult {
  const minDate = getTodayIsoDate(referenceDate);
  const normalized = typeof dateStr === 'string' ? dateStr.trim() : '';

  if (!normalized) {
    return {
      valid: false,
      minDate,
      error: 'Expected return date is required.',
    };
  }

  if (!parseIsoCalendarDate(normalized)) {
    return {
      valid: false,
      minDate,
      error: 'Please enter a valid expected return date.',
    };
  }

  if (normalized < minDate) {
    return {
      valid: false,
      minDate,
      error: 'Expected return date cannot be in the past. Please choose today or a future date.',
    };
  }

  return {
    valid: true,
    normalizedDate: normalized,
    minDate,
  };
}

