// Lets a ConfirmableButton hand its dialog to a host that outlives it (e.g. a dropdown menu item)
// FEATURE: confirmations triggered from menus survive the menu closing
import { createContext, ReactNode } from 'react';

export type ConfirmableStatus = 'info' | 'warning' | 'error' | 'success';

export interface ConfirmableConfirmOptions {
  title: ReactNode;
  /** Body of the dialog: plain text or richer content. */
  message?: ReactNode;
  /** Defaults to the activator label. */
  confirmLabel?: ReactNode;
  /** Defaults to "Cancel". */
  cancelLabel?: ReactNode;
  /** data-cy of the dialog. */
  'data-cy'?: string;
  confirmDataCy?: string;
  /** Defaults to `<data-cy>-close`. */
  cancelDataCy?: string;
}

export interface ConfirmableRequest {
  status: ConfirmableStatus;
  label: ReactNode;
  confirm: ConfirmableConfirmOptions;
  onConfirm: () => unknown;
  isPending?: boolean;
}

/** Opens a confirmation in the nearest host; null when there is none and the button hosts its own dialog. */
export const ConfirmableHostContext = createContext<((request: ConfirmableRequest) => void) | null>(null);
