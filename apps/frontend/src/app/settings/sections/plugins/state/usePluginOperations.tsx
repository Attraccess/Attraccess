import { BookOpen } from 'lucide-react';
import { getBaseUrl } from '../../../../../api/index';
import { Button } from '../../../../../components/button/index';
import { dependencyError } from '../dependencies/DependencyPlan';
import type { usePluginsSectionStateOpenMarketplacePlugin } from '../marketplace/useMarketplace';
import { VersionCandidate, VersionPlugin } from '../types';
import { DOCS_URL } from './usePluginSettingsState';

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

export function usePluginsSectionStateOutput(model: ReturnType<typeof usePluginsSectionStateOpenMarketplacePlugin>) {
  const deleteConfirmedPlugin = async () => {
    if (!model.pluginToDelete) return;
    if (!model.deletingNpm) {
      model.deletePlugin({ pluginId: model.pluginToDelete });
      return;
    }
    try {
      await model.removePackageGraph({
        packageName: model.deletingPlugin.name,
        requestBody: { approvedDependants: model.dependantsToRemove.map(({ name }) => name) },
      });
      model.setPluginToDelete(null);
      model.toast.success({
        title: model.t('success.delete.title'),
        description: model.t('success.delete.description'),
      });
      setTimeout(() => window.location.reload(), 5000);
    } catch (error) {
      model.setRemoveFailure(dependencyError(error));
    }
  };

  const openVersionManagement = async (plugin: VersionPlugin) => {
    const request = ++model.versionRequest.current;
    model.setVersionPlugin(plugin);
    model.setVersions([]);
    model.setSelectedVersion(null);
    model.setPermissionApproved(false);
    model.setMajorApproved(false);
    const installed = model.installedNpmPlugins.get(plugin.name);
    model.setRequestedSpec(installed?.requestedSpec ?? plugin.version);
    model.setUpdateOverride(installed?.updateOverride ?? 'inherit');
    model.setIsLoadingVersions(true);
    try {
      // eslint-disable-next-line no-restricted-syntax -- Existing version loading awaits a broader hook migration.
      const response = await fetch(
        `${getBaseUrl()}/api/plugins/installed/${encodeURIComponent(plugin.name)}/versions`,
        {
          credentials: 'include',
        },
      );
      if (!response.ok) throw new Error();
      const candidates = (await response.json()) as VersionCandidate[];
      if (model.versionRequest.current === request) model.setVersions(candidates);
    } catch {
      if (model.versionRequest.current === request)
        model.toast.error({
          title: model.t('error.versions.title'),
          description: model.t('error.versions.description'),
        });
    } finally {
      if (model.versionRequest.current === request) model.setIsLoadingVersions(false);
    }
  };

  const replaceVersion = async () => {
    if (!model.versionPlugin || !model.selectedVersion) return;
    model.setIsReplacing(true);
    try {
      await model.replaceInstalledPlugin({
        packageName: model.versionPlugin.name,
        version: model.selectedVersion.version,
        requestBody: {
          approvedPermissionAdditions: model.selectedVersion.permissionAdditions,
          approvedMajorVersion: model.majorApproved,
          ...(model.hasVersionDependencies ? { planToken: model.versionPlan?.token } : {}),
        },
      });
      model.toast.success({
        title: model.t('success.replace.title'),
        description: model.t('success.replace.description'),
      });
      setTimeout(() => window.location.reload(), 5000);
      model.setVersionPlugin(null);
    } catch {
      model.toast.error({ title: model.t('error.replace.title'), description: model.t('error.replace.description') });
    } finally {
      model.setIsReplacing(false);
    }
  };

  const saveVersionPolicy = async () => {
    if (!model.versionPlugin) return;
    try {
      const installed = await model.updateInstalledPluginPolicy({
        packageName: model.versionPlugin.name,
        requestBody: { requestedSpec: model.requestedSpec, updateOverride: model.updateOverride },
      });
      model.setInstalledNpmPlugins((current) => new Map(current).set(installed.name, installed));
      model.toast.success({ title: model.t('versionManagement.policySaved') });
    } catch {
      model.toast.error({ title: model.t('versionManagement.policyError') });
    }
  };

  const checkForUpdates = async () => {
    try {
      const installed = await model.checkAllInstalledPackages();
      model.setInstalledNpmPlugins((current) => {
        const updated = new Map(current);
        for (const plugin of installed) updated.set(plugin.name, plugin);
        return updated;
      });
      if (installed.some((plugin) => plugin.updateCheck?.state === 'failed')) {
        model.toast.error({ title: model.t('updatePolicy.checkError') });
      } else {
        model.toast.success({ title: model.t('updatePolicy.checked') });
      }
    } catch {
      model.toast.error({ title: model.t('updatePolicy.checkError') });
    }
  };

  const availableUpdates = [...model.installedNpmPlugins.values()].filter(
    (plugin) => plugin.updateCheck?.state === 'available',
  );

  return {
    ...pluginSettingsDisplayState(model),
    deleteConfirmedPlugin,
    retryPlugin: model.retryPlugin,
    addRegistry: model.addRegistry,
    testRegistry: model.testRegistry,
    removeRegistry: model.removeRegistry,
    openMarketplacePlugin: model.openMarketplacePlugin,
    installMarketplacePlugin: model.installMarketplacePlugin,
    isDeleting: model.isDeleting,
    openVersionManagement,
    replaceVersion,
    saveVersionPolicy,
    checkForUpdates,
    availableUpdates,
  } as const;
}
