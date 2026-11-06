import type { SameSite, StoredCookie } from './types';

export interface CookieLike {
  name: string;
  value: string;
  domain: string;
  path: string;
  secure: boolean;
  httpOnly: boolean;
  hostOnly?: boolean;
  session?: boolean;
  sameSite?: string;
  expirationDate?: number;
  storeId?: string;
  partitionKey?: unknown;
  firstPartyDomain?: string;
}

function normalizeSameSite(value: string | undefined): SameSite {
  if (value === 'no_restriction' || value === 'lax' || value === 'strict') {
    return value;
  }
  return 'unspecified';
}

function stableStringify(value: unknown): string {
  if (value === undefined) return '';
  if (value === null || typeof value !== 'object') {
    try {
      return JSON.stringify(value) ?? String(value);
    } catch {
      return String(value);
    }
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }

  const record = value as Record<string, unknown>;
  const entries = Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`);
  return `{${entries.join(',')}}`;
}

/**
 * Returns a bare lowercase hostname, or null when the value is not a valid
 * cookie domain. The leading dot of a domain cookie is accepted but removed.
 */
export function normalizeCookieDomain(raw: string): string | null {
  const lower = raw.toLowerCase();
  if (!lower || lower !== lower.trim()) return null;

  const domain = lower.startsWith('.') ? lower.slice(1) : lower;
  if (!domain || domain.startsWith('.') || domain.endsWith('.') || domain.includes('..')) {
    return null;
  }

  try {
    const url = new URL(`https://${domain}/`);
    if (
      url.username !== '' ||
      url.password !== '' ||
      url.port !== '' ||
      url.pathname !== '/' ||
      url.search !== '' ||
      url.hash !== '' ||
      url.hostname !== domain
    ) {
      return null;
    }
    return domain;
  } catch {
    return null;
  }
}

export function isCookieDomainInScope(cookieDomain: string, siteHost: string): boolean {
  const domain = normalizeCookieDomain(cookieDomain);
  const host = siteHost.toLowerCase();
  if (!domain || !host) return false;
  if (domain === host) return true;

  // Parent/subdomain matching is only meaningful for DNS names, not IPs.
  const isIpHost = host.startsWith('[') || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host);
  if (isIpHost) return false;

  return domain.endsWith(`.${host}`) || host.endsWith(`.${domain}`);
}

function partitionTopLevelHost(partitionKey: unknown): string | null {
  if (!partitionKey || typeof partitionKey !== 'object' || Array.isArray(partitionKey)) {
    return null;
  }

  const topLevelSite = (partitionKey as Record<string, unknown>).topLevelSite;
  if (typeof topLevelSite !== 'string') return null;

  try {
    const url = new URL(topLevelSite);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return normalizeCookieDomain(url.hostname);
  } catch {
    return null;
  }
}

/**
 * A session may contain cookies for the site itself, its parent domain, or
 * its subdomains. Anything else is rejected so an imported file cannot plant
 * cookies on unrelated sites.
 */
export function isCookieInSessionScope(cookie: StoredCookie, siteHost: string): boolean {
  if (!isCookieDomainInScope(cookie.domain, siteHost)) return false;

  if (cookie.firstPartyDomain) {
    if (!isCookieDomainInScope(cookie.firstPartyDomain, siteHost)) return false;
  }

  if (cookie.partitionKey !== undefined) {
    const topLevelHost = partitionTopLevelHost(cookie.partitionKey);
    if (!topLevelHost || !isCookieDomainInScope(topLevelHost, siteHost)) return false;
  }

  return true;
}

export function toStoredCookie(cookie: CookieLike): StoredCookie {
  const stored: StoredCookie = {
    name: cookie.name,
    value: cookie.value,
    domain: cookie.domain,
    path: cookie.path.startsWith('/') ? cookie.path : `/${cookie.path}`,
    secure: Boolean(cookie.secure),
    httpOnly: Boolean(cookie.httpOnly),
    hostOnly: cookie.hostOnly ?? !cookie.domain.startsWith('.'),
    session: cookie.session ?? cookie.expirationDate === undefined,
    sameSite: normalizeSameSite(cookie.sameSite),
  };

  if (typeof cookie.expirationDate === 'number' && Number.isFinite(cookie.expirationDate)) {
    stored.expirationDate = cookie.expirationDate;
  }
  if (cookie.storeId) {
    stored.storeId = cookie.storeId;
  }
  if (cookie.partitionKey !== undefined && cookie.partitionKey !== null) {
    stored.partitionKey = cookie.partitionKey;
  }
  if (cookie.firstPartyDomain) {
    stored.firstPartyDomain = cookie.firstPartyDomain;
  }

  return stored;
}

export function cookieKey(cookie: StoredCookie): string {
  return [
    cookie.name,
    cookie.domain,
    cookie.path,
    cookie.storeId ?? '',
    stableStringify(cookie.partitionKey),
    cookie.firstPartyDomain ?? '',
  ].join('|');
}

export function dedupeCookies(cookies: StoredCookie[]): StoredCookie[] {
  const unique = new Map<string, StoredCookie>();
  for (const cookie of cookies) {
    const key = cookieKey(cookie);
    if (!unique.has(key)) unique.set(key, cookie);
  }
  return [...unique.values()];
}

export function buildCookieUrl(cookie: StoredCookie): string {
  const domain = normalizeCookieDomain(cookie.domain);
  if (!domain) {
    throw new Error('Cookie has an invalid domain.');
  }

  const scheme = cookie.secure ? 'https' : 'http';
  const path = cookie.path.startsWith('/') ? cookie.path : `/${cookie.path}`;
  return `${scheme}://${domain}${path}`;
}

export function isExpiredCookie(cookie: StoredCookie, nowMs = Date.now()): boolean {
  if (cookie.session || cookie.expirationDate === undefined) return false;
  return cookie.expirationDate * 1000 <= nowMs;
}

export function hasCookiePrefixThatDisallowsDomain(cookie: StoredCookie): boolean {
  return cookie.name.startsWith('__Host-');
}
