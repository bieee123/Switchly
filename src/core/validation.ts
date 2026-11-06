import { MAX_SESSION_NAME } from './constants';
import { normalizeCookieDomain } from './cookies';
import type { Session, StoredCookie } from './types';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isStringRecord(value: unknown): value is Record<string, string> {
  if (!isRecord(value)) return false;
  return Object.values(value).every((entry) => typeof entry === 'string');
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === 'string';
}

function isOptionalFiniteNumber(value: unknown): boolean {
  return value === undefined || (typeof value === 'number' && Number.isFinite(value));
}

function hasControlCharacters(value: string): boolean {
  for (const character of value) {
    const code = character.codePointAt(0);
    if (code !== undefined && (code < 0x20 || code === 0x7f)) return true;
  }
  return false;
}

function isSameSite(value: unknown): boolean {
  return (
    value === 'no_restriction' || value === 'lax' || value === 'strict' || value === 'unspecified'
  );
}

export function isStoredCookie(value: unknown): value is StoredCookie {
  if (!isRecord(value)) return false;
  if (typeof value.domain !== 'string' || normalizeCookieDomain(value.domain) === null)
    return false;
  if (typeof value.firstPartyDomain === 'string' && value.firstPartyDomain !== '') {
    if (normalizeCookieDomain(value.firstPartyDomain) === null) return false;
  }

  return (
    typeof value.name === 'string' &&
    typeof value.value === 'string' &&
    typeof value.path === 'string' &&
    value.path.startsWith('/') &&
    !hasControlCharacters(value.path) &&
    typeof value.secure === 'boolean' &&
    typeof value.httpOnly === 'boolean' &&
    typeof value.hostOnly === 'boolean' &&
    typeof value.session === 'boolean' &&
    isSameSite(value.sameSite) &&
    isOptionalFiniteNumber(value.expirationDate) &&
    isOptionalString(value.storeId) &&
    isOptionalString(value.firstPartyDomain) &&
    (value.partitionKey === undefined || isRecord(value.partitionKey))
  );
}

export function isSession(value: unknown): value is Session {
  if (!isRecord(value)) return false;
  if (typeof value.id !== 'string' || value.id.length === 0 || value.id.length > 200) return false;
  if (typeof value.name !== 'string') return false;
  const nameLength = value.name.trim().length;
  if (nameLength < 1 || nameLength > MAX_SESSION_NAME) return false;
  if (!Number.isInteger(value.order) || (value.order as number) < 1) return false;
  if (typeof value.createdAt !== 'number' || !Number.isFinite(value.createdAt)) return false;
  if (typeof value.lastUsed !== 'number' || !Number.isFinite(value.lastUsed)) return false;
  if (!Array.isArray(value.cookies) || !value.cookies.every(isStoredCookie)) return false;
  if (!isStringRecord(value.localStorage) || !isStringRecord(value.sessionStorage)) return false;

  return true;
}
