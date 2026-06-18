import { create } from 'zustand';

/**
 * In-app confirm/alert dialogs (replacing window.confirm / window.alert).
 * Call `confirm(...)` / `alert(...)` and await the user's choice; the
 * <DialogHost> rendered at the app root displays the popup.
 */
interface DialogOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

interface DialogState extends DialogOptions {
  open: boolean;
  isAlert: boolean;
  resolve: ((ok: boolean) => void) | null;
  confirm: (opts: DialogOptions) => Promise<boolean>;
  alert: (opts: DialogOptions) => Promise<void>;
  respond: (ok: boolean) => void;
}

export const useDialog = create<DialogState>((set, get) => ({
  open: false,
  isAlert: false,
  title: '',
  resolve: null,

  confirm(opts) {
    // Settle any dialog still open (treat as cancelled) so its caller's await
    // can't hang forever, and reset optional fields so the previous dialog's
    // message/labels/danger styling don't leak into this one.
    get().resolve?.(false);
    return new Promise<boolean>((resolve) => {
      set({
        message: undefined,
        confirmLabel: undefined,
        cancelLabel: undefined,
        danger: false,
        ...opts,
        open: true,
        isAlert: false,
        resolve,
      });
    });
  },

  alert(opts) {
    get().resolve?.(false);
    return new Promise<void>((resolve) => {
      set({
        message: undefined,
        confirmLabel: undefined,
        cancelLabel: undefined,
        danger: false,
        ...opts,
        open: true,
        isAlert: true,
        resolve: () => resolve(),
      });
    });
  },

  respond(ok) {
    const { resolve } = get();
    resolve?.(ok);
    set({ open: false, resolve: null });
  },
}));

export const confirmDialog = (opts: DialogOptions) => useDialog.getState().confirm(opts);
export const alertDialog = (opts: DialogOptions) => useDialog.getState().alert(opts);

/**
 * Standard Yes/No confirmation for a destructive action. `name` (optional) is
 * interpolated into the body. Localized via the shared i18n instance so call
 * sites stay terse.
 */
export async function confirmDelete(name?: string): Promise<boolean> {
  const { default: i18n } = await import('@/i18n');
  return useDialog.getState().confirm({
    title: i18n.t('common.confirmTitle'),
    message: name ? i18n.t('common.confirmDeleteName', { name }) : i18n.t('common.confirmDeleteGeneric'),
    confirmLabel: i18n.t('common.yes'),
    cancelLabel: i18n.t('common.no'),
    danger: true,
  });
}
