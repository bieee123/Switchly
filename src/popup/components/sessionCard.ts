import type { Session } from '../../core/types';
import { formatLastUsed } from '../../shared/format';
import { append, el } from '../../shared/dom';
import { createPencilIcon, createTrashIcon } from '../icons';

export interface SessionCardHandlers {
  onSwitch: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export function createSessionCard(
  session: Session,
  isActive: boolean,
  handlers: SessionCardHandlers,
): HTMLElement {
  const card = el('div', isActive ? 'session-card session-card-active' : 'session-card');
  card.tabIndex = 0;
  card.setAttribute('role', 'button');
  card.setAttribute('aria-label', `Switch to ${session.name}`);
  if (isActive) card.setAttribute('aria-current', 'true');

  const content = el('div', 'card-content');
  const top = el('div', 'card-top');
  const badge = el('span', 'card-badge', `#${session.order}`);
  const name = el('span', 'card-name', session.name);
  const lastUsed = el('div', 'card-last-used', `Last used: ${formatLastUsed(session.lastUsed)}`);

  append(top, badge, name);
  append(content, top, lastUsed);

  const actions = el('div', 'card-actions');
  const edit = el('button', 'card-icon edit-icon');
  edit.type = 'button';
  edit.title = `Edit ${session.name}`;
  edit.setAttribute('aria-label', `Edit ${session.name}`);
  edit.append(createPencilIcon());

  const remove = el('button', 'card-icon delete-icon');
  remove.type = 'button';
  remove.title = `Delete ${session.name}`;
  remove.setAttribute('aria-label', `Delete ${session.name}`);
  remove.append(createTrashIcon());

  edit.addEventListener('click', (event) => {
    event.stopPropagation();
    handlers.onEdit();
  });
  remove.addEventListener('click', (event) => {
    event.stopPropagation();
    handlers.onDelete();
  });

  append(actions, edit, remove);
  append(card, content, actions);

  card.addEventListener('click', (event) => {
    if ((event.target as Element).closest('.card-actions')) return;
    handlers.onSwitch();
  });

  card.addEventListener('keydown', (event) => {
    if (event.target !== card) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handlers.onSwitch();
    }
  });

  return card;
}
