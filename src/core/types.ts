export type ViewMode = 'list' | 'grid';

export type SameSite = 'no_restriction' | 'lax' | 'strict' | 'unspecified';

export interface StoredCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  secure: boolean;
  httpOnly: boolean;
  hostOnly: boolean;
  session: boolean;
  sameSite: SameSite;
  expirationDate?: number;
  storeId?: string;
  partitionKey?: unknown;
  firstPartyDomain?: string;
}

export interface Session {
  id: string;
  name: string;
  order: number;
  createdAt: number;
  lastUsed: number;
  cookies: StoredCookie[];
  localStorage: Record<string, string>;
  sessionStorage: Record<string, string>;
}

export interface AppData {
  schemaVersion: 1;
  view: ViewMode;
  active: Record<string, string | null>;
  sites: Record<string, Session[]>;
}

export interface CaptureResult {
  cookies: StoredCookie[];
  localStorage: Record<string, string>;
  sessionStorage: Record<string, string>;
  storageOk: boolean;
}

export interface WipeResult {
  removed: number;
  cookiesFailed: number;
  storageOk: boolean;
}

export interface RestoreResult {
  cookiesFailed: number;
  storageOk: boolean;
}

export type PendingKind = 'switch' | 'new' | 'clear';

export interface PendingOperation {
  host: string;
  kind: PendingKind;
  targetId?: string;
  startedAt: number;
}

export interface ExportFile {
  app: 'session-switcher';
  formatVersion: 1;
  exportedAt: string;
  sites: Record<string, Session[]>;
}
