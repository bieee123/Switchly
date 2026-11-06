import { APP_NAME } from '../core/constants';
import { mergeImport, parseImportJson } from '../core/exportImport';
import type { ParseImportResult } from '../core/exportImport';
import { loadData, saveData } from '../core/store';
import { byId } from '../shared/dom';

const MAX_FILE_BYTES = 25 * 1024 * 1024;

type ValidImport = Extract<ParseImportResult, { ok: true }>;

let parsed: ValidImport | null = null;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong.';
}

function showError(message: string): void {
  const error = byId<HTMLParagraphElement>('error');
  error.textContent = message;
  error.hidden = false;
  byId<HTMLParagraphElement>('success').hidden = true;
}

function clearError(): void {
  const error = byId<HTMLParagraphElement>('error');
  error.textContent = '';
  error.hidden = true;
}

function showSuccess(message: string): void {
  const success = byId<HTMLParagraphElement>('success');
  success.textContent = message;
  success.hidden = false;
  clearError();
}

function clearSummary(): void {
  byId<HTMLDivElement>('summary').hidden = true;
  byId<HTMLUListElement>('site-list').replaceChildren();
  byId<HTMLParagraphElement>('summary-text').textContent = '';
  byId<HTMLButtonElement>('import-button').disabled = true;
}

function plural(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? '' : 's'}`;
}

function showSummary(result: ValidImport, fileName: string): void {
  byId<HTMLParagraphElement>('file-name').textContent = fileName;
  byId<HTMLParagraphElement>('file-name').hidden = false;

  const summary = byId<HTMLDivElement>('summary');
  const summaryText = byId<HTMLParagraphElement>('summary-text');
  const siteList = byId<HTMLUListElement>('site-list');

  if (result.summary.sessionCount === 0) {
    summaryText.textContent = 'This file contains no sessions.';
    summary.hidden = false;
    byId<HTMLButtonElement>('import-button').disabled = true;
    return;
  }

  summaryText.textContent = `${plural(result.summary.sessionCount, 'session')} across ${plural(
    result.summary.siteCount,
    'site',
  )} will be merged into this browser.`;

  siteList.replaceChildren();
  for (const [host, sessions] of Object.entries(result.file.sites)) {
    const item = document.createElement('li');
    item.textContent = `${host} — ${plural(sessions.length, 'session')}`;
    siteList.append(item);
  }

  summary.hidden = false;
  byId<HTMLButtonElement>('import-button').disabled = false;
}

async function readFile(file: File): Promise<void> {
  clearError();
  clearSummary();
  parsed = null;
  byId<HTMLParagraphElement>('success').hidden = true;
  byId<HTMLButtonElement>('close-button').hidden = true;

  if (file.size > MAX_FILE_BYTES) {
    showError('That file is too large. Choose an export smaller than 25 MB.');
    return;
  }

  let text: string;
  try {
    text = await file.text();
  } catch (error) {
    showError(errorMessage(error));
    return;
  }

  const result = parseImportJson(text);
  if (!result.ok) {
    showError(result.error);
    return;
  }

  parsed = result;
  showSummary(result, file.name);
}

async function importNow(): Promise<void> {
  if (!parsed) return;

  const importButton = byId<HTMLButtonElement>('import-button');
  importButton.disabled = true;
  clearError();

  try {
    const current = await loadData();
    const merged = mergeImport(current, parsed.file);
    await saveData(merged.data);

    showSuccess(
      `Imported ${plural(merged.summary.sessionCount, 'session')} across ${plural(
        merged.summary.siteCount,
        'site',
      )}.`,
    );
    importButton.hidden = true;
    byId<HTMLInputElement>('file-input').disabled = true;
    byId<HTMLButtonElement>('close-button').hidden = false;
  } catch (error) {
    importButton.disabled = false;
    showError(`Could not import: ${errorMessage(error)}`);
  }
}

function setup(): void {
  byId<HTMLDivElement>('app-name').textContent = APP_NAME;

  const fileInput = byId<HTMLInputElement>('file-input');
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (file) void readFile(file);
  });

  byId<HTMLButtonElement>('import-button').addEventListener('click', () => {
    void importNow();
  });
  byId<HTMLButtonElement>('close-button').addEventListener('click', () => {
    window.close();
  });
}

setup();
