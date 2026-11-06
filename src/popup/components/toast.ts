import { byId } from '../../shared/dom';

let timer: ReturnType<typeof setTimeout> | undefined;

export type ToastTone = 'info' | 'error';

export function showToast(message: string, tone: ToastTone = 'info'): void {
  const toast = byId<HTMLDivElement>('toast');
  toast.textContent = message;
  toast.className = tone === 'error' ? 'toast toast-error' : 'toast';
  toast.hidden = false;

  if (timer !== undefined) clearTimeout(timer);
  timer = setTimeout(() => {
    toast.hidden = true;
  }, 2800);
}
