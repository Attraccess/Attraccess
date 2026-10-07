import { useEffect, useEffectEvent } from 'react';
import { getBaseUrl } from '../../../../api';
import { getServerInstanceId } from './index.dependency-error.helpers';
import { waitForServerRestart } from './serverRestart';
import { InstalledNpmPlugin } from './index.contracts';
import { Registry } from './index.contracts';
import type { usePluginsSectionStateInputs } from './usePluginsSectionStateInputs';

export function usePluginsSectionStateInstallApprovalToken(model: ReturnType<typeof usePluginsSectionStateInputs>) {
  const { setNpmPluginNames, setInstalledNpmPlugins } = model;
  const installApprovalToken = model.hasDependencies
    ? model.dependencyPlan?.token
    : model.pluginToInstall &&
      `${model.pluginToInstall.registry.id}:${model.pluginToInstall.name}@${model.pluginToInstall.version}`;
  const installPlanRoot = model.hasDependencies
    ? model.dependencyPlan?.plugins.find(
        (plugin) => plugin.name === model.pluginToInstall?.name && plugin.version === model.pluginToInstall?.version,
      )
    : undefined;
  const installApproved = Boolean(installApprovalToken && model.approvedInstallPlanToken === installApprovalToken);
  const dependencyChangesApproved = Boolean(
    model.versionPlan && model.approvedVersionPlanToken === model.versionPlan.token,
  );
  const removalApprovalToken = JSON.stringify(model.removalPlan?.map(({ name, version }) => ({ name, version })));
  const removeDependantsApproved = Boolean(removalApprovalToken && model.approvedRemovalPlan === removalApprovalToken);
  const retryPlugin = async () => {
    if (!model.failedPlugin) return;

    model.setIsRetryingPlugin(true);
    try {
      const getPluginSystemStatus = async () => (await model.refetchPluginSystemStatus()).data;
      const previousInstanceId = await getServerInstanceId(getPluginSystemStatus);
      await model.retryFailedPlugin({ pluginId: model.failedPlugin.id });
      model.toast.success({ title: model.t('status.retrySuccess') });
      await waitForServerRestart(previousInstanceId, getPluginSystemStatus);
      window.location.reload();
      model.setFailedPlugin(null);
    } catch {
      model.toast.error({ title: model.t('status.retryError') });
    } finally {
      model.setIsRetryingPlugin(false);
    }
  };

  useEffect(() => {
    if (!globalThis.fetch) return;
    // eslint-disable-next-line no-restricted-syntax -- Existing marketplace state loading awaits a broader hook migration.
    void fetch(`${getBaseUrl()}/api/plugins/installed`, { credentials: 'include' })
      .then(async (response) => (response.ok ? (response.json() as Promise<InstalledNpmPlugin[]>) : []))
      .then((installed) => {
        setNpmPluginNames(new Set(installed.map(({ name }) => name)));
        setInstalledNpmPlugins(
          new Map<string, InstalledNpmPlugin>(installed.map((plugin) => [plugin.name, plugin] as const)),
        );
      })
      .catch(() => undefined);
  }, [setNpmPluginNames, setInstalledNpmPlugins]);

  const loadRegistries = async () => {
    const request = ++model.registryRequest.current;
    try {
      // eslint-disable-next-line no-restricted-syntax -- Existing registry loading awaits a broader hook migration.
      const response = await fetch(`${getBaseUrl()}/api/plugins/registries`, { credentials: 'include' });
      if (!response.ok) throw new Error();
      const result = (await response.json()) as unknown;
      if (model.registryRequest.current === request)
        model.setRegistries(Array.isArray(result) ? (result as Registry[]) : []);
    } catch (error) {
      if (model.registryRequest.current === request)
        model.toast.error({ title: model.t('marketplace.registryLoadError') });
      throw error;
    }
  };

  const loadInitialRegistries = useEffectEvent(() => {
    void loadRegistries().catch(() => undefined);
  });

  useEffect(() => {
    if (globalThis.fetch) loadInitialRegistries();
  }, []);
  return {
    ...model,
    installApprovalToken,
    installPlanRoot,
    installApproved,
    dependencyChangesApproved,
    removalApprovalToken,
    removeDependantsApproved,
    retryPlugin,
    loadRegistries,
  } as const;
}
