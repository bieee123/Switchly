import browser from 'webextension-polyfill';
import { PENDING_KEY } from './constants';
import { isValidHostKey } from './host';
import type { PendingOperation } from './types';
import { isRecord } from './validation';

function pendingArea() {
  return browser.storage.session ?? browser.storage.local;
}

function isPendingOperation(value: unknown): value is PendingOperation {
  if (!isRecord(value)) return false;
  if (typeof value.host !== 'string' || !isValidHostKey(value.host)) return false;
  if (value.kind !== 'switch' && value.kind !== 'new' && value.kind !== 'clear') return false;
  if (value.targetId !== undefined && typeof value.targetId !== 'string') return false;
  if (typeof value.startedAt !== 'number' || !Number.isFinite(value.startedAt)) return false;
  return true;
}

export async function getPending(): Promise<PendingOperation | null> {
  try {
    const stored = await pendingArea().get(PENDING_KEY);
    return isPendingOperation(stored[PENDING_KEY]) ? stored[PENDING_KEY] : null;
  } catch {
    return null;
  }
}

export async function setPending(operation: PendingOperation): Promise<void> {
  await pendingArea().set({ [PENDING_KEY]: operation });
}

export async function clearPending(): Promise<void> {
  try {
    await pendingArea().remove(PENDING_KEY);
  } catch {
    // Cleared on the next successful operation anyway.
  }
}
