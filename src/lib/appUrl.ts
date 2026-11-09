/**
 * Canonical CICR domain enforcement and OAuth callback URL resolution utilities.
 *
 * Converges all production and Vercel deployment traffic onto https://inventory.cicr.in,
 * normalizes www and legal subdomain prefixes for Supabase Redirect URL matching, and
 * preserves local loopback origins for local development.
 */

export const DEFAULT_APP_URL = 'https://inventory.cicr.in';
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

export interface CanonicalRedirectOptions {
  href?: string;
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
 * Checks whether a hostname belongs to Vercel default hosting domains (*.vercel.app).
 *
 * @param hostname Hostname extracted from a URL without scheme or port.
 * @returns True when hosted under any vercel.app domain or subdomain.
 */
export function isVercelHostname(hostname: string): boolean {
  return /(^|\.)vercel\.app$/i.test(hostname.trim());
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
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
    if (!options?.preservePath || parsed.pathname === '/' || !parsed.pathname) return parsed.origin;
    return `${parsed.origin}${parsed.pathname.replace(/\/+$/, '')}${parsed.search}`;
  } catch {
    return '';
  }
}

/**
 * Strips dedicated legal compliance subdomain prefixes (privacy., tos., terms., toc.)
 * and optional www. prefixes so OAuth callbacks match the primary CICR origin registered
 * in Supabase Authentication Redirect URLs.
 *
 * @param rawUrl Candidate application origin or full URL.
 * @param options Optional preservePath flag when full redirect paths must remain intact.
 * @returns Normalized origin with leading legal and www prefixes removed.
 */
export function stripLegalSubdomainPrefix(
  rawUrl: string,
  options?: { preservePath?: boolean }
): string {
  const normalized = normalizeUrl(rawUrl, options);
  if (!normalized) return '';
  try {
    const parsed = new URL(normalized);
    const bareHost = parsed.hostname.replace(LEGAL_SUBDOMAIN_PREFIX_RE, '').replace(/^www\./i, '');
    const suffix =
      options?.preservePath && parsed.pathname && parsed.pathname !== '/'
        ? `${parsed.pathname.replace(/\/+$/, '')}${parsed.search}`
        : '';
    if (bareHost === parsed.hostname) return `${parsed.origin}${suffix}`;
    return `${parsed.protocol}//${bareHost}${parsed.port ? `:${parsed.port}` : ''}${suffix}`;
  } catch {
    return normalized;
  }
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
 * Parses a comma or whitespace separated list of allowed deployment origins,
 * excluding legacy vercel.app origins so traffic always converges on CICR domains.
 *
 * @param raw Comma separated URL list from ALLOWED_ORIGINS.
 * @returns Deduplicated array of canonical normalized non Vercel origins.
 */
export function parseAllowedOrigins(raw?: string): string[] {
  const cleaned = cleanEnvString(raw);
  if (!cleaned) return [];
  const seen = new Set<string>();
  const results: string[] = [];
  for (const token of cleaned.split(/[,\s]+/)) {
    const origin = stripLegalSubdomainPrefix(token);
    if (origin && !isVercelHostname(getHostnameSafe(origin)) && !seen.has(origin)) {
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
  const nodeEnv = typeof process !== 'undefined' && process.env ? process.env : undefined;
  return {
    appUrl: cleanEnvString((typeof __CICR_ENV_APP_URL__ !== 'undefined' ? __CICR_ENV_APP_URL__ : '') || nodeEnv?.APP_URL),
    authRedirectUrl: cleanEnvString((typeof __CICR_ENV_AUTH_REDIRECT_URL__ !== 'undefined' ? __CICR_ENV_AUTH_REDIRECT_URL__ : '') || nodeEnv?.AUTH_REDIRECT_URL),
    allowedOrigins: cleanEnvString((typeof __CICR_ENV_ALLOWED_ORIGINS__ !== 'undefined' ? __CICR_ENV_ALLOWED_ORIGINS__ : '') || nodeEnv?.ALLOWED_ORIGINS),
  };
}

function readBrowserOrigin(overrideOrigin?: string): string {
  if (typeof overrideOrigin === 'string') return stripLegalSubdomainPrefix(overrideOrigin);
  if (typeof window !== 'undefined' && window.location?.origin) return stripLegalSubdomainPrefix(window.location.origin);
  return '';
}

function resolveCanonicalBaseOrigin(env: Required<AppUrlEnvConfig>): string {
  const candidates = [
    stripLegalSubdomainPrefix(env.appUrl),
    stripLegalSubdomainPrefix(env.authRedirectUrl),
    ...parseAllowedOrigins(env.allowedOrigins),
  ];
  for (const candidate of candidates) {
    const host = getHostnameSafe(candidate);
    if (candidate && host && !isLocalHostname(host) && !isVercelHostname(host)) return candidate;
  }
  return DEFAULT_APP_URL;
}

/**
 * Computes whether a browser URL must redirect onto the canonical CICR origin
 * (for example routing https://cicr-inventory.vercel.app or any preview .vercel.app
 * host to https://inventory.cicr.in) while keeping localhost and legal/www subdomains
 * of inventory.cicr.in intact.
 *
 * @param options Optional full href and environment overrides for deterministic testing.
 * @returns Full target URL string when redirect is required, or null when already canonical.
 */
export function getCanonicalAppRedirectTarget(options?: CanonicalRedirectOptions): string | null {
  const rawHref =
    typeof options?.href === 'string'
      ? options.href
      : typeof window !== 'undefined' && window.location?.href
      ? window.location.href
      : '';
  if (!rawHref) return null;
  let parsed: URL;
  try {
    parsed = new URL(rawHref);
  } catch {
    return null;
  }
  const currentHost = parsed.hostname.toLowerCase();
  if (!currentHost || isLocalHostname(currentHost)) return null;

  const canonicalOrigin = resolveCanonicalBaseOrigin(readRuntimeEnv(options?.env));
  const targetHostBare = getHostnameSafe(canonicalOrigin).toLowerCase().replace(/^www\./i, '');
  const currentHostBare = currentHost.replace(LEGAL_SUBDOMAIN_PREFIX_RE, '').replace(/^www\./i, '');
  if (!isVercelHostname(currentHost) && currentHostBare === targetHostBare) return null;

  const qsAndHash = `${parsed.search || ''}${parsed.hash || ''}`;
  const path = /^privacy\./i.test(currentHost)
    ? `/privacy${qsAndHash}`
    : /^(tos|terms|toc)\./i.test(currentHost)
    ? `/terms${qsAndHash}`
    : `${parsed.pathname || '/'}${qsAndHash}`;
  return `${canonicalOrigin}${path}`;
}

/**
 * Immediately redirects the browser window to the canonical CICR web origin when
 * loaded from a legacy Vercel hosting URL. Safe no-op during local development and SSR.
 *
 * @returns True when a browser redirect was initiated.
 */
export function enforceCanonicalAppOrigin(): boolean {
  if (typeof window === 'undefined' || !window.location?.href) return false;
  const target = getCanonicalAppRedirectTarget({ href: window.location.href });
  if (!target || target === window.location.href) return false;
  window.location.replace(target);
  return true;
}

/**
 * Resolves the exact OAuth and email verification redirect URL for Supabase Auth.
 *
 * Keeps localhost development on localhost while ensuring every production login
 * resolves to https://inventory.cicr.in (never returning *.vercel.app or www. hosts).
 *
 * @param options Optional browser origin and env overrides for deterministic testing.
 * @returns Fully qualified callback URL to pass as Supabase redirectTo / emailRedirectTo.
 */
export function resolveOAuthRedirectUrl(options?: ResolveUrlOptions): string {
  const env = readRuntimeEnv(options?.env);
  const currentOrigin = readBrowserOrigin(options && 'origin' in options ? options.origin : undefined);
  const currentHost = getHostnameSafe(currentOrigin);
  const configuredRedirect = stripLegalSubdomainPrefix(normalizeUrl(env.authRedirectUrl, { preservePath: true }), { preservePath: true });
  const redirectHost = getHostnameSafe(configuredRedirect);

  if (currentHost && isLocalHostname(currentHost)) {
    return redirectHost && isLocalHostname(redirectHost) ? configuredRedirect : currentOrigin;
  }
  const canonicalOrigin = resolveCanonicalBaseOrigin(env);
  if (configuredRedirect && redirectHost && !isVercelHostname(redirectHost)) return configuredRedirect;
  if (currentOrigin && currentHost && !isVercelHostname(currentHost)) return currentOrigin;
  return canonicalOrigin;
}

/**
 * Resolves the canonical public application URL displayed in UI views such as Legal notices.
 *
 * Normalizes legacy .vercel.app and www. prefixes onto https://inventory.cicr.in.
 *
 * @param options Optional browser origin and env overrides for deterministic testing.
 * @returns Normalized canonical HTTPS application origin without trailing slash.
 */
export function getPublicAppUrl(options?: ResolveUrlOptions): string {
  const env = readRuntimeEnv(options?.env);
  const currentOrigin = readBrowserOrigin(options && 'origin' in options ? options.origin : undefined);
  const currentHost = getHostnameSafe(currentOrigin);
  const canonicalOrigin = resolveCanonicalBaseOrigin(env);

  if (currentOrigin && currentHost && !isLocalHostname(currentHost) && !isVercelHostname(currentHost)) {
    const allowedList = parseAllowedOrigins(env.allowedOrigins);
    if (allowedList.length > 0 && !allowedList.includes(currentOrigin) && currentOrigin !== canonicalOrigin) {
      return canonicalOrigin;
    }
    return currentOrigin;
  }
  return canonicalOrigin;
}
