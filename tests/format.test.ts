import { describe, expect, it } from 'vitest';
import {
  formatExportTimestamp,
  formatLastUsed,
  isValidSessionName,
  nextOrder,
  parseOrder,
} from '../src/shared/format';
import type { Session } from '../src/core/types';

function session(order: number, createdAt = 1): Session {
  return {
    id: `id-${order}-${createdAt}`,
    name: `Session ${order}`,
    order,
    createdAt,
    lastUsed: createdAt,
    cookies: [],
    localStorage: {},
    sessionStorage: {},
  };
}

describe('formatLastUsed', () => {
  it('formats as en-GB dd/mm/yyyy', () => {
    expect(formatLastUsed(new Date(2025, 6, 20).getTime())).toBe('20/07/2025');
  });
});

describe('formatExportTimestamp', () => {
  it('formats local time as YYYYMMDD-HHmm', () => {
    expect(formatExportTimestamp(new Date(2026, 10, 5, 10, 7))).toBe('20261105-1007');
  });
});

describe('session name validation', () => {
  it('accepts trimmed names from 1 to 40 characters', () => {
    expect(isValidSessionName(' Main ')).toBe(true);
    expect(isValidSessionName('a'.repeat(40))).toBe(true);
    expect(isValidSessionName('')).toBe(false);
    expect(isValidSessionName('   ')).toBe(false);
    expect(isValidSessionName('a'.repeat(41))).toBe(false);
  });
});

describe('parseOrder', () => {
  it('accepts positive whole numbers', () => {
    expect(parseOrder('1')).toBe(1);
    expect(parseOrder('42')).toBe(42);
  });

  it('rejects zero, fractions, negatives, and text', () => {
    expect(parseOrder('0')).toBeNull();
    expect(parseOrder('1.5')).toBeNull();
    expect(parseOrder('-2')).toBeNull();
    expect(parseOrder('abc')).toBeNull();
    expect(parseOrder('')).toBeNull();
  });
});

describe('nextOrder', () => {
  it('returns one when there are no sessions', () => {
    expect(nextOrder([])).toBe(1);
  });

  it('returns the highest order plus one', () => {
    expect(nextOrder([session(2), session(7), session(4)])).toBe(8);
  });
});
