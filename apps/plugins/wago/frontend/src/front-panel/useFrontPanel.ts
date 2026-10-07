// Coordinates unapplied edits, controller revisions and acknowledged manual output commands.
// FEATURE: WAGO front panel separates working settings from live configuration.
import { readConfiguration } from './useFrontPanel.helpers';
import { useFrontPanelInputs } from './useFrontPanelInputs';
import { useFrontPanelApply } from './useFrontPanelApply';
import { useFrontPanelEnabled } from './useFrontPanelEnabled';

export function useFrontPanel(controllerId: number) {
  const useFrontPanelInputsModel = useFrontPanelInputs(controllerId);
  const useFrontPanelApplyModel = useFrontPanelApply(useFrontPanelInputsModel);
  return useFrontPanelEnabled(useFrontPanelApplyModel);
}

export { readConfiguration };
