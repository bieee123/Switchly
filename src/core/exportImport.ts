import { APP_ID, FORMAT_VERSION } from './constants';
import { isCookieInSessionScope } from './cookies';
import { normalizeImportedHost } from './host';
import type { AppData, ExportFile, Session, StoredCookie } from './types';
import { isRecord, isSession, isStringRecord } from './validation';

export interface ImportSummary {
  sessionCount: number;
  siteCount: number;
}

export type ParseImportResult =
  | {
      ok: true;
      file: ExportFile;
      summary: ImportSummary;
    }
  | {
      ok: false;
      error: string;
    };

export function createExportFile(data: AppData, host?: string): ExportFile {
  const sites: Record<string, Session[]> = {};

  for (const [siteHost, sessions] of Object.entries(data.sites)) {
    if (host !== undefined && siteHost !== host) continue;
    if (sessions.length === 0) continue;
    sites[siteHost] = sessions;
  }

  return {
    app: APP_ID,
    formatVersion: FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    sites,
  };
}

function normalizeImportedCookie(cookie: StoredCookie): StoredCookie {
  return {
    name: cookie.name,
    value: cookie.value,
    domain: cookie.domain,
    path: cookie.path,
    secure: cookie.secure,
    httpOnly: cookie.httpOnly,
    hostOnly: cookie.hostOnly,
    session: cookie.session,
    sameSite: cookie.sameSite,
    ...(cookie.expirationDate !== undefined ? { expirationDate: cookie.expirationDate } : {}),
    // Store IDs are browser/profile specific and must not be imported.
    ...(cookie.partitionKey !== undefined ? { partitionKey: cookie.partitionKey } : {}),
    ...(cookie.firstPartyDomain !== undefined ? { firstPartyDomain: cookie.firstPartyDomain } : {}),
  };
}

function normalizeSession(session: Session): Session {
  return {
    id: session.id,
    name: session.name.trim(),
    order: session.order,
    createdAt: session.createdAt,
    lastUsed: session.lastUsed,
    cookies: session.cookies.map(normalizeImportedCookie),
    localStorage: Object.fromEntries(Object.entries(session.localStorage)),
    sessionStorage: Object.fromEntries(Object.entries(session.sessionStorage)),
  };
}

function errorForSession(site: string, index: number): string {
  return `Invalid session data for ${site} at index ${index + 1}.`;
}

export function parseImportJson(text: string): ParseImportResult {
  let raw: unknown;

  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'The file is not valid JSON.' };
  }

  if (!isRecord(raw)) {
    return { ok: false, error: 'The file does not contain an export object.' };
  }
  if (raw.app !== APP_ID) {
    return { ok: false, error: 'This file was not exported by Session Switcher.' };
  }
  if (raw.formatVersion !== FORMAT_VERSION) {
    return { ok: false, error: 'This export format version is not supported.' };
  }
  if (typeof raw.exportedAt !== 'string' || Number.isNaN(Date.parse(raw.exportedAt))) {
    return { ok: false, error: 'The export date is missing or invalid.' };
  }
  if (!isRecord(raw.sites)) {
    return { ok: false, error: 'The export does not contain a sites object.' };
  }

  const sites: Record<string, Session[]> = {};
  let sessionCount = 0;
  let siteCount = 0;

  for (const [rawHost, rawSessions] of Object.entries(raw.sites)) {
    const host = normalizeImportedHost(rawHost);
    if (!host) {
      return { ok: false, error: `Invalid site name in export: ${rawHost}.` };
    }
    if (Object.hasOwn(sites, host)) {
      return { ok: false, error: `The export contains the site ${host} more than once.` };
    }
    if (!Array.isArray(rawSessions)) {
      return { ok: false, error: `The sessions for ${host} are not a list.` };
    }

    const sessions: Session[] = [];
    for (let index = 0; index < rawSessions.length; index += 1) {
      const session = rawSessions[index];
      if (!isSession(session)) {
        return { ok: false, error: errorForSession(host, index) };
      }
      if (!session.cookies.every((cookie) => isCookieInSessionScope(cookie, host))) {
        return {
          ok: false,
          error: `${errorForSession(host, index)} Cookies must belong to ${host} or one of its related domains.`,
        };
      }
      if (!isStringRecord(session.localStorage) || !isStringRecord(session.sessionStorage)) {
        return { ok: false, error: errorForSession(host, index) };
      }
      sessions.push(normalizeSession(session));
    }

    if (sessions.length > 0) {
      sites[host] = sessions;
      sessionCount += sessions.length;
      siteCount += 1;
    }
  }

  return {
    ok: true,
    file: {
      app: APP_ID,
      formatVersion: FORMAT_VERSION,
      exportedAt: raw.exportedAt,
      sites,
    },
    summary: { sessionCount, siteCount },
  };
}

export interface MergeResult {
  data: AppData;
  summary: ImportSummary;
}

export function mergeImport(current: AppData, file: ExportFile): MergeResult {
  const data: AppData = {
    ...current,
    active: { ...current.active },
    sites: { ...current.sites },
  };

  let sessionCount = 0;
  let siteCount = 0;

  for (const [host, importedSessions] of Object.entries(file.sites)) {
    if (importedSessions.length === 0) continue;

    const merged = [...(data.sites[host] ?? [])];
    const indexById = new Map(merged.map((session, index) => [session.id, index]));

    for (const session of importedSessions) {
      const existingIndex = indexById.get(session.id);
      if (existingIndex === undefined) {
        indexById.set(session.id, merged.length);
        merged.push(session);
      } else {
        merged[existingIndex] = session;
      }
      sessionCount += 1;
    }

    data.sites[host] = merged;
    siteCount += 1;
  }

  return { data, summary: { sessionCount, siteCount } };
}
