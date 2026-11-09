/**
 * Multi deployment URL and OAuth callback resolution utilities.
 *
 * Ensures forks and custom deployments (such as https://inventory.cicr.in and
 * https://cicr-inventory.vercel.app) authenticate via OAuth back to their own
 * origin or environment configured URL while remaining connected to the same
 * shared Supabase and Neon backend infrastructure.
 */

export const DEFAULT_APP_URL = 'https://cicr-inventory.vercel.app';

const LEGAL_SUBDOMAIN_PREFIX_RE = /^(privacy|tos|terms|toc)\./i;

export interface AppUrlEnvConfig {
  appUrl?: string;
  authRedirectUrl?: string;
  allowedOrigins?: string;
}

export interface ResolveUrlOptions {
  origin?: string;
  env?: AppUrlEnvConfig;
}

function cleanEnvString(raw?: string): string {
  return (raw || '').trim().replace(/^['"]|['"]$/g, '');
}

/**
 * Checks whether a hostname resolves to a local loopback development machine.
 *
 * @param hostname Hostname extracted from a parsed URL without port suffix.
 * @returns True when running on localhost or loopback interfaces.
 */
export function isLocalHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  return (
    lower === 'localhost' ||
    lower === '127.0.0.1' ||
    lower === '[::1]' ||
    lower === '::1' ||
    lower.endsWith('.localhost')
  );
}

/**
 * Normalizes a raw host or URL string into a canonical HTTP/HTTPS URL.
 *
 * Prepends https:// (or http:// for localhost targets) when the protocol
 * scheme is omitted and strips trailing slashes for exact Supabase matching.
 *
 * @param raw Raw environment string or origin candidate.
 * @param options Optional settings controlling whether non root pathnames stay intact.
 * @returns Normalized HTTP/HTTPS URL string, or empty string when invalid.
 */
export function normalizeUrl(raw?: string, options?: { preservePath?: boolean }): string {
  const cleaned = cleanEnvString(raw);
  if (!cleaned) return '';

  try {
    const candidate = /^https?:\/\//i.test(cleaned)
      ? cleaned
      : /^(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i.test(cleaned)
      ? `http://${cleaned}`
      : `https://${cleaned}`;

    const parsed = new URL(candidate);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return '';
    }

    if (!options?.preservePath || parsed.pathname === '/' || !parsed.pathname) {
      return parsed.origin;
    }

    const cleanPath = parsed.pathname.replace(/\/+$/, '');
    return `${parsed.origin}${cleanPath}${parsed.search}`;
  } catch {
    return '';
  }
}

/**
 * Strips dedicated legal compliance subdomain prefixes (privacy., tos., terms., toc.)
 * so OAuth flows initiated from legal pages return to the primary application origin.
 *
 * @param rawUrl Candidate application origin or full URL.
 * @returns Normalized origin with any leading legal subdomain removed.
 */
export function stripLegalSubdomainPrefix(rawUrl: string): string {
  const normalized = normalizeUrl(rawUrl);
  if (!normalized) return '';

  try {
    const parsed = new URL(normalized);
    if (!LEGAL_SUBDOMAIN_PREFIX_RE.test(parsed.hostname)) {
      return parsed.origin;
    }

    const apexHost = parsed.hostname.replace(LEGAL_SUBDOMAIN_PREFIX_RE, '');
    const portSuffix = parsed.port ? `:${parsed.port}` : '';
    return `${parsed.protocol}//${apexHost}${portSuffix}`;
  } catch {
    return normalized;
  }
}

/**
 * Parses a comma or whitespace separated list of allowed deployment origins.
 *
 * @param raw Comma separated URL list from ALLOWED_ORIGINS.
 * @returns Deduplicated array of canonical normalized origins.
 */
export function parseAllowedOrigins(raw?: string): string[] {
  const cleaned = cleanEnvString(raw);
  if (!cleaned) return [];

  const seen = new Set<string>();
  const results: string[] = [];

  for (const token of cleaned.split(/[,\s]+/)) {
    const origin = stripLegalSubdomainPrefix(token);
    if (origin && !seen.has(origin)) {
      seen.add(origin);
      results.push(origin);
    }
  }

  return results;
}

function readRuntimeEnv(overrideEnv?: AppUrlEnvConfig): Required<AppUrlEnvConfig> {
  if (overrideEnv) {
    return {
      appUrl: cleanEnvString(overrideEnv.appUrl),
      authRedirectUrl: cleanEnvString(overrideEnv.authRedirectUrl),
      allowedOrigins: cleanEnvString(overrideEnv.allowedOrigins),
    };
  }

  const definedAppUrl =
    typeof __CICR_ENV_APP_URL__ !== 'undefined' ? __CICR_ENV_APP_URL__ : '';
  const definedAuthRedirect =
    typeof __CICR_ENV_AUTH_REDIRECT_URL__ !== 'undefined' ? __CICR_ENV_AUTH_REDIRECT_URL__ : '';
  const definedAllowedOrigins =
    typeof __CICR_ENV_ALLOWED_ORIGINS__ !== 'undefined' ? __CICR_ENV_ALLOWED_ORIGINS__ : '';

  const nodeEnv = typeof process !== 'undefined' && process.env ? process.env : undefined;

  return {
    appUrl: cleanEnvString(definedAppUrl || nodeEnv?.APP_URL),
    authRedirectUrl: cleanEnvString(definedAuthRedirect || nodeEnv?.AUTH_REDIRECT_URL),
    allowedOrigins: cleanEnvString(definedAllowedOrigins || nodeEnv?.ALLOWED_ORIGINS),
  };
}

function readBrowserOrigin(overrideOrigin?: string): string {
  if (typeof overrideOrigin === 'string') {
    return stripLegalSubdomainPrefix(overrideOrigin);
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    return stripLegalSubdomainPrefix(window.location.origin);
  }
  return '';
}

function getHostnameSafe(urlStr: string): string {
  if (!urlStr) return '';
  try {
    return new URL(urlStr).hostname;
  } catch {
    return '';
  }
}

/**
 * Resolves the exact OAuth and email verification redirect URL for Supabase Auth.
 *
 * Resolution precedence:
 * 1. Local loopback origins (localhost / 127.0.0.1) stay on their local port
 *    unless AUTH_REDIRECT_URL itself points to a local callback target.
 * 2. Explicit AUTH_REDIRECT_URL overrides all non local logins.
 * 3. When ALLOWED_ORIGINS is configured, matching browser origins remain on their own
 *    domain while unrecognized hosts route to APP_URL.
 * 4. By default, active browser origins stay on their own deployment domain (for example
 *    https://inventory.cicr.in stays on https://inventory.cicr.in) so forks never
 *    bounce back to https://cicr-inventory.vercel.app even if APP_URL is unset.
 * 5. Falls back to configured APP_URL, then DEFAULT_APP_URL.
 *
 * @param options Optional browser origin and env overrides for deterministic testing.
 * @returns Fully qualified callback URL to pass as Supabase redirectTo / emailRedirectTo.
 */
export function resolveOAuthRedirectUrl(options?: ResolveUrlOptions): string {
  const env = readRuntimeEnv(options?.env);
  const currentOrigin = readBrowserOrigin(
    options && 'origin' in options ? options.origin : undefined
  );
  const currentHost = getHostnameSafe(currentOrigin);
  const isLocal = Boolean(currentHost && isLocalHostname(currentHost));

  const configuredRedirect = normalizeUrl(env.authRedirectUrl, { preservePath: true });
  const redirectHost = getHostnameSafe(configuredRedirect);
  const redirectIsLocal = Boolean(redirectHost && isLocalHostname(redirectHost));

  if (isLocal) {
    return redirectIsLocal ? configuredRedirect : currentOrigin;
  }

  if (configuredRedirect) {
    return configuredRedirect;
  }

  const configuredAppUrl = stripLegalSubdomainPrefix(env.appUrl);
  const allowedList = parseAllowedOrigins(env.allowedOrigins);

  if (allowedList.length > 0) {
    const allowedSet = new Set(allowedList);
    if (configuredAppUrl) {
      allowedSet.add(configuredAppUrl);
    }
    if (currentOrigin && allowedSet.has(currentOrigin)) {
      return currentOrigin;
    }
    return configuredAppUrl || allowedList[0] || DEFAULT_APP_URL;
  }

  if (currentOrigin) {
    return currentOrigin;
  }

  return configuredAppUrl || DEFAULT_APP_URL;
}

/**
 * Resolves the canonical public application URL displayed in UI views such as Legal notices.
 *
 * Prefers the active non local browser origin (so deployments like inventory.cicr.in
 * display their own domain dynamically), falling back to configured APP_URL
 * and finally DEFAULT_APP_URL during local development or non browser rendering.
 *
 * @param options Optional browser origin and env overrides for deterministic testing.
 * @returns Normalized canonical HTTPS application origin without trailing slash.
 */
export function getPublicAppUrl(options?: ResolveUrlOptions): string {
  const env = readRuntimeEnv(options?.env);
  const currentOrigin = readBrowserOrigin(
    options && 'origin' in options ? options.origin : undefined
  );
  const currentHost = getHostnameSafe(currentOrigin);
  const isLocal = Boolean(currentHost && isLocalHostname(currentHost));
  const configuredAppUrl = stripLegalSubdomainPrefix(env.appUrl);
  const allowedList = parseAllowedOrigins(env.allowedOrigins);

  if (currentOrigin && !isLocal) {
    if (allowedList.length > 0) {
      const allowedSet = new Set(allowedList);
      if (configuredAppUrl) {
        allowedSet.add(configuredAppUrl);
      }
      if (!allowedSet.has(currentOrigin)) {
        return configuredAppUrl || allowedList[0] || DEFAULT_APP_URL;
      }
    }
    return currentOrigin;
  }

  return configuredAppUrl || allowedList[0] || DEFAULT_APP_URL;
}

