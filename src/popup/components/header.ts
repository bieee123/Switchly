import { APP_NAME } from '../../core/constants';
import type { ViewMode } from '../../core/types';
import { byId } from '../../shared/dom';

export function setupHeader(host: string | null, view: ViewMode, supported: boolean): void {
  const appName = byId<HTMLDivElement>('app-name');
  const hostLabel = byId<HTMLDivElement>('host-label');
  const toggle = byId<HTMLButtonElement>('view-toggle');

  appName.textContent = APP_NAME;
  hostLabel.textContent = host ?? 'No website';
  hostLabel.title = host ?? '';

  toggle.textContent = view === 'list' ? 'Grid' : 'List';
  toggle.disabled = !supported;
  toggle.setAttribute(
    'aria-label',
    view === 'list' ? 'Switch to grid view' : 'Switch to list view',
  );
}
