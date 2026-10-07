import type { WagoConfigurationDraft } from '../api';
import { emptyConfiguration } from '../configuration-model';
import { emptyMetadata } from '../configuration-model';
import { readMetadata } from '../configuration-model';
import type { PanelConfiguration } from './model';

export function draftIdentity(draft: WagoConfigurationDraft | null | undefined) {
  return JSON.stringify(draft ? [draft.snapshot, draft.presetProvenance, draft.updatedAt] : null);
}

export function readConfiguration(
  source: { snapshot: string; presetProvenance?: string | null } | null | undefined,
): PanelConfiguration {
  return source
    ? { snapshot: JSON.parse(source.snapshot), metadata: readMetadata(source.presetProvenance ?? null) }
    : { snapshot: emptyConfiguration, metadata: emptyMetadata };
}
