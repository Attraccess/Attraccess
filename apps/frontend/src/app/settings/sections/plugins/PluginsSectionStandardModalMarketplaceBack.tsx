import { ModalBody, ModalFooter, ModalHeader, ModalHeading } from '@heroui/react';
import { Button } from '../../../../components/button';
import { StandardModal } from '../../../../components/standardModal';
import { dependencyError } from './index.dependency-error.helpers';
import { MarketplacePluginDetails } from './index.marketplace-plugin-details';
import { usePluginsSectionState } from './usePluginsSectionState';
import { PluginsSectionMarketplaceSearchPlaceholder } from './PluginsSectionMarketplaceSearchPlaceholder';
type Props = Pick<
  ReturnType<typeof usePluginsSectionState>,
  | 'isMarketplaceOpen'
  | 'setIsMarketplaceOpen'
  | 'marketplaceDetailRequest'
  | 'setIsLoadingMarketplaceDetail'
  | 'setMarketplacePlugin'
  | 'marketplacePlugin'
  | 't'
  | 'installedNpmPlugins'
  | 'setApprovedInstallPlanToken'
  | 'setPluginToInstall'
  | 'openVersionManagement'
  | 'dependencyPlan'
  | 'planError'
  | 'isResolvingDependencies'
  | 'marketplaceQuery'
  | 'marketplaceSearchRequest'
  | 'setMarketplaceQuery'
  | 'selectedRegistryId'
  | 'setSelectedRegistryId'
  | 'registries'
  | 'isLoadingMarketplace'
  | 'marketplacePlugins'
  | 'openMarketplacePlugin'
  | 'registryName'
  | 'setRegistryName'
  | 'registryUrl'
  | 'setRegistryUrl'
  | 'registryToken'
  | 'setRegistryToken'
  | 'addRegistry'
  | 'isSavingRegistry'
  | 'testRegistry'
  | 'testingRegistryId'
  | 'removeRegistry'
>;
export function PluginsSectionStandardModalMarketplaceBack({
  isMarketplaceOpen,
  setIsMarketplaceOpen,
  marketplaceDetailRequest,
  setIsLoadingMarketplaceDetail,
  setMarketplacePlugin,
  marketplacePlugin,
  t,
  installedNpmPlugins,
  setApprovedInstallPlanToken,
  setPluginToInstall,
  openVersionManagement,
  dependencyPlan,
  planError,
  isResolvingDependencies,
  marketplaceQuery,
  marketplaceSearchRequest,
  setMarketplaceQuery,
  selectedRegistryId,
  setSelectedRegistryId,
  registries,
  isLoadingMarketplace,
  marketplacePlugins,
  openMarketplacePlugin,
  registryName,
  setRegistryName,
  registryUrl,
  setRegistryUrl,
  registryToken,
  setRegistryToken,
  addRegistry,
  isSavingRegistry,
  testRegistry,
  testingRegistryId,
  removeRegistry,
}: Props) {
  return (
    <StandardModal
      isOpen={isMarketplaceOpen}
      onOpenChange={(open) => {
        setIsMarketplaceOpen(open);
        if (!open) {
          ++marketplaceDetailRequest.current;
          setIsLoadingMarketplaceDetail(false);
          setMarketplacePlugin(null);
        }
      }}
      size="cover"
    >
      {({ close }) => (
        <>
          <ModalHeader>
            {marketplacePlugin ? (
              <div className="flex items-center gap-3">
                <Button variant="secondary" size="sm" onPress={() => setMarketplacePlugin(null)}>
                  {t('marketplace.back')}
                </Button>
                <div className="min-w-0">
                  <ModalHeading>{marketplacePlugin.displayName ?? marketplacePlugin.name}</ModalHeading>
                  <p className="truncate text-sm text-muted">{marketplacePlugin.name}</p>
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
            {marketplacePlugin ? (
              <MarketplacePluginDetails
                plugin={marketplacePlugin}
                installedPlugin={installedNpmPlugins.get(marketplacePlugin.name)}
                onInstall={() => {
                  setApprovedInstallPlanToken(null);
                  setPluginToInstall(marketplacePlugin);
                }}
                onManageVersion={() => {
                  setIsMarketplaceOpen(false);
                  void openVersionManagement({
                    name: marketplacePlugin.name,
                    version:
                      installedNpmPlugins.get(marketplacePlugin.name)?.version ?? marketplacePlugin.version ?? '',
                  });
                }}
                dependencyPlan={dependencyPlan}
                dependencyError={dependencyError(planError)}
                isResolvingDependencies={isResolvingDependencies}
                t={t}
              />
            ) : (
              <PluginsSectionMarketplaceSearchPlaceholder
                {...{
                  marketplaceQuery,
                  marketplaceSearchRequest,
                  setMarketplaceQuery,
                  t,
                  selectedRegistryId,
                  setSelectedRegistryId,
                  registries,
                  isLoadingMarketplace,
                  marketplacePlugins,
                  openMarketplacePlugin,
                  registryName,
                  setRegistryName,
                  registryUrl,
                  setRegistryUrl,
                  registryToken,
                  setRegistryToken,
                  addRegistry,
                  isSavingRegistry,
                  testRegistry,
                  testingRegistryId,
                  removeRegistry,
                }}
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
