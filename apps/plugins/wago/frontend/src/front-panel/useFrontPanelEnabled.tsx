import { type Channel, type PanelConfiguration } from './model';
import type { useFrontPanelApply } from './useFrontPanelApply';

export function useFrontPanelEnabled(model: ReturnType<typeof useFrontPanelApply>) {
  return {
    configuration: model.configuration,
    applied: model.applied,
    diagnostics: model.diagnostics,
    dirty: model.dirty,
    conflict: model.conflict,
    busy: model.busy,
    pending: model.pending,
    review: model.review,
    errorKey: model.errorKey,
    backendError: model.backendError,
    validationErrors: model.validationErrors,
    ready: Boolean(model.configuration && model.draft.isSuccess && model.baseline.isSuccess),
    loadError: model.draft.isError || model.baseline.isError,
    live: {
      applied: model.applied,
      diagnostics: model.diagnostics.data,
      enabled: model.enabled,
      busy: model.busy,
      command: (channel: Channel, value?: boolean) => {
        if (!model.enabled || model.busy) return;
        model.setErrorKey(null);
        model.manual.mutate({ channel, value });
      },
    },
    edit: (next: PanelConfiguration) => {
      model.setConfiguration(next);
      model.setEditing(true);
      model.setReview(null);
      model.setErrorKey(null);
      model.setBackendError(null);
      model.setValidationErrors([]);
    },
    discard: () => model.discard.mutate(),
    apply: () => model.apply.mutate(false),
    confirmApply: () => model.apply.mutate(true),
    cancelReview: () => model.setReview(null),
    release: () => model.release.mutate(),
  };
}
