import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Tabs } from 'webextension-polyfill';
import type { Session, StoredCookie } from '../src/core/types';

const mocks = vi.hoisted(() => ({
  set: vi.fn(async () => ({})),
  executeScript: vi.fn(async () => [{ result: true }]),
}));

vi.mock('webextension-polyfill', () => ({
  default: {
    cookies: { set: mocks.set },
    scripting: { executeScript: mocks.executeScript },
  },
}));

import { restore } from '../src/core/restore';

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

function session(cookies: StoredCookie[]): Session {
  return {
    id: 'one',
    name: 'One',
    order: 1,
    createdAt: 1,
    lastUsed: 1,
    cookies,
    localStorage: { token: 'abc' },
    sessionStorage: {},
  };
}

describe('restore cookie scope', () => {
  beforeEach(() => {
    mocks.set.mockClear();
    mocks.executeScript.mockClear();
  });

  it('blocks out-of-scope cookies before writing anything', async () => {
    const tab = { id: 1, url: 'https://evil.com/' } as Tabs.Tab;

    await expect(restore(tab, session([cookie({ domain: '.bank.com' })]))).rejects.toThrow(
      'another site',
    );
    expect(mocks.set).not.toHaveBeenCalled();
    expect(mocks.executeScript).not.toHaveBeenCalled();
  });

  it('restores cookies that belong to the tab site', async () => {
    const tab = { id: 1, url: 'https://mail.example.com/' } as Tabs.Tab;
    const result = await restore(tab, session([cookie({ domain: '.example.com' })]));

    expect(result).toEqual({ cookiesFailed: 0, storageOk: true });
    expect(mocks.set).toHaveBeenCalledTimes(1);
    expect(mocks.executeScript).toHaveBeenCalledTimes(1);
  });
});
