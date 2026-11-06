import browser from 'webextension-polyfill';
import type { Tabs } from 'webextension-polyfill';
import { APP_NAME, MAX_SESSION_NAME } from '../core/constants';
import { capture } from '../core/capture';
import { isCookieInSessionScope } from '../core/cookies';
import { createExportFile } from '../core/exportImport';
import { hostFromUrl } from '../core/host';
import { clearPending, getPending, setPending } from '../core/pending';
import { restore } from '../core/restore';
import { activeSession, findSession, loadData, saveData, sessionsForHost } from '../core/store';
import type {
  AppData,
  CaptureResult,
  ExportFile,
  PendingKind,
  PendingOperation,
  Session,
} from '../core/types';
import { wipe } from '../core/wipe';
import { append, byId, clearChildren, el } from '../shared/dom';
import {
  formatExportTimestamp,
  isValidSessionName,
  newSessionId,
  nextOrder,
  parseOrder,
} from '../shared/format';
import { createCheckboxField, createTextField, openDialog } from './components/dialog';
import { createGridTile } from './components/gridTile';
import { setupHeader } from './components/header';
import { setupMenu } from './components/menu';
import type { PopupMenu } from './components/menu';
import { createSessionCard } from './components/sessionCard';
import { showToast } from './components/toast';
import { createDotsIcon } from './icons';

const EXPORT_WARNING =
  'This file contains login cookies and site storage. Anyone with this file can access your accounts. Share it only with yourself.';

const LIMITATIONS = [
  'IndexedDB, Cache Storage, and service worker data are not saved. Some sites may still ask you to log in.',
  'Some sites bind sessions to a device, IP address, or browser fingerprint; imported sessions may not work.',
  'Some Secure or SameSite=None cookies may be rejected in a different browser.',
  'Incognito and private windows require manual permission for the extension.',
  'Firefox container tabs are only supported in a basic way.',
  'Auto-update saves the current site state into the active session. Logging in manually outside the extension can overwrite that snapshot.',
  'Cookie scope follows the site domain and can include related subdomains.',
  'Session data is stored unencrypted in browser storage. Anyone with access to your browser profile can read it.',
];

interface UiState {
  data: AppData;
  tab: Tabs.Tab | null;
  host: string | null;
  supported: boolean;
  firefox: boolean;
  accessGranted: boolean;
  pending: PendingOperation | null;
  busy: boolean;
  menu: PopupMenu | null;
}

let state: UiState;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong.';
}

function detectFirefox(): boolean {
  const runtime = browser.runtime as typeof browser.runtime & { getBrowserInfo?: unknown };
  return typeof runtime.getBrowserInfo === 'function';
}

function canManageSite(): boolean {
  return state.supported && (!state.firefox || state.accessGranted);
}

function requireSiteAccess(): boolean {
  if (canManageSite()) return true;
  showToast(
    state.supported ? 'Grant website access first.' : 'Open a website to manage sessions.',
    'error',
  );
  return false;
}

function requireTab(): { tab: Tabs.Tab; host: string } | null {
  if (!state.tab || !state.host) {
    showToast('Open a website to manage sessions.', 'error');
    return null;
  }
  return { tab: state.tab, host: state.host };
}

async function refreshTabForHost(host: string): Promise<Tabs.Tab | null> {
  if (!state.tab?.id) {
    showToast('The active tab is no longer available.', 'error');
    return null;
  }

  try {
    const tab = await browser.tabs.get(state.tab.id);
    if (!tab.url || hostFromUrl(tab.url) !== host) {
      showToast('The active page changed. Reopen the popup.', 'error');
      return null;
    }
    state.tab = tab;
    return tab;
  } catch {
    showToast('The active tab is no longer available.', 'error');
    return null;
  }
}

function setBusy(busy: boolean): void {
  state.busy = busy;
  byId('app').classList.toggle('busy', busy);
  byId<HTMLButtonElement>('view-toggle').disabled = busy || !state.supported;
  byId<HTMLButtonElement>('menu-button').disabled = busy;
  if (busy) state.menu?.close();
  state.menu?.refresh();
}

async function persist(): Promise<boolean> {
  try {
    await saveData(state.data);
    return true;
  } catch {
    showToast('Could not save data. Browser storage may be full.', 'error');
    return false;
  }
}

async function setPendingFor(host: string, kind: PendingKind, targetId?: string): Promise<void> {
  const operation: PendingOperation = {
    host,
    kind,
    startedAt: Date.now(),
    ...(targetId !== undefined ? { targetId } : {}),
  };
  await setPending(operation);
  state.pending = operation;
}

async function clearPendingForHost(host: string): Promise<void> {
  if (state.pending?.host !== host) return;
  await clearPending();
  state.pending = null;
}

function hasAnyData(captured: CaptureResult): boolean {
  return (
    captured.cookies.length > 0 ||
    Object.keys(captured.localStorage).length > 0 ||
    Object.keys(captured.sessionStorage).length > 0
  );
}

async function autoUpdateActive(host: string, tab: Tabs.Tab): Promise<void> {
  if (state.pending?.host === host) return;

  const active = activeSession(state.data, host);
  if (!active) return;

  const captured = await capture(tab);
  if (captured.cookies.length === 0 || !captured.storageOk) return;

  active.cookies = captured.cookies;
  active.localStorage = captured.localStorage;
  active.sessionStorage = captured.sessionStorage;

  if (!(await persist())) {
    throw new Error('Could not update the active session snapshot.');
  }
}

function confirmAction(options: {
  title: string;
  description: string;
  confirmLabel: string;
  danger?: boolean;
  body?: HTMLElement;
}): Promise<boolean> {
  return new Promise((resolve) => {
    openDialog({
      title: options.title,
      description: options.description,
      body: options.body,
      confirmLabel: options.confirmLabel,
      danger: options.danger,
      onConfirm: () => {
        resolve(true);
      },
      onCancel: () => {
        resolve(false);
      },
    });
  });
}

async function switchTo(target: Session): Promise<void> {
  if (state.busy) return;
  if (!requireSiteAccess()) return;

  const context = requireTab();
  if (!context) return;
  const { host } = context;
  const isActive = state.data.active[host] === target.id;
  const pendingHere = state.pending?.host === host;

  if (!target.cookies.every((cookie) => isCookieInSessionScope(cookie, host))) {
    showToast(
      'This session contains cookies for another site. Delete it and import again.',
      'error',
    );
    return;
  }

  const tab = await refreshTabForHost(host);
  if (!tab) return;

  setBusy(true);
  try {
    if (!isActive) {
      if (!activeSession(state.data, host) && !pendingHere) {
        const current = await capture(tab);
        if (current.cookies.length > 0) {
          const proceed = await confirmAction({
            title: 'Replace Current Session?',
            description: 'Your current session is not saved and will be replaced. Continue?',
            confirmLabel: 'Continue',
          });
          if (!proceed) {
            setBusy(false);
            return;
          }
        }
      }
      await autoUpdateActive(host, tab);
    }

    await setPendingFor(host, 'switch', target.id);
    const wiped = await wipe(tab);
    if (wiped.cookiesFailed > 0) {
      throw new Error(`Could not clear ${wiped.cookiesFailed} cookie(s). Nothing was restored.`);
    }
    if (!wiped.storageOk) {
      throw new Error('Could not clear site storage. Nothing was restored.');
    }

    const restored = await restore(tab, target);
    if (!restored.storageOk) {
      throw new Error('Cookies were restored, but site storage could not be written.');
    }

    target.lastUsed = Date.now();
    state.data.active[host] = target.id;
    if (!(await persist())) {
      throw new Error('The switch happened, but the session list could not be saved.');
    }

    await clearPendingForHost(host);

    if (restored.cookiesFailed > 0) {
      showToast(`Switched with ${restored.cookiesFailed} cookie(s) failed.`, 'error');
    } else {
      showToast(`Switched to ${target.name}`);
    }

    await browser.tabs.reload(tab.id);
    setTimeout(() => window.close(), restored.cookiesFailed > 0 ? 1600 : 500);
  } catch (error) {
    setBusy(false);
    showToast(errorMessage(error), 'error');
    render();
  }
}

function openSaveDialog(): void {
  if (!requireSiteAccess()) return;

  const context = requireTab();
  if (!context) return;
  const { host } = context;
  const sessions = sessionsForHost(state.data, host);
  const defaultOrder = nextOrder(sessions);

  const nameField = createTextField({
    id: 'session-name',
    label: 'Session name',
    value: `Session ${defaultOrder}`,
    maxLength: MAX_SESSION_NAME,
  });
  const orderField = createTextField({
    id: 'session-order',
    label: 'Order',
    value: String(defaultOrder),
    type: 'number',
    min: 1,
  });

  const body = el('div');
  append(body, nameField.wrapper, orderField.wrapper);

  const updateOrderHint = () => {
    const order = parseOrder(orderField.input.value);
    const duplicate = order !== null && sessions.some((session) => session.order === order);
    orderField.hint.textContent = duplicate
      ? `Order #${order} is already used. Duplicates are allowed; they are sorted by creation time.`
      : '';
    orderField.hint.hidden = !duplicate;
    orderField.hint.classList.toggle('field-hint-warning', duplicate);
  };
  orderField.input.addEventListener('input', updateOrderHint);
  updateOrderHint();

  let captured: CaptureResult | null = null;
  let confirmedEmpty = false;

  openDialog({
    title: 'Save Current Session',
    body,
    confirmLabel: 'Save',
    onConfirm: async (dialog) => {
      const name = nameField.input.value.trim();
      const order = parseOrder(orderField.input.value);

      if (!isValidSessionName(name)) {
        dialog.error('Enter a session name of 1 to 40 characters.');
        nameField.input.focus();
        return false;
      }
      if (order === null) {
        dialog.error('Order must be a whole number of 1 or more.');
        orderField.input.focus();
        return false;
      }

      try {
        if (!captured) {
          const tab = await refreshTabForHost(host);
          if (!tab) {
            dialog.error('The active page changed. Close this dialog and reopen the popup.');
            return false;
          }
          captured = await capture(tab);
        }

        if (!hasAnyData(captured) && !confirmedEmpty) {
          confirmedEmpty = true;
          dialog.warning('No session data found. Are you logged in?');
          dialog.setConfirmLabel('Save anyway');
          return false;
        }

        const now = Date.now();
        const session: Session = {
          id: newSessionId(),
          name,
          order,
          createdAt: now,
          lastUsed: now,
          cookies: captured.cookies,
          localStorage: captured.localStorage,
          sessionStorage: captured.sessionStorage,
        };

        const previousSites = state.data.sites[host];
        const previousActive = state.data.active[host];
        state.data.sites[host] = [...sessions, session];
        state.data.active[host] = session.id;

        if (!(await persist())) {
          if (previousSites === undefined) delete state.data.sites[host];
          else state.data.sites[host] = previousSites;
          if (previousActive === undefined) delete state.data.active[host];
          else state.data.active[host] = previousActive;
          dialog.error('Could not save the session.');
          return false;
        }

        await clearPendingForHost(host);
        showToast(captured.storageOk ? 'Session saved' : 'Session saved without site storage.');
        render();
        return true;
      } catch (error) {
        dialog.error(errorMessage(error));
        return false;
      }
    },
  });
}

function openEditDialog(session: Session): void {
  if (state.busy) return;

  const context = requireTab();
  if (!context) return;
  const { host } = context;
  const otherSessions = sessionsForHost(state.data, host).filter(
    (candidate) => candidate.id !== session.id,
  );

  const nameField = createTextField({
    id: 'edit-session-name',
    label: 'Session name',
    value: session.name,
    maxLength: MAX_SESSION_NAME,
  });
  const orderField = createTextField({
    id: 'edit-session-order',
    label: 'Order',
    value: String(session.order),
    type: 'number',
    min: 1,
  });

  const body = el('div');
  append(body, nameField.wrapper, orderField.wrapper);

  const updateOrderHint = () => {
    const order = parseOrder(orderField.input.value);
    const duplicate =
      order !== null && otherSessions.some((candidate) => candidate.order === order);
    orderField.hint.textContent = duplicate
      ? `Order #${order} is already used. Duplicates are allowed; they are sorted by creation time.`
      : '';
    orderField.hint.hidden = !duplicate;
    orderField.hint.classList.toggle('field-hint-warning', duplicate);
  };
  orderField.input.addEventListener('input', updateOrderHint);
  updateOrderHint();

  openDialog({
    title: 'Edit Session',
    body,
    confirmLabel: 'Save',
    onConfirm: async (dialog) => {
      const name = nameField.input.value.trim();
      const order = parseOrder(orderField.input.value);

      if (!isValidSessionName(name)) {
        dialog.error('Enter a session name of 1 to 40 characters.');
        nameField.input.focus();
        return false;
      }
      if (order === null) {
        dialog.error('Order must be a whole number of 1 or more.');
        orderField.input.focus();
        return false;
      }

      const previousName = session.name;
      const previousOrder = session.order;
      session.name = name;
      session.order = order;

      if (!(await persist())) {
        session.name = previousName;
        session.order = previousOrder;
        dialog.error('Could not save the session.');
        return false;
      }

      render();
      showToast('Session updated');
      return true;
    },
  });
}

function openDeleteDialog(session: Session): void {
  if (state.busy) return;

  const context = requireTab();
  if (!context) return;
  const { host } = context;

  void confirmAction({
    title: 'Delete Session',
    description: `Delete session "${session.name}"?`,
    confirmLabel: 'Delete',
    danger: true,
  }).then(async (confirmed) => {
    if (!confirmed) return;

    setBusy(true);
    try {
      const sessions = state.data.sites[host];
      if (!sessions) return;

      const index = sessions.findIndex((candidate) => candidate.id === session.id);
      if (index === -1) return;

      const [removed] = sessions.splice(index, 1);
      const wasActive = state.data.active[host] === session.id;
      if (wasActive) state.data.active[host] = null;

      if (!(await persist())) {
        if (removed) sessions.splice(index, 0, removed);
        if (wasActive) state.data.active[host] = session.id;
        showToast('Could not delete the session.', 'error');
      } else {
        showToast('Session deleted');
      }
    } finally {
      setBusy(false);
      render();
    }
  });
}

function openNewDialog(): void {
  if (!requireSiteAccess()) return;

  const context = requireTab();
  if (!context) return;
  const { host } = context;

  openDialog({
    title: 'New Session',
    description: `This signs you out of ${host} in this browser. Your saved sessions stay safe. Log in with another account, then use Save Current Session.`,
    confirmLabel: 'Start New Session',
    onConfirm: async (dialog) => {
      const tab = await refreshTabForHost(host);
      if (!tab) {
        dialog.error('The active page changed. Close this dialog and reopen the popup.');
        return false;
      }

      setBusy(true);
      try {
        await autoUpdateActive(host, tab);
        await setPendingFor(host, 'new');

        const wiped = await wipe(tab);
        if (wiped.cookiesFailed > 0) {
          throw new Error(`Could not clear ${wiped.cookiesFailed} cookie(s).`);
        }
        if (!wiped.storageOk) {
          throw new Error('Could not clear site storage.');
        }

        state.data.active[host] = null;
        if (!(await persist())) {
          throw new Error('Could not save the session list.');
        }

        await clearPendingForHost(host);
        await browser.tabs.reload(tab.id);
        window.close();
      } catch (error) {
        setBusy(false);
        dialog.error(errorMessage(error));
        render();
        return false;
      }
    },
  });
}

function openClearDialog(): void {
  if (!requireSiteAccess()) return;

  const context = requireTab();
  if (!context) return;
  const { host } = context;

  const checkbox = createCheckboxField({
    id: 'delete-all-sessions',
    label: 'Also delete all saved sessions for this site',
  });

  openDialog({
    title: 'Clear Session',
    description:
      'This removes the current cookies and site storage for this site. It signs you out here and cannot be undone. Saved sessions stay unless you select the option below.',
    body: checkbox.wrapper,
    confirmLabel: 'Clear Session',
    danger: true,
    onConfirm: async (dialog) => {
      const tab = await refreshTabForHost(host);
      if (!tab) {
        dialog.error('The active page changed. Close this dialog and reopen the popup.');
        return false;
      }

      setBusy(true);
      try {
        await setPendingFor(host, 'clear');

        const wiped = await wipe(tab);
        if (wiped.cookiesFailed > 0) {
          throw new Error(`Could not clear ${wiped.cookiesFailed} cookie(s).`);
        }
        if (!wiped.storageOk) {
          throw new Error('Could not clear site storage.');
        }

        state.data.active[host] = null;
        if (checkbox.input.checked) {
          delete state.data.sites[host];
          delete state.data.active[host];
        }

        if (!(await persist())) {
          throw new Error('Could not save the session list.');
        }

        await clearPendingForHost(host);
        await browser.tabs.reload(tab.id);
        window.close();
      } catch (error) {
        setBusy(false);
        dialog.error(errorMessage(error));
        render();
        return false;
      }
    },
  });
}

function downloadExport(file: ExportFile): void {
  const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `session-switcher-${formatExportTimestamp()}.json`;
  anchor.style.display = 'none';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function openTransferDialog(): void {
  const body = el('div', 'dialog-button-stack');
  const warning = el('p', 'export-warning', EXPORT_WARNING);
  const exportSite = el('button', 'button button-primary', 'Export this site');
  const exportAll = el('button', 'button button-neutral', 'Export all sites');
  const importButton = el('button', 'button button-neutral', 'Import from file');

  for (const button of [exportSite, exportAll, importButton]) {
    button.type = 'button';
  }

  const siteSessions = state.host ? sessionsForHost(state.data, state.host) : [];
  const totalSessions = Object.values(state.data.sites).reduce(
    (total, sessions) => total + sessions.length,
    0,
  );
  exportSite.disabled = siteSessions.length === 0;
  exportAll.disabled = totalSessions === 0;

  const dialogRef: { close: (() => void) | null } = { close: null };

  exportSite.addEventListener('click', () => {
    if (!state.host || siteSessions.length === 0) return;
    try {
      downloadExport(createExportFile(state.data, state.host));
      showToast(`Exported ${siteSessions.length} session${siteSessions.length === 1 ? '' : 's'}.`);
      dialogRef.close?.();
    } catch (error) {
      showToast(errorMessage(error), 'error');
    }
  });

  exportAll.addEventListener('click', () => {
    if (totalSessions === 0) return;
    try {
      downloadExport(createExportFile(state.data));
      showToast(`Exported ${totalSessions} session${totalSessions === 1 ? '' : 's'}.`);
      dialogRef.close?.();
    } catch (error) {
      showToast(errorMessage(error), 'error');
    }
  });

  importButton.addEventListener('click', () => {
    void browser.tabs
      .create({ url: browser.runtime.getURL('import.html') })
      .then(() => window.close())
      .catch((error) => showToast(errorMessage(error), 'error'));
  });

  append(body, warning, exportSite, exportAll, importButton);
  const handle = openDialog({
    title: 'Export / Import',
    body,
    confirmLabel: 'Close',
    cancelLabel: null,
    onConfirm: () => undefined,
  });
  dialogRef.close = handle.close;
}

function openAboutDialog(): void {
  const body = el('div', 'about-copy');
  const version = browser.runtime.getManifest().version;

  body.append(
    el('p', '', `${APP_NAME}, version ${version}`),
    el(
      'p',
      '',
      'Save and restore website logins locally, then switch between accounts without logging out.',
    ),
    el('p', '', 'All data stays on this device. Nothing is sent anywhere.'),
    el(
      'p',
      '',
      'Session cookies and site storage are stored unencrypted in browser storage, at the same risk level as your browser profile.',
    ),
    el('p', '', 'Known limitations'),
  );

  const list = el('ul');
  for (const limitation of LIMITATIONS) {
    list.append(el('li', '', limitation));
  }
  body.append(list);

  openDialog({
    title: `About ${APP_NAME}`,
    body,
    confirmLabel: 'Close',
    cancelLabel: null,
    onConfirm: () => undefined,
  });
}

function render(): void {
  setupHeader(state.host, state.data.view, state.supported);
  byId<HTMLButtonElement>('view-toggle').disabled = !state.supported || state.busy;

  byId<HTMLDivElement>('firefox-banner').hidden = !(state.firefox && !state.accessGranted);

  const pendingHere =
    state.pending !== null && state.pending.host === state.host && state.supported;
  const pendingBanner = byId<HTMLDivElement>('pending-banner');
  pendingBanner.hidden = !pendingHere;

  if (pendingHere && state.host) {
    const target = state.pending?.targetId
      ? findSession(state.data, state.host, state.pending.targetId)
      : null;
    byId<HTMLSpanElement>('pending-text').textContent = target
      ? `The previous switch to “${target.name}” was interrupted. Retry to finish.`
      : 'The previous operation was interrupted. Choose a saved session to continue.';
    byId<HTMLButtonElement>('pending-retry').hidden = !target;
  }

  const list = byId<HTMLDivElement>('list-view');
  const grid = byId<HTMLDivElement>('grid-view');
  const empty = byId<HTMLDivElement>('empty-state');
  const unsupported = byId<HTMLDivElement>('unsupported-state');

  clearChildren(list);
  clearChildren(grid);
  list.hidden = true;
  grid.hidden = true;
  empty.hidden = true;
  unsupported.hidden = true;

  if (!state.supported || !state.host) {
    unsupported.hidden = false;
    state.menu?.refresh();
    return;
  }

  const sessions = sessionsForHost(state.data, state.host);
  if (sessions.length === 0) {
    empty.hidden = false;
    state.menu?.refresh();
    return;
  }

  if (state.data.view === 'grid') {
    for (const session of sessions) {
      grid.append(
        createGridTile(session, state.data.active[state.host] === session.id, () => {
          void switchTo(session);
        }),
      );
    }
    grid.hidden = false;
  } else {
    for (const session of sessions) {
      list.append(
        createSessionCard(session, state.data.active[state.host] === session.id, {
          onSwitch: () => {
            void switchTo(session);
          },
          onEdit: () => openEditDialog(session),
          onDelete: () => openDeleteDialog(session),
        }),
      );
    }
    list.hidden = false;
  }

  state.menu?.refresh();
}

function onToggleView(): void {
  if (!state.supported || state.busy) return;

  const previous = state.data.view;
  state.data.view = previous === 'list' ? 'grid' : 'list';
  render();

  void persist().then((saved) => {
    if (!saved) {
      state.data.view = previous;
      render();
    }
  });
}

async function requestAccess(): Promise<void> {
  try {
    const granted = await browser.permissions.request({ origins: ['<all_urls>'] });
    state.accessGranted = granted;
    showToast(
      granted ? 'Website access granted.' : 'Access was not granted.',
      granted ? 'info' : 'error',
    );
    render();
  } catch (error) {
    showToast(errorMessage(error), 'error');
  }
}

function retryPending(): void {
  if (!state.host || !state.pending?.targetId) return;
  const target = findSession(state.data, state.host, state.pending.targetId);
  if (target) void switchTo(target);
}

async function init(): Promise<void> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  const host = hostFromUrl(tab?.url);
  const data = await loadData();
  const pending = await getPending();
  const firefox = detectFirefox();

  let accessGranted = true;
  if (firefox) {
    try {
      accessGranted = await browser.permissions.contains({ origins: ['<all_urls>'] });
    } catch {
      accessGranted = true;
    }
  }

  state = {
    data,
    tab: tab ?? null,
    host,
    supported: host !== null,
    firefox,
    accessGranted,
    pending,
    busy: false,
    menu: null,
  };

  if (
    pending &&
    host &&
    pending.host === host &&
    pending.kind === 'switch' &&
    data.active[host] === pending.targetId
  ) {
    await clearPending();
    state.pending = null;
  }

  byId<HTMLButtonElement>('menu-button').append(createDotsIcon());

  state.menu = setupMenu([
    {
      id: 'save',
      label: 'Save Current Session',
      onSelect: openSaveDialog,
      isDisabled: () => state.busy || !canManageSite(),
    },
    {
      id: 'new',
      label: 'New Session',
      onSelect: openNewDialog,
      isDisabled: () => state.busy || !canManageSite(),
    },
    {
      id: 'clear',
      label: 'Clear Session',
      onSelect: openClearDialog,
      isDisabled: () => state.busy || !canManageSite(),
    },
    {
      id: 'transfer',
      label: 'Export/Import',
      onSelect: openTransferDialog,
      isDisabled: () => state.busy,
    },
    {
      id: 'about',
      label: 'About',
      onSelect: openAboutDialog,
      isDisabled: () => state.busy,
    },
  ]);

  byId<HTMLButtonElement>('view-toggle').addEventListener('click', onToggleView);
  byId<HTMLButtonElement>('grant-access').addEventListener('click', () => {
    void requestAccess();
  });
  byId<HTMLButtonElement>('pending-retry').addEventListener('click', retryPending);

  render();
}

void init().catch((error) => {
  console.error(error);
  showToast(errorMessage(error), 'error');
});
