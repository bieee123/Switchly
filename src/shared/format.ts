import type { Session } from '../core/types';
import { MAX_SESSION_NAME } from '../core/constants';

export function formatLastUsed(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('en-GB');
}

export function formatExportTimestamp(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    '-',
    pad(date.getHours()),
    pad(date.getMinutes()),
  ].join('');
}

export function isValidSessionName(name: string): boolean {
  const length = name.trim().length;
  return length >= 1 && length <= MAX_SESSION_NAME;
}

export function parseOrder(value: string): number | null {
  const order = Number(value);
  return Number.isInteger(order) && order >= 1 ? order : null;
}

export function nextOrder(sessions: Session[]): number {
  return sessions.reduce((max, session) => Math.max(max, session.order), 0) + 1;
}

export function newSessionId(): string {
  return crypto.randomUUID();
}
