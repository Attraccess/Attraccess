import type { ConfigurationEditorMetadata, WagoConfigurationDraft, WagoConfigurationSnapshot } from '../api/client';

export function draftIdentity(draft: WagoConfigurationDraft | null | undefined) {
  return draft ? JSON.stringify([draft.updatedAt, draft.snapshot, draft.presetProvenance]) : 'empty';
}

export interface WorkingCopy {
  snapshot: WagoConfigurationSnapshot;
  metadata: ConfigurationEditorMetadata;
  source: string | null;
}
