import { describe, expect, it, vi } from 'vitest';
import {
  activeSession,
  defaultAppData,
  findSession,
  normalizeAppData,
  sessionsForHost,
} from '../src/core/store';
import type { AppData, Session } from '../src/core/types';

vi.mock('webextension-polyfill', () => ({ default: {} }));

function session(id: string, order: number, createdAt: number): Session {
  return {
    id,
    name: `Session ${id}`,
    order,
    createdAt,
    lastUsed: createdAt,
    cookies: [],
    localStorage: {},
    sessionStorage: {},
  };
}

describe('defaultAppData', () => {
  it('uses the schema defaults', () => {
    expect(defaultAppData()).toEqual({
      schemaVersion: 1,
      view: 'list',
      active: {},
      sites: {},
    });
  });
});

describe('normalizeAppData', () => {
  it('accepts its own default output', () => {
    expect(normalizeAppData(defaultAppData())).toEqual(defaultAppData());
  });

  it('rejects a missing or unsupported schema version', () => {
    expect(normalizeAppData({ view: 'list', active: {}, sites: {} })).toBeNull();
    expect(normalizeAppData({ schemaVersion: 2, view: 'list', active: {}, sites: {} })).toBeNull();
    expect(normalizeAppData(null)).toBeNull();
  });

  it('keeps valid data and drops invalid hosts and sessions', () => {
    const raw = JSON.parse(
      `{
        "schemaVersion": 1,
        "view": "grid",
        "active": { "example.com": "one", "bad host": "x", "__proto__": "x" },
        "sites": {
          "example.com": [
            {
              "id": "one", "name": "One", "order": 1,
              "createdAt": 10, "lastUsed": 10,
              "cookies": [], "localStorage": {}, "sessionStorage": {}
            },
            { "id": "broken" }
          ],
          "bad host": [
            {
              "id": "two", "name": "Two", "order": 2,
              "createdAt": 20, "lastUsed": 20,
              "cookies": [], "localStorage": {}, "sessionStorage": {}
            }
          ],
          "__proto__": [
            {
              "id": "three", "name": "Three", "order": 3,
              "createdAt": 30, "lastUsed": 30,
              "cookies": [], "localStorage": {}, "sessionStorage": {}
            }
          ]
        }
      }`,
    ) as unknown;

    const normalized = normalizeAppData(raw);
    expect(normalized).not.toBeNull();
    expect(normalized?.view).toBe('grid');
    expect(normalized?.active).toEqual({ 'example.com': 'one' });
    expect(Object.keys(normalized?.sites ?? {})).toEqual(['example.com']);
    expect(normalized?.sites['example.com']).toHaveLength(1);
  });
});

describe('session helpers', () => {
  function data(): AppData {
    return {
      ...defaultAppData(),
      active: { 'example.com': 'b' },
      sites: {
        'example.com': [session('b', 1, 20), session('a', 1, 10), session('c', 2, 5)],
      },
    };
  }

  it('sorts by order and then creation time', () => {
    expect(sessionsForHost(data(), 'example.com').map((item) => item.id)).toEqual(['a', 'b', 'c']);
  });

  it('finds and resolves the active session', () => {
    expect(findSession(data(), 'example.com', 'b')?.id).toBe('b');
    expect(findSession(data(), 'example.com', null)).toBeNull();
    expect(activeSession(data(), 'example.com')?.id).toBe('b');
    expect(activeSession(data(), 'missing.com')).toBeNull();
  });
});
