import { useFrontPanelApply } from './useFrontPanelApply';
import { useFrontPanelEnabled } from './useFrontPanelEnabled';
import { useFrontPanelInputs } from './useFrontPanelInputs';

export function useFrontPanel(controllerId: number) {
  const useFrontPanelInputsModel = useFrontPanelInputs(controllerId);
  const useFrontPanelApplyModel = useFrontPanelApply(useFrontPanelInputsModel);
  return useFrontPanelEnabled(useFrontPanelApplyModel);
}
