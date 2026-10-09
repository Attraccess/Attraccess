import { usePluginsSectionStateInstallApprovalToken } from '../dependencies/useDependencyPlans';
import {
  usePluginsSectionStateLoadMarketplace,
  usePluginsSectionStateOpenMarketplacePlugin,
} from '../marketplace/useMarketplace';
import { usePluginsSectionStateOutput } from './usePluginOperations';
import { usePluginsSectionStateInputs } from './usePluginSettingsState';

export function usePluginsSectionState() {
  const usePluginsSectionStateInputsModel = usePluginsSectionStateInputs();
  const usePluginsSectionStateInstallApprovalTokenModel = usePluginsSectionStateInstallApprovalToken(
    usePluginsSectionStateInputsModel,
  );
  const usePluginsSectionStateLoadMarketplaceModel = usePluginsSectionStateLoadMarketplace(
    usePluginsSectionStateInstallApprovalTokenModel,
  );
  const usePluginsSectionStateOpenMarketplacePluginModel = usePluginsSectionStateOpenMarketplacePlugin(
    usePluginsSectionStateLoadMarketplaceModel,
  );
  return usePluginsSectionStateOutput(usePluginsSectionStateOpenMarketplacePluginModel);
}
