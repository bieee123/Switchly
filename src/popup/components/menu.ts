import { byId } from '../../shared/dom';

export interface MenuItem {
  id: string;
  label: string;
  onSelect: () => void;
  isDisabled: () => boolean;
}

export class PopupMenu {
  private readonly button: HTMLButtonElement;
  private readonly menu: HTMLDivElement;
  private readonly items: MenuItem[];
  private readonly itemButtons = new Map<string, HTMLButtonElement>();
  private readonly onDocumentPointerDown = (event: PointerEvent) => {
    const target = event.target as Node;
    if (this.menu.contains(target) || this.button.contains(target)) return;
    this.close();
  };
  private readonly onDocumentKeyDown = (event: KeyboardEvent) => {
    if (this.menu.hidden) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      this.close(true);
      return;
    }
    if (event.key === 'Tab') {
      this.close();
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      this.moveFocus(event.key === 'ArrowDown' ? 1 : -1);
    }
  };

  constructor(button: HTMLButtonElement, menu: HTMLDivElement, items: MenuItem[]) {
    this.button = button;
    this.menu = menu;
    this.items = items;

    for (const item of items) {
      const node = document.createElement('button');
      node.type = 'button';
      node.className = 'menu-item';
      node.setAttribute('role', 'menuitem');
      node.dataset.menuId = item.id;
      node.textContent = item.label;
      node.addEventListener('click', () => {
        if (node.disabled) return;
        this.close();
        item.onSelect();
      });
      this.itemButtons.set(item.id, node);
      this.menu.append(node);
    }

    this.button.addEventListener('click', (event) => {
      event.stopPropagation();
      if (this.menu.hidden) this.open();
      else this.close();
    });
  }

  open(): void {
    if (this.button.disabled) return;
    this.refresh();
    this.menu.hidden = false;
    this.button.setAttribute('aria-expanded', 'true');
    document.addEventListener('pointerdown', this.onDocumentPointerDown, true);
    document.addEventListener('keydown', this.onDocumentKeyDown, true);

    const firstEnabled = this.items.find((item) => !this.isItemDisabled(item));
    if (firstEnabled) this.itemButtons.get(firstEnabled.id)?.focus();
  }

  close(returnFocus = false): void {
    if (this.menu.hidden) return;
    this.menu.hidden = true;
    this.button.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', this.onDocumentPointerDown, true);
    document.removeEventListener('keydown', this.onDocumentKeyDown, true);
    if (returnFocus) this.button.focus();
  }

  refresh(): void {
    for (const item of this.items) {
      const node = this.itemButtons.get(item.id);
      if (node) node.disabled = this.isItemDisabled(item);
    }
  }

  private isItemDisabled(item: MenuItem): boolean {
    return this.button.disabled || item.isDisabled();
  }

  private moveFocus(direction: 1 | -1): void {
    const enabled = this.items
      .filter((item) => !this.isItemDisabled(item))
      .map((item) => this.itemButtons.get(item.id))
      .filter((button): button is HTMLButtonElement => button !== undefined);
    if (enabled.length === 0) return;

    const current = document.activeElement;
    const index = enabled.findIndex((button) => button === current);
    const next = enabled[(index + direction + enabled.length) % enabled.length];
    next?.focus();
  }
}

export function setupMenu(items: MenuItem[]): PopupMenu {
  return new PopupMenu(byId<HTMLButtonElement>('menu-button'), byId<HTMLDivElement>('menu'), items);
}
