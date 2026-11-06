import type { Session } from '../../core/types';
import { el } from '../../shared/dom';

export function createGridTile(
  session: Session,
  isActive: boolean,
  onSwitch: () => void,
): HTMLButtonElement {
  const tile = el('button', isActive ? 'grid-tile grid-tile-active' : 'grid-tile');
  tile.type = 'button';
  tile.textContent = String(session.order);
  tile.title = session.name;
  tile.setAttribute('aria-label', `Switch to ${session.name} (session #${session.order})`);
  if (isActive) tile.setAttribute('aria-current', 'true');
  tile.addEventListener('click', onSwitch);
  return tile;
}
