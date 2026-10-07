import { usePluginsSectionStateInputs } from './usePluginsSectionStateInputs';
import { usePluginsSectionStateInstallApprovalToken } from './usePluginsSectionStateInstallApprovalToken';
import { usePluginsSectionStateLoadMarketplace } from './usePluginsSectionStateLoadMarketplace';
import { usePluginsSectionStateOpenMarketplacePlugin } from './usePluginsSectionStateOpenMarketplacePlugin';
import { usePluginsSectionStateOutput } from './usePluginsSectionStateOutput';

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
