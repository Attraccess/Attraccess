import { Card, Input, TextField } from '@heroui/react';
import { cardVariants } from '@heroui/styles';
import { Button } from '../../../../../components/button/index';
import { PluginClassificationBadge } from '../PluginClassificationBadge';
import { usePluginsSectionState } from '../state/usePluginSettings';
type Props = Pick<
  ReturnType<typeof usePluginsSectionState>,
  | 'marketplaceQuery'
  | 'marketplaceSearchRequest'
  | 'setMarketplaceQuery'
  | 't'
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
export function MarketplaceSearchResults({
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
}: Props) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row">
        <TextField
          value={marketplaceQuery}
          onChange={(value) => {
            marketplaceSearchRequest.current++;
            setMarketplaceQuery(value);
          }}
          className="w-full"
        >
          <Input placeholder={t('marketplace.searchPlaceholder')} aria-label={t('marketplace.search')} />
        </TextField>
        <select
          aria-label={t('marketplace.registry')}
          value={selectedRegistryId}
          onChange={(event) => {
            marketplaceSearchRequest.current++;
            setSelectedRegistryId(event.target.value);
          }}
          className="h-10 rounded-medium border border-divider bg-content1 px-3 text-sm"
        >
          <option value="">{t('marketplace.allRegistries')}</option>
          <option value="npm">npm</option>
          {registries.map((registry) => (
            <option key={registry.id} value={registry.id}>
              {registry.name}
            </option>
          ))}
        </select>
      </div>
      {isLoadingMarketplace ? (
        <p role="status" className="text-sm text-muted">
          {t('marketplace.loading')}
        </p>
      ) : null}
      {(['official', 'community'] as const).map((classification) => {
        const pluginsForClassification = marketplacePlugins.filter(
          (plugin) => plugin.classification === classification,
        );
        if (pluginsForClassification.length === 0) return null;
        return (
          <div key={classification} className="flex flex-col gap-3">
            <h4 className="font-medium text-foreground">{t(`marketplace.${classification}`)}</h4>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {pluginsForClassification.map((plugin) => (
                <button
                  type="button"
                  key={`${plugin.registry.id}:${plugin.name}`}
                  className={`${cardVariants().base()} h-full cursor-pointer text-left transition-all hover:border-accent hover:shadow-md ${plugin.incompatibilityReason ? 'opacity-75' : ''}`}
                  onClick={() => void openMarketplacePlugin(plugin)}
                >
                  <Card.Header>
                    <div className="flex w-full items-start justify-between gap-3">
                      <div>
                        <Card.Title className="text-base">{plugin.displayName ?? plugin.name}</Card.Title>
                        <Card.Description className="text-xs">{plugin.name}</Card.Description>
                      </div>
                      <PluginClassificationBadge classification={plugin.classification} />
                    </div>
                  </Card.Header>
                  <Card.Content className="flex flex-col gap-3">
                    {plugin.description ? <p className="text-sm text-muted">{plugin.description}</p> : null}
                    <p className="text-xs text-muted">{t('marketplace.version', { version: plugin.version ?? '-' })}</p>
                    {plugin.incompatibilityReason ? (
                      <p className="text-sm text-danger">{plugin.incompatibilityReason}</p>
                    ) : null}
                  </Card.Content>
                  <Card.Footer className="mt-auto justify-between gap-2">
                    <span className="text-xs text-muted">
                      {plugin.registry.name} · {plugin.publisher ?? '-'}
                    </span>
                  </Card.Footer>
                </button>
              ))}
            </div>
          </div>
        );
      })}
      {!isLoadingMarketplace && marketplacePlugins.length === 0 ? (
        <p role="status" className="text-sm text-muted">
          {t('marketplace.noResults')}
        </p>
      ) : null}
      <details className="border-t border-divider pt-4">
        <summary className="cursor-pointer font-medium text-foreground">{t('marketplace.registryManagement')}</summary>
        <div className="mt-3 flex flex-col gap-3">
          <div className="grid gap-2 sm:grid-cols-3">
            <TextField value={registryName} onChange={setRegistryName}>
              <Input placeholder={t('marketplace.registryName')} aria-label={t('marketplace.registryName')} />
            </TextField>
            <TextField value={registryUrl} onChange={setRegistryUrl}>
              <Input placeholder={t('marketplace.registryUrl')} aria-label={t('marketplace.registryUrl')} />
            </TextField>
            <TextField value={registryToken} onChange={setRegistryToken}>
              <Input
                type="password"
                placeholder={t('marketplace.registryToken')}
                aria-label={t('marketplace.registryToken')}
              />
            </TextField>
          </div>
          <div>
            <Button variant="secondary" onPress={() => void addRegistry()} isPending={isSavingRegistry}>
              {t('marketplace.addRegistry')}
            </Button>
          </div>
          {registries.map((registry) => (
            <div
              key={registry.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-medium border border-divider p-3 text-sm"
            >
              <span>
                {registry.name} · {registry.url} ·{' '}
                {registry.tokenConfigured ? t('marketplace.tokenConfigured') : t('marketplace.noToken')}
              </span>
              <span className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onPress={() => void testRegistry(registry.id)}
                  isPending={testingRegistryId === registry.id}
                >
                  {t('marketplace.testRegistry')}
                </Button>
                <Button variant="danger-soft" size="sm" onPress={() => void removeRegistry(registry.id)}>
                  {t('marketplace.removeRegistry')}
                </Button>
              </span>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
