import { append, byId, el } from '../../shared/dom';

export interface DialogContext {
  body: HTMLDivElement;
  error(message: string): void;
  clearError(): void;
  warning(message: string): void;
  clearWarning(): void;
  setConfirmLabel(label: string): void;
  close(): void;
}

export interface DialogHandle {
  close(): void;
}

export interface DialogOptions {
  title: string;
  description?: string;
  body?: HTMLElement;
  confirmLabel: string;
  cancelLabel?: string | null;
  danger?: boolean;
  onConfirm: (context: DialogContext) => boolean | void | Promise<boolean | void>;
  onCancel?: () => void;
}

const FOCUSABLE =
  'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href]';

let dialogCounter = 0;

export function openDialog(options: DialogOptions): DialogHandle {
  const root = byId<HTMLDivElement>('dialog-root');
  const previousFocus = document.activeElement as HTMLElement | null;
  const titleId = `dialog-title-${(dialogCounter += 1)}`;

  const overlay = el('div', 'dialog-backdrop');
  const dialog = el('div', 'dialog');
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', titleId);

  const title = el('h2', 'dialog-title', options.title);
  title.id = titleId;
  dialog.append(title);

  if (options.description) {
    dialog.append(el('p', 'dialog-description', options.description));
  }

  const warning = el('p', 'dialog-warning');
  warning.hidden = true;
  dialog.append(warning);

  const form = el('form', 'dialog-form');
  form.noValidate = true;

  const bodySlot = el('div', 'dialog-body');
  if (options.body) bodySlot.append(options.body);

  const error = el('p', 'dialog-error');
  error.hidden = true;
  error.setAttribute('role', 'alert');

  const actions = el('div', 'dialog-actions');
  const cancelButton =
    options.cancelLabel === null
      ? null
      : el('button', 'button button-neutral', options.cancelLabel ?? 'Cancel');
  if (cancelButton) cancelButton.type = 'button';

  const confirmButton = el(
    'button',
    options.danger ? 'button button-danger' : 'button button-primary',
  );
  confirmButton.type = 'submit';
  confirmButton.textContent = options.confirmLabel;

  append(actions, cancelButton, confirmButton);
  append(form, bodySlot, error, actions);
  dialog.append(form);
  overlay.append(dialog);
  root.append(overlay);

  let closed = false;
  let busy = false;

  const close = () => {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKeyDown, true);
    overlay.remove();
    previousFocus?.focus();
  };

  const setBusy = (value: boolean) => {
    busy = value;
    confirmButton.disabled = value;
    if (cancelButton) cancelButton.disabled = value;
    dialog.classList.toggle('dialog-busy', value);
  };

  const cancel = () => {
    if (busy) return;
    options.onCancel?.();
    close();
  };

  const context: DialogContext = {
    body: bodySlot,
    error(message: string) {
      error.textContent = message;
      error.hidden = false;
    },
    clearError() {
      error.textContent = '';
      error.hidden = true;
    },
    warning(message: string) {
      warning.textContent = message;
      warning.hidden = false;
    },
    clearWarning() {
      warning.textContent = '';
      warning.hidden = true;
    },
    setConfirmLabel(label: string) {
      confirmButton.textContent = label;
    },
    close,
  };

  const runConfirm = async () => {
    if (busy) return;
    context.clearError();
    setBusy(true);

    let result: boolean | void;
    try {
      result = await options.onConfirm(context);
    } catch (caught) {
      if (!closed) {
        context.error(caught instanceof Error ? caught.message : 'Something went wrong.');
        setBusy(false);
      }
      return;
    }

    if (closed) return;
    if (result === false) {
      setBusy(false);
      return;
    }
    close();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      cancel();
      return;
    }
    if (event.key !== 'Tab') return;

    const focusable = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
      (node) => node.offsetParent !== null,
    );
    if (focusable.length === 0) {
      event.preventDefault();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) return;

    if (
      event.shiftKey &&
      (document.activeElement === first || !dialog.contains(document.activeElement))
    ) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    void runConfirm();
  });
  cancelButton?.addEventListener('click', cancel);
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) cancel();
  });
  document.addEventListener('keydown', onKeyDown, true);

  const autoFocus = bodySlot.querySelector<HTMLElement>(FOCUSABLE) ?? confirmButton;
  autoFocus.focus();

  return { close };
}

export interface TextFieldOptions {
  id: string;
  label: string;
  value?: string;
  type?: 'text' | 'number';
  maxLength?: number;
  min?: number;
  hint?: string;
}

export interface TextField {
  wrapper: HTMLDivElement;
  input: HTMLInputElement;
  hint: HTMLParagraphElement;
}

export function createTextField(options: TextFieldOptions): TextField {
  const wrapper = el('div', 'field');
  const label = el('label', 'field-label', options.label);
  label.htmlFor = options.id;

  const input = el('input', 'text-input');
  input.id = options.id;
  input.type = options.type ?? 'text';
  input.value = options.value ?? '';
  input.autocomplete = 'off';
  input.spellcheck = false;
  if (options.maxLength !== undefined) input.maxLength = options.maxLength;
  if (options.min !== undefined) input.min = String(options.min);

  const hint = el('p', 'field-hint');
  hint.hidden = !options.hint;
  if (options.hint) hint.textContent = options.hint;

  append(wrapper, label, input, hint);
  return { wrapper, input, hint };
}

export interface CheckboxFieldOptions {
  id: string;
  label: string;
  checked?: boolean;
}

export interface CheckboxField {
  wrapper: HTMLLabelElement;
  input: HTMLInputElement;
}

export function createCheckboxField(options: CheckboxFieldOptions): CheckboxField {
  const wrapper = el('label', 'checkbox-field');
  wrapper.htmlFor = options.id;

  const input = el('input');
  input.type = 'checkbox';
  input.id = options.id;
  input.checked = options.checked ?? false;

  const text = el('span', '', options.label);
  append(wrapper, input, text);
  return { wrapper, input };
}
