import { dependencyError } from './index.dependency-error.helpers';
import { getBaseUrl } from '../../../../api';
import { pluginSettingsDisplayState } from './pluginSettingsDisplayState';
import { VersionCandidate } from './index.contracts';
import { VersionPlugin } from './index.contracts';
import type { usePluginsSectionStateOpenMarketplacePlugin } from './usePluginsSectionStateOpenMarketplacePlugin';

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
