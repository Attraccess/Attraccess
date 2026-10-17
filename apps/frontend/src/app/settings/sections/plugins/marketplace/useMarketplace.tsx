import { usePluginsServiceDeletePlugin } from '@attraccess/react-query-client';
import { useEffect, useEffectEvent } from 'react';
import { getBaseUrl } from '../../../../../api/index';
import { usePluginsSectionStateInstallApprovalToken } from '../dependencies/useDependencyPlans';
import { MarketplacePlugin } from '../types';

export function usePluginsSectionStateLoadMarketplace(
  model: ReturnType<typeof usePluginsSectionStateInstallApprovalToken>,
) {
  const loadMarketplace = async (query = model.marketplaceQuery) => {
    const request = ++model.marketplaceSearchRequest.current;
    model.setIsLoadingMarketplaceSearch(true);
    let result: { results: MarketplacePlugin[]; errors: string[] } = { results: [], errors: [] };
    let searchFailed = false;
    try {
      // eslint-disable-next-line no-restricted-syntax -- Existing marketplace search awaits a broader hook migration.
      const response = await fetch(
        `${getBaseUrl()}/api/plugins/marketplace/search?query=${encodeURIComponent(query)}${model.selectedRegistryId ? `&registryId=${encodeURIComponent(model.selectedRegistryId)}` : ''}`,
        {
          credentials: 'include',
        },
      );
      if (!response.ok) searchFailed = true;
      else result = (await response.json()) as { results: MarketplacePlugin[]; errors: string[] };
    } catch {
      searchFailed = true;
    }

    let directPackage: MarketplacePlugin | null = null;
    if (model.selectedRegistryId && query.trim()) {
      try {
        // eslint-disable-next-line no-restricted-syntax -- Existing package lookup awaits a broader hook migration.
        const packageResponse = await fetch(
          `${getBaseUrl()}/api/plugins/marketplace/${encodeURIComponent(query.trim())}?registryId=${encodeURIComponent(model.selectedRegistryId)}`,
          { credentials: 'include' },
        );
        if (packageResponse.ok) directPackage = (await packageResponse.json()) as MarketplacePlugin;
      } catch {
        // Registry search results remain useful when an exact package lookup is unavailable.
      }
    }

    if (model.marketplaceSearchRequest.current === request) {
      const unique = new Map(
        [...result.results, ...(directPackage ? [directPackage] : [])].map((plugin) => [
          `${plugin.registry.id}:${plugin.name}`,
          plugin,
        ]),
      );
      model.setMarketplacePlugins([...unique.values()]);
      if (searchFailed && !directPackage) model.toast.error({ title: model.t('marketplace.loadError') });
      else if (result.errors.length > 0)
        model.toast.error({ title: model.t('marketplace.loadError'), description: result.errors.join(', ') });
    }
    if (model.marketplaceSearchRequest.current === request) model.setIsLoadingMarketplaceSearch(false);
  };

  const addRegistry = async () => {
    model.setIsSavingRegistry(true);
    try {
      await model.addPluginRegistry({
        requestBody: { name: model.registryName, url: model.registryUrl, token: model.registryToken || undefined },
      });
      model.setRegistryName('');
      model.setRegistryUrl('');
      model.setRegistryToken('');
      await model.loadRegistries();
      model.toast.success({ title: model.t('marketplace.registryAdded') });
    } catch {
      model.toast.error({ title: model.t('marketplace.registrySaveError') });
    } finally {
      model.setIsSavingRegistry(false);
    }
  };

  const testRegistry = async (registryId: string) => {
    const request = Symbol(registryId);
    model.latestRegistryTest.current = request;
    model.setTestingRegistryId(registryId);
    try {
      await model.testPluginRegistry({ registryId });
      model.toast.success({ title: model.t('marketplace.registryTestSuccess') });
    } catch {
      model.toast.error({ title: model.t('marketplace.registryTestError') });
    } finally {
      if (model.latestRegistryTest.current === request) {
        model.latestRegistryTest.current = null;
        model.setTestingRegistryId(null);
      }
    }
  };

  const removeRegistry = async (registryId: string) => {
    try {
      await model.removePluginRegistry({ registryId });
      if (model.selectedRegistryId === registryId) model.setSelectedRegistryId('');
      await model.loadRegistries();
    } catch {
      model.toast.error({ title: model.t('marketplace.registryRemoveError') });
    }
  };

  const loadMarketplaceForCurrentFilters = useEffectEvent(() => {
    void loadMarketplace();
  });

  useEffect(() => {
    if (!model.isMarketplaceOpen || !globalThis.fetch) return;
    const timeout = window.setTimeout(loadMarketplaceForCurrentFilters, model.marketplaceQuery.trim() ? 300 : 0);
    return () => window.clearTimeout(timeout);
  }, [model.isMarketplaceOpen, model.marketplaceQuery, model.selectedRegistryId]);
  return {
    ...model,
    loadMarketplace,
    addRegistry,
    testRegistry,
    removeRegistry,
  } as const;
}

export function usePluginsSectionStateOpenMarketplacePlugin(
  model: ReturnType<typeof usePluginsSectionStateLoadMarketplace>,
) {
  const openMarketplacePlugin = async (plugin: MarketplacePlugin) => {
    const request = ++model.marketplaceDetailRequest.current;
    model.setIsLoadingMarketplaceDetail(true);
    try {
      // eslint-disable-next-line no-restricted-syntax -- Existing package details loading awaits a broader hook migration.
      const response = await fetch(
        `${getBaseUrl()}/api/plugins/marketplace/${encodeURIComponent(plugin.name)}?registryId=${encodeURIComponent(plugin.registry.id)}`,
        { credentials: 'include' },
      );
      if (!response.ok) throw new Error();
      const details = (await response.json()) as MarketplacePlugin;
      if (model.marketplaceDetailRequest.current === request) {
        model.setMarketplacePlugin(details);
        model.setIsMarketplaceOpen(true);
      }
    } catch {
      if (model.marketplaceDetailRequest.current === request)
        model.toast.error({ title: model.t('marketplace.loadError') });
    } finally {
      if (model.marketplaceDetailRequest.current === request) model.setIsLoadingMarketplaceDetail(false);
    }
  };

  const installMarketplacePlugin = async () => {
    if (!model.pluginToInstall?.version) return;
    model.setIsInstalling(true);
    model.setInstallFailure(null);
    try {
      await model.installPluginPackage({
        packageName: model.pluginToInstall.name,
        version: model.pluginToInstall.version,
        requestBody: {
          registryId: model.pluginToInstall.registry.id,
          ...(model.hasDependencies ? { planToken: model.dependencyPlan?.token } : {}),
        },
      });
      model.toast.success({ title: model.t('marketplace.installSuccess') });
      setTimeout(() => window.location.reload(), 5000);
      model.setPluginToInstall(null);
      model.setApprovedInstallPlanToken(null);
    } catch (error) {
      const response = error && typeof error === 'object' ? (error as { status?: number; body?: unknown }) : null;
      const body =
        response?.body && typeof response.body === 'object' ? (response.body as { message?: unknown }) : null;
      const reason =
        typeof body?.message === 'string'
          ? body.message
          : Array.isArray(body?.message) && body.message.every((item) => typeof item === 'string')
            ? body.message.join('; ')
            : null;
      const nextStep =
        response?.status === 401 || response?.status === 403
          ? model.t('marketplace.installPermissionHelp')
          : reason?.startsWith('Cannot POST')
            ? model.t('marketplace.installRouteHelp')
            : reason?.includes('not compatible') || reason?.includes('compatible peer dependency')
              ? model.t('marketplace.installCompatibilityHelp')
              : response?.status === 404
                ? model.t('marketplace.installVersionHelp')
                : response?.status === 500
                  ? model.t('marketplace.installServerHelp')
                  : model.t('marketplace.installRetryHelp');
      model.setInstallFailure([reason, nextStep].filter(Boolean).join(' '));
      model.toast.error({ title: model.t('marketplace.installError') });
    } finally {
      model.setIsInstalling(false);
    }
  };

  const { mutate: deletePlugin, isPending: isDeleting } = usePluginsServiceDeletePlugin({
    onSuccess: () => {
      // The server drops the plugin's bundle from the served asset set, so the running frontend is
      // holding modules that no longer exist — a reload is the only way back to a consistent app.
      setTimeout(() => window.location.reload(), 5000);
      model.setPluginToDelete(null);
      model.toast.success({
        title: model.t('success.delete.title'),
        description: model.t('success.delete.description'),
      });
    },
    onError: () => {
      model.toast.error({ title: model.t('error.delete.title'), description: model.t('error.delete.description') });
    },
  });
  return { ...model, openMarketplacePlugin, installMarketplacePlugin, deletePlugin, isDeleting } as const;
}
