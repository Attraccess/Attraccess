export type VapidConfirmStep = 'warning' | 'final' | null;

/** The in-progress VAPID key replacement: the custom keys typed so far and where the two-step confirmation stands. */
export interface VapidKeyDraft {
  confirmStep: VapidConfirmStep;
  customPublicKey: string;
  customPrivateKey: string;
  /** The custom pair being confirmed; `undefined` confirms a freshly generated pair. */
  pendingOverride: { publicKey: string; privateKey: string } | undefined;
}

export const EMPTY_VAPID_KEY_DRAFT: VapidKeyDraft = {
  confirmStep: null,
  customPublicKey: '',
  customPrivateKey: '',
  pendingOverride: undefined,
};
