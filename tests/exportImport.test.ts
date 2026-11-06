import { describe, expect, it } from 'vitest';
import { createExportFile, mergeImport, parseImportJson } from '../src/core/exportImport';
import type { AppData, Session, StoredCookie } from '../src/core/types';

function emptyData(): AppData {
  return {
    schemaVersion: 1,
    view: 'list',
    active: {},
    sites: {},
  };
}

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
    ...overrides,
  };
}

function session(id: string, overrides: Partial<Session> = {}, host = 'example.com'): Session {
  return {
    id,
    name: `Session ${id}`,
    order: 1,
    createdAt: 1_700_000_000_000,
    lastUsed: 1_700_000_000_000,
    cookies: [cookie({ domain: `.${host}` })],
    localStorage: { token: 'abc' },
    sessionStorage: {},
    ...overrides,
  };
}

function exportJson(sites: Record<string, Session[]>, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    app: 'session-switcher',
    formatVersion: 1,
    exportedAt: '2026-11-05T10:00:00.000Z',
    sites,
    ...extra,
  });
}

describe('createExportFile', () => {
  it('exports one site or all non-empty sites', () => {
    const data: AppData = {
      ...emptyData(),
      sites: {
        'chatgpt.com': [session('one', {}, 'chatgpt.com')],
        'github.com': [session('two', {}, 'github.com')],
        'empty.com': [],
      },
    };

    const one = createExportFile(data, 'chatgpt.com');
    expect(Object.keys(one.sites)).toEqual(['chatgpt.com']);
    expect(one.app).toBe('session-switcher');
    expect(one.formatVersion).toBe(1);

    const all = createExportFile(data);
    expect(Object.keys(all.sites)).toEqual(['chatgpt.com', 'github.com']);
  });
});

describe('parseImportJson', () => {
  it('accepts a valid export and reports a summary', () => {
    const result = parseImportJson(
      exportJson({
        'chatgpt.com': [
          session('one', {}, 'chatgpt.com'),
          session('two', { order: 2 }, 'chatgpt.com'),
        ],
        'github.com': [session('three', {}, 'github.com')],
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.summary).toEqual({ sessionCount: 3, siteCount: 2 });
    expect(result.file.sites['chatgpt.com']).toHaveLength(2);
  });

  it('normalizes imported host keys', () => {
    const result = parseImportJson(exportJson({ 'WWW.Example.COM.': [session('one')] }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.keys(result.file.sites)).toEqual(['example.com']);
  });

  it('rejects invalid JSON and unsupported headers', () => {
    expect(parseImportJson('{')).toEqual({ ok: false, error: 'The file is not valid JSON.' });

    const wrongApp = parseImportJson(
      JSON.stringify({
        app: 'other',
        formatVersion: 1,
        exportedAt: '2026-11-05T10:00:00.000Z',
        sites: {},
      }),
    );
    expect(wrongApp.ok).toBe(false);

    const wrongVersion = parseImportJson(exportJson({}, { formatVersion: 99 }));
    expect(wrongVersion.ok).toBe(false);

    const badDate = parseImportJson(exportJson({}, { exportedAt: 'not-a-date' }));
    expect(badDate.ok).toBe(false);
  });

  it('rejects malformed sessions', () => {
    const emptyName = parseImportJson(
      exportJson({ 'example.com': [session('one', { name: ' ' })] }),
    );
    expect(emptyName.ok).toBe(false);

    const longName = parseImportJson(
      exportJson({ 'example.com': [session('one', { name: 'a'.repeat(41) })] }),
    );
    expect(longName.ok).toBe(false);

    const badOrder = parseImportJson(exportJson({ 'example.com': [session('one', { order: 0 })] }));
    expect(badOrder.ok).toBe(false);

    const badCookies = parseImportJson(
      exportJson({
        'example.com': [session('one', { cookies: [{ ...cookie(), secure: 'yes' }] as never })],
      }),
    );
    expect(badCookies.ok).toBe(false);
  });

  it('rejects cookies outside the session site scope', () => {
    const crossDomain = parseImportJson(
      exportJson({
        'evil.com': [session('one', { cookies: [cookie({ domain: '.bank.com' })] }, 'evil.com')],
      }),
    );
    expect(crossDomain.ok).toBe(false);

    const userInfoDomain = parseImportJson(
      exportJson({
        'evil.com': [
          session('one', { cookies: [cookie({ domain: 'evil.com@bank.com' })] }, 'evil.com'),
        ],
      }),
    );
    expect(userInfoDomain.ok).toBe(false);

    const foreignFirstParty = parseImportJson(
      exportJson({
        'example.com': [
          session('one', {
            cookies: [cookie({ domain: '.example.com', firstPartyDomain: 'evil.com' })],
          }),
        ],
      }),
    );
    expect(foreignFirstParty.ok).toBe(false);

    const foreignPartition = parseImportJson(
      exportJson({
        'example.com': [
          session('one', {
            cookies: [
              cookie({
                domain: '.example.com',
                partitionKey: { topLevelSite: 'https://bank.com' },
              }),
            ],
          }),
        ],
      }),
    );
    expect(foreignPartition.ok).toBe(false);
  });

  it('accepts cookies for the site, its parent domain, and its subdomains', () => {
    const result = parseImportJson(
      exportJson({
        'mail.example.com': [
          session('one', { cookies: [cookie({ domain: '.example.com' })] }, 'mail.example.com'),
        ],
        'example.com': [
          session('two', { cookies: [cookie({ domain: 'www.example.com' })] }, 'example.com'),
        ],
      }),
    );
    expect(result.ok).toBe(true);
  });

  it('strips browser-specific store ids from imported cookies', () => {
    const result = parseImportJson(
      exportJson({
        'example.com': [session('one', { cookies: [cookie({ storeId: '42' })] })],
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.file.sites['example.com']?.[0]?.cookies[0]?.storeId).toBeUndefined();
  });

  it('rejects reserved and duplicate normalized site keys', () => {
    const proto = `{"app":"session-switcher","formatVersion":1,"exportedAt":"2026-11-05T10:00:00.000Z","sites":{"__proto__":[]}}`;
    expect(parseImportJson(proto).ok).toBe(false);

    const duplicate = parseImportJson(
      exportJson({
        'example.com': [session('one')],
        'www.example.com': [session('two')],
      }),
    );
    expect(duplicate.ok).toBe(false);
  });

  it('keeps __proto__ as a normal storage key without polluting Object.prototype', () => {
    const raw = `{"app":"session-switcher","formatVersion":1,"exportedAt":"2026-11-05T10:00:00.000Z","sites":{"example.com":[{"id":"one","name":"One","order":1,"createdAt":1,"lastUsed":1,"cookies":[],"localStorage":{"__proto__":"safe"},"sessionStorage":{}}]}}`;
    const result = parseImportJson(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const imported = result.file.sites['example.com']?.[0];
    expect(imported).toBeDefined();
    expect(Object.hasOwn(imported?.localStorage ?? {}, '__proto__')).toBe(true);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe('mergeImport', () => {
  it('overwrites matching ids, adds new ones, and preserves other sites', () => {
    const current: AppData = {
      ...emptyData(),
      view: 'grid',
      active: { 'chatgpt.com': 'one' },
      sites: {
        'chatgpt.com': [session('one', {}, 'chatgpt.com')],
        'github.com': [session('keep', {}, 'github.com')],
      },
    };

    const file = {
      app: 'session-switcher' as const,
      formatVersion: 1 as const,
      exportedAt: '2026-11-05T10:00:00.000Z',
      sites: {
        'chatgpt.com': [
          session('one', { name: 'Renamed' }, 'chatgpt.com'),
          session('new', { order: 2 }, 'chatgpt.com'),
        ],
        'example.com': [session('other')],
      },
    };

    const merged = mergeImport(current, file);
    expect(merged.summary).toEqual({ sessionCount: 3, siteCount: 2 });
    expect(merged.data.sites['chatgpt.com']).toHaveLength(2);
    expect(merged.data.sites['chatgpt.com']?.[0]?.name).toBe('Renamed');
    expect(merged.data.sites['github.com']).toHaveLength(1);
    expect(merged.data.sites['example.com']).toHaveLength(1);
    expect(merged.data.active).toEqual({ 'chatgpt.com': 'one' });
    expect(merged.data.view).toBe('grid');
    expect(current.sites['chatgpt.com']).toHaveLength(1);
  });
});
