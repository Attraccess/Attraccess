import type { MarketplacePluginDto } from '@attraccess/react-query-client';
import { usePluginsServicePluginControllerMarketplacePackage } from '@attraccess/react-query-client';
import { useEffect, useEffectEvent, useState } from 'react';
import { useToastMessage } from '../../../../../components/toastProvider';
import type { MarketplaceDetailRequest } from '../types';
import { usePluginsTranslations } from '../usePluginsTranslations';

/**
 * Marketplace modal state shared by the plugin table (opens a package's details), the toolbar (opens the browser) and
 * the browser modal (shows the catalogue or the loaded package details). The modal only opens on a successful load.
 */
export function useMarketplaceBrowserState() {
  const { t } = usePluginsTranslations();
  const toast = useToastMessage();
  const [isOpen, setIsOpen] = useState(false);
  const [request, setRequest] = useState<MarketplaceDetailRequest | null>(null);
  const [plugin, setPlugin] = useState<MarketplacePluginDto | null>(null);

  const detail = usePluginsServicePluginControllerMarketplacePackage(
    { packageName: request?.name ?? '', registryId: request?.registryId },
    undefined,
    { enabled: request !== null, retry: false, refetchOnWindowFocus: false },
  );

  const settleRequest = useEffectEvent(() => {
    if (detail.isSuccess) {
      setPlugin(detail.data);
      setIsOpen(true);
    } else toast.error({ title: t('marketplace.loadError') });
    setRequest(null);
  });

  useEffect(() => {
    if (request && !detail.isFetching && (detail.isSuccess || detail.isError)) settleRequest();
  }, [request, detail.isFetching, detail.isSuccess, detail.isError]);

  return {
    isOpen,
    setIsOpen,
    plugin,
    isLoadingDetail: request !== null && detail.isFetching,
    openDetails: setRequest,
    closeDetails: () => setPlugin(null),
    dismiss: () => {
      setIsOpen(false);
      setRequest(null);
      setPlugin(null);
    },
  };
}
