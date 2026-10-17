import type { WagoConfigurationDraft } from '../../api/client';
import { emptyConfiguration, emptyMetadata, readMetadata } from '../../configuration/model';
import type { PanelConfiguration } from '../model';
import { useFrontPanelApply } from './useFrontPanelApply';
import { useFrontPanelEnabled } from './useFrontPanelEnabled';
import { useFrontPanelInputs } from './useFrontPanelInputs';

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

export function useFrontPanel(controllerId: number) {
  const useFrontPanelInputsModel = useFrontPanelInputs(controllerId);
  const useFrontPanelApplyModel = useFrontPanelApply(useFrontPanelInputsModel);
  return useFrontPanelEnabled(useFrontPanelApplyModel);
}

export interface WorkingCopy {
  configuration: PanelConfiguration;
  loadedDraft: WagoConfigurationDraft | null;
}
