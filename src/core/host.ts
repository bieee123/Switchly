const SUPPORTED_PROTOCOLS = new Set(['http:', 'https:']);
const RESERVED_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

function isBlockedPage(url: URL): boolean {
  const host = url.hostname.toLowerCase();
  if (host === 'chromewebstore.google.com' || host === 'addons.mozilla.org') return true;
  if (host === 'chrome.google.com' && url.pathname.startsWith('/webstore')) return true;
  if (host === 'microsoftedge.microsoft.com' && url.pathname.startsWith('/addons')) return true;
  return false;
}

export function normalizeHostKey(hostname: string): string {
  return hostname
    .toLowerCase()
    .replace(/\.$/, '')
    .replace(/^www\./, '');
}

export function hostFromUrl(rawUrl: string | undefined): string | null {
  if (!rawUrl) return null;

  try {
    const url = new URL(rawUrl);
    if (!SUPPORTED_PROTOCOLS.has(url.protocol) || isBlockedPage(url)) return null;
    const host = normalizeHostKey(url.hostname);
    return isValidHostKey(host) ? host : null;
  } catch {
    return null;
  }
}

export function isValidHostKey(host: string): boolean {
  if (!host || host.length > 253 || RESERVED_KEYS.has(host)) return false;
  if (host !== host.toLowerCase() || host.startsWith('.') || host.includes('..')) return false;

  try {
    const url = new URL(`https://${host}/`);
    return url.hostname === host;
  } catch {
    return false;
  }
}

export function normalizeImportedHost(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const host = normalizeHostKey(raw.trim());
  return isValidHostKey(host) ? host : null;
}
