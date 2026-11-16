import { Button, StandardModal } from '@attraccess/plugins-frontend-ui';
import type { MarketplacePluginDto } from '@attraccess/react-query-client';
import { ModalBody, ModalFooter, ModalHeader, ModalHeading } from '@heroui/react';
import { useEffect, useEffectEvent, useState } from 'react';
import { useToastMessage } from '../../../../../components/toastProvider';
import type { MarketplaceDetailRequest } from '../types';
import { usePluginsTranslations } from '../usePluginsTranslations';
import { MarketplacePluginDetails } from './MarketplacePluginDetails';
import { MarketplaceSearchResults } from './MarketplaceSearchResults';
import { useMarketplaceSearch } from './useMarketplaceSearch';
import { useRegistries } from './useRegistries';

interface Props {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  /** The package whose details are shown instead of the catalogue. */
  plugin: MarketplacePluginDto | null;
  isLoadingDetail: boolean;
  onOpenDetails: (request: MarketplaceDetailRequest) => void;
  onBack: () => void;
  onInstall: (plugin: MarketplacePluginDto) => void;
  onManageVersion: (plugin: MarketplacePluginDto) => void;
}

export function MarketplaceBrowser({
  isOpen,
  onOpenChange,
  plugin,
  isLoadingDetail,
  onOpenDetails,
  onBack,
  onInstall,
  onManageVersion,
}: Props) {
  const { t } = usePluginsTranslations();
  const toast = useToastMessage();
  const [query, setQuery] = useState('');
  const [registryId, setRegistryId] = useState('');
  const { plugins, isLoading } = useMarketplaceSearch({ isOpen, query, registryId });

  const { errorUpdatedAt: registriesErrorUpdatedAt } = useRegistries();
  const reportRegistryLoadError = useEffectEvent(() => toast.error({ title: t('marketplace.registryLoadError') }));
  useEffect(() => {
    if (registriesErrorUpdatedAt) reportRegistryLoadError();
  }, [registriesErrorUpdatedAt]);

  return (
    <StandardModal isOpen={isOpen} onOpenChange={onOpenChange} size="cover">
      {({ close }) => (
        <>
          <ModalHeader>
            {plugin ? (
              <div className="flex items-center gap-3">
                <Button variant="secondary" size="sm" onPress={onBack}>
                  {t('marketplace.back')}
                </Button>
                <div className="min-w-0">
                  <ModalHeading>{plugin.displayName ?? plugin.name}</ModalHeading>
                  <p className="truncate text-sm text-muted">{plugin.name}</p>
                </div>
              </div>
            ) : (
              <div>
                <ModalHeading>{t('marketplace.title')}</ModalHeading>
                <p className="text-sm text-muted">{t('marketplace.description')}</p>
              </div>
            )}
          </ModalHeader>
          <ModalBody>
            {plugin ? (
              <MarketplacePluginDetails
                plugin={plugin}
                onInstall={() => onInstall(plugin)}
                onManageVersion={() => onManageVersion(plugin)}
              />
            ) : (
              <MarketplaceSearchResults
                query={query}
                onQueryChange={setQuery}
                registryId={registryId}
                onRegistryIdChange={setRegistryId}
                plugins={plugins}
                isLoading={isLoading || isLoadingDetail}
                onOpenDetails={onOpenDetails}
              />
            )}
          </ModalBody>
          <ModalFooter>
            <Button variant="secondary" onPress={close}>
              {t('marketplace.cancel')}
            </Button>
          </ModalFooter>
        </>
      )}
    </StandardModal>
  );
}
