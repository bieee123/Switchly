import { describe, expect, it } from 'vitest';
import {
  buildCookieUrl,
  cookieKey,
  dedupeCookies,
  hasCookiePrefixThatDisallowsDomain,
  isCookieDomainInScope,
  isCookieInSessionScope,
  isExpiredCookie,
  normalizeCookieDomain,
  toStoredCookie,
} from '../src/core/cookies';
import type { StoredCookie } from '../src/core/types';

function cookie(overrides: Partial<StoredCookie> = {}): StoredCookie {
  return {
    name: 'sid',
    value: 'abc',
    domain: '.example.com',
    path: '/',
    secure: true,
    httpOnly: true,
    hostOnly: false,
    session: false,
    sameSite: 'lax',
    expirationDate: 1_800_000_000,
    storeId: '0',
    ...overrides,
  };
}

describe('toStoredCookie', () => {
  it('maps a browser cookie into the stored shape', () => {
    const mapped = toStoredCookie({
      name: 'sid',
      value: 'abc',
      domain: '.example.com',
      path: '/',
      secure: true,
      httpOnly: true,
      hostOnly: false,
      session: false,
      sameSite: 'no_restriction',
      expirationDate: 1_800_000_000,
      storeId: '0',
      firstPartyDomain: 'example.com',
      partitionKey: { topLevelSite: 'https://example.com' },
    });

    expect(mapped).toEqual({
      name: 'sid',
      value: 'abc',
      domain: '.example.com',
      path: '/',
      secure: true,
      httpOnly: true,
      hostOnly: false,
      session: false,
      sameSite: 'no_restriction',
      expirationDate: 1_800_000_000,
      storeId: '0',
      firstPartyDomain: 'example.com',
      partitionKey: { topLevelSite: 'https://example.com' },
    });
  });

  it('falls back to host-only and unspecified values', () => {
    const mapped = toStoredCookie({
      name: 'a',
      value: 'b',
      domain: 'example.com',
      path: '/x',
      secure: false,
      httpOnly: false,
      sameSite: 'unknown',
    });

    expect(mapped.hostOnly).toBe(true);
    expect(mapped.session).toBe(true);
    expect(mapped.sameSite).toBe('unspecified');
  });
});

describe('dedupeCookies', () => {
  it('deduplicates the same cookie returned by multiple queries', () => {
    const first = cookie();
    const second = cookie();
    expect(dedupeCookies([first, second])).toHaveLength(1);
  });

  it('keeps cookies with different partition keys', () => {
    const plain = cookie();
    const partitioned = cookie({ partitionKey: { topLevelSite: 'https://example.com' } });
    expect(dedupeCookies([plain, partitioned])).toHaveLength(2);
  });

  it('treats partition key objects with a different key order as equal', () => {
    const first = cookie({ partitionKey: { hasCrossSiteAncestor: true, topLevelSite: 'x' } });
    const second = cookie({ partitionKey: { topLevelSite: 'x', hasCrossSiteAncestor: true } });
    expect(cookieKey(first)).toBe(cookieKey(second));
    expect(dedupeCookies([first, second])).toHaveLength(1);
  });

  it('keeps cookies with different Firefox first-party domains or stores', () => {
    expect(
      dedupeCookies([
        cookie({ firstPartyDomain: 'example.com' }),
        cookie({ firstPartyDomain: 'example.org' }),
      ]),
    ).toHaveLength(2);
    expect(dedupeCookies([cookie({ storeId: '0' }), cookie({ storeId: '1' })])).toHaveLength(2);
  });
});

describe('buildCookieUrl', () => {
  it('builds a secure URL without the leading dot', () => {
    expect(buildCookieUrl(cookie({ domain: '.example.com', path: '/foo' }))).toBe(
      'https://example.com/foo',
    );
  });

  it('uses http for non-secure cookies and normalizes the path', () => {
    expect(buildCookieUrl(cookie({ secure: false, domain: 'example.com', path: 'bar' }))).toBe(
      'http://example.com/bar',
    );
  });

  it('rejects a cookie without a valid domain', () => {
    expect(() => buildCookieUrl(cookie({ domain: '' }))).toThrow('invalid domain');
    expect(() => buildCookieUrl(cookie({ domain: 'evil.com@bank.com' }))).toThrow('invalid domain');
  });
});

describe('cookie domain scope', () => {
  it('normalizes valid cookie domains', () => {
    expect(normalizeCookieDomain('.Example.COM')).toBe('example.com');
    expect(normalizeCookieDomain('localhost')).toBe('localhost');
    expect(normalizeCookieDomain('[::1]')).toBe('[::1]');
  });

  it('rejects malformed domains that can change the URL host', () => {
    expect(normalizeCookieDomain('evil.com@bank.com')).toBeNull();
    expect(normalizeCookieDomain('example.com:8080')).toBeNull();
    expect(normalizeCookieDomain('example.com/path')).toBeNull();
    expect(normalizeCookieDomain('example.com.')).toBeNull();
    expect(normalizeCookieDomain('..example.com')).toBeNull();
  });

  it('allows the site itself, parent domains, and subdomains only', () => {
    expect(isCookieDomainInScope('.example.com', 'example.com')).toBe(true);
    expect(isCookieDomainInScope('www.example.com', 'example.com')).toBe(true);
    expect(isCookieDomainInScope('.example.com', 'mail.example.com')).toBe(true);
    expect(isCookieDomainInScope('example.com', 'sub.example.com')).toBe(true);
    expect(isCookieDomainInScope('.bank.com', 'evil.com')).toBe(false);
    expect(isCookieDomainInScope('notevil.com', 'evil.com')).toBe(false);
  });

  it('requires an exact domain match for IP hosts', () => {
    expect(isCookieDomainInScope('127.0.0.1', '127.0.0.1')).toBe(true);
    expect(isCookieDomainInScope('0.0.1', '127.0.0.1')).toBe(false);
    expect(isCookieDomainInScope('[::1]', '[::1]')).toBe(true);
    expect(isCookieDomainInScope('[::2]', '[::1]')).toBe(false);
  });

  it('checks first-party and partition scope too', () => {
    expect(
      isCookieInSessionScope(
        cookie({ domain: '.example.com', firstPartyDomain: 'evil.com' }),
        'example.com',
      ),
    ).toBe(false);

    expect(
      isCookieInSessionScope(
        cookie({ domain: '.example.com', partitionKey: { topLevelSite: 'https://bank.com' } }),
        'example.com',
      ),
    ).toBe(false);

    expect(
      isCookieInSessionScope(
        cookie({
          domain: '.example.com',
          partitionKey: { topLevelSite: 'https://www.example.com' },
        }),
        'example.com',
      ),
    ).toBe(true);
  });
});

describe('isExpiredCookie', () => {
  it('compares expiration seconds to milliseconds', () => {
    const now = 1_800_000_000_000;
    expect(isExpiredCookie(cookie({ expirationDate: 1_799_999_999 }), now)).toBe(true);
    expect(isExpiredCookie(cookie({ expirationDate: 1_800_000_001 }), now)).toBe(false);
  });

  it('never expires session cookies', () => {
    expect(isExpiredCookie(cookie({ session: true, expirationDate: 1 }), 1_800_000_000_000)).toBe(
      false,
    );
  });
});

describe('hasCookiePrefixThatDisallowsDomain', () => {
  it('detects __Host- cookies', () => {
    expect(hasCookiePrefixThatDisallowsDomain(cookie({ name: '__Host-token' }))).toBe(true);
    expect(hasCookiePrefixThatDisallowsDomain(cookie({ name: '__Secure-token' }))).toBe(false);
  });
});
