import browser from 'webextension-polyfill';
import { DATA_KEY, SCHEMA_VERSION } from './constants';
import { isValidHostKey } from './host';
import type { AppData, Session, ViewMode } from './types';
import { isRecord, isSession } from './validation';

export function defaultAppData(): AppData {
  return {
    schemaVersion: SCHEMA_VERSION,
    view: 'list',
    active: {},
    sites: {},
  };
}

function normalizeView(value: unknown): ViewMode {
  return value === 'grid' ? 'grid' : 'list';
}

export function normalizeAppData(raw: unknown): AppData | null {
  if (!isRecord(raw)) return null;
  if (raw.schemaVersion !== SCHEMA_VERSION) return null;

  const data = defaultAppData();
  data.view = normalizeView(raw.view);

  if (isRecord(raw.active)) {
    for (const [host, sessionId] of Object.entries(raw.active)) {
      if (!isValidHostKey(host)) continue;
      if (typeof sessionId === 'string' || sessionId === null) {
        data.active[host] = sessionId;
      }
    }
  }

  if (isRecord(raw.sites)) {
    for (const [host, sessions] of Object.entries(raw.sites)) {
      if (!isValidHostKey(host) || !Array.isArray(sessions)) continue;
      const validSessions = sessions.filter(isSession);
      if (validSessions.length > 0) {
        data.sites[host] = validSessions;
      }
    }
  }

  return data;
}

function isRawStorageEmpty(raw: unknown): boolean {
  return raw === undefined;
}

export async function loadData(): Promise<AppData> {
  const stored = await browser.storage.local.get(DATA_KEY);
  const raw = stored[DATA_KEY];

  if (isRawStorageEmpty(raw)) {
    return defaultAppData();
  }

  const normalized = normalizeAppData(raw);
  if (normalized) return normalized;

  // Keep a copy of unreadable data before starting over.
  try {
    await browser.storage.local.set({
      [`${DATA_KEY}_corrupt_${Date.now()}`]: raw,
    });
  } catch {
    // The backup is best-effort; resetting is still better than crashing.
  }

  return defaultAppData();
}

export async function saveData(data: AppData): Promise<void> {
  await browser.storage.local.set({ [DATA_KEY]: data });
}

export function sessionsForHost(data: AppData, host: string): Session[] {
  return [...(data.sites[host] ?? [])].sort(
    (left, right) => left.order - right.order || left.createdAt - right.createdAt,
  );
}

export function findSession(data: AppData, host: string, id: string | null): Session | null {
  if (!id) return null;
  return data.sites[host]?.find((session) => session.id === id) ?? null;
}

export function activeSession(data: AppData, host: string): Session | null {
  return findSession(data, host, data.active[host] ?? null);
}
