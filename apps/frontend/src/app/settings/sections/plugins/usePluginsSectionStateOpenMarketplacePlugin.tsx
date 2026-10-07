import { usePluginsServiceDeletePlugin } from '@attraccess/react-query-client';
import { getBaseUrl } from '../../../../api';
import { MarketplacePlugin } from './index.contracts';
import type { usePluginsSectionStateLoadMarketplace } from './usePluginsSectionStateLoadMarketplace';

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
