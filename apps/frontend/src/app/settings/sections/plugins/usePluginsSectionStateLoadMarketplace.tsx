import { useEffect, useEffectEvent } from 'react';
import { getBaseUrl } from '../../../../api';
import { MarketplacePlugin } from './index.contracts';
import type { usePluginsSectionStateInstallApprovalToken } from './usePluginsSectionStateInstallApprovalToken';

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
