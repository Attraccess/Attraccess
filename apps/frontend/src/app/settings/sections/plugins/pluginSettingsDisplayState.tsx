import { BookOpen } from 'lucide-react';
import { Button } from '../../../../components/button';
import { DOCS_URL } from './index.state';
import type { usePluginsSectionStateOpenMarketplacePlugin } from './usePluginsSectionStateOpenMarketplacePlugin';
export function pluginSettingsDisplayState(model: ReturnType<typeof usePluginsSectionStateOpenMarketplacePlugin>) {
  const aside = (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold text-foreground">{model.t('aside.title')}</h3>
      <p className="text-xs text-muted">{model.t('aside.description')}</p>
      <a href={DOCS_URL} target="_blank" rel="noreferrer" data-cy="plugins-list-docs-link">
        <Button variant="secondary" size="sm">
          <BookOpen size={16} />
          {model.t('docsButton')}
        </Button>
      </a>
    </div>
  );
  return {
    aside,
    t: model.t,
    plugins: model.plugins,
    isCheckingForUpdates: model.isCheckingForUpdates,
    pluginsDisabled: model.pluginsDisabled,
    failedPlugin: model.failedPlugin,
    setFailedPlugin: model.setFailedPlugin,
    isRetryingPlugin: model.isRetryingPlugin,
    pluginToDelete: model.pluginToDelete,
    setPluginToDelete: model.setPluginToDelete,
    isUploadOpen: model.isUploadOpen,
    setIsUploadOpen: model.setIsUploadOpen,
    versionPlugin: model.versionPlugin,
    setVersionPlugin: model.setVersionPlugin,
    versions: model.versions,
    selectedVersion: model.selectedVersion,
    setSelectedVersion: model.setSelectedVersion,
    permissionApproved: model.permissionApproved,
    setPermissionApproved: model.setPermissionApproved,
    isLoadingVersions: model.isLoadingVersions,
    isReplacing: model.isReplacing,
    npmPluginNames: model.npmPluginNames,
    installedNpmPlugins: model.installedNpmPlugins,
    isMarketplaceOpen: model.isMarketplaceOpen,
    setIsMarketplaceOpen: model.setIsMarketplaceOpen,
    marketplaceQuery: model.marketplaceQuery,
    setMarketplaceQuery: model.setMarketplaceQuery,
    selectedRegistryId: model.selectedRegistryId,
    setSelectedRegistryId: model.setSelectedRegistryId,
    marketplacePlugins: model.marketplacePlugins,
    setIsLoadingMarketplaceDetail: model.setIsLoadingMarketplaceDetail,
    marketplacePlugin: model.marketplacePlugin,
    setMarketplacePlugin: model.setMarketplacePlugin,
    pluginToInstall: model.pluginToInstall,
    setPluginToInstall: model.setPluginToInstall,
    isInstalling: model.isInstalling,
    installFailure: model.installFailure,
    setInstallFailure: model.setInstallFailure,
    requestedSpec: model.requestedSpec,
    setRequestedSpec: model.setRequestedSpec,
    updateOverride: model.updateOverride,
    setUpdateOverride: model.setUpdateOverride,
    setApprovedVersionPlanToken: model.setApprovedVersionPlanToken,
    majorApproved: model.majorApproved,
    setMajorApproved: model.setMajorApproved,
    setApprovedInstallPlanToken: model.setApprovedInstallPlanToken,
    registries: model.registries,
    registryName: model.registryName,
    setRegistryName: model.setRegistryName,
    registryUrl: model.registryUrl,
    setRegistryUrl: model.setRegistryUrl,
    registryToken: model.registryToken,
    setRegistryToken: model.setRegistryToken,
    isSavingRegistry: model.isSavingRegistry,
    testingRegistryId: model.testingRegistryId,
    marketplaceSearchRequest: model.marketplaceSearchRequest,
    marketplaceDetailRequest: model.marketplaceDetailRequest,
    isLoadingMarketplace: model.isLoadingMarketplace,
    setApprovedRemovalPlan: model.setApprovedRemovalPlan,
    removeFailure: model.removeFailure,
    setRemoveFailure: model.setRemoveFailure,
    isRemovingGraph: model.isRemovingGraph,
    hasDependencies: model.hasDependencies,
    dependencyPlan: model.dependencyPlan,
    planError: model.planError,
    isResolvingDependencies: model.isResolvingDependencies,
    hasVersionDependencies: model.hasVersionDependencies,
    versionPlan: model.versionPlan,
    versionPlanError: model.versionPlanError,
    isResolvingVersionDependencies: model.isResolvingVersionDependencies,
    deletingPlugin: model.deletingPlugin,
    deletingNpm: model.deletingNpm,
    removalPlan: model.removalPlan,
    removalPlanError: model.removalPlanError,
    isResolvingRemoval: model.isResolvingRemoval,
    dependantsToRemove: model.dependantsToRemove,
    installApprovalToken: model.installApprovalToken,
    installPlanRoot: model.installPlanRoot,
    installApproved: model.installApproved,
    dependencyChangesApproved: model.dependencyChangesApproved,
    removalApprovalToken: model.removalApprovalToken,
    removeDependantsApproved: model.removeDependantsApproved,
  } as const;
}
