import type { MarketplacePluginDto } from '@attraccess/react-query-client';
import { Card, Input, TextField } from '@heroui/react';
import { cardVariants } from '@heroui/styles';
import { PluginClassificationBadge } from '../PluginClassificationBadge';
import type { MarketplaceDetailRequest } from '../types';
import { usePluginsTranslations } from '../usePluginsTranslations';
import { useRegistries } from './useRegistries';

interface Props {
  query: string;
  onQueryChange: (query: string) => void;
  registryId: string;
  onRegistryIdChange: (registryId: string) => void;
  plugins: MarketplacePluginDto[];
  isLoading: boolean;
  onOpenDetails: (request: MarketplaceDetailRequest) => void;
}

export function MarketplaceSearchResults({
  query,
  onQueryChange,
  registryId,
  onRegistryIdChange,
  plugins,
  isLoading,
  onOpenDetails,
}: Props) {
  const { t } = usePluginsTranslations();
  const { data: registries = [] } = useRegistries();
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row">
        <TextField value={query} onChange={onQueryChange} className="w-full">
          <Input placeholder={t('marketplace.searchPlaceholder')} aria-label={t('marketplace.search')} />
        </TextField>
        <select
          aria-label={t('marketplace.registry')}
          value={registryId}
          onChange={(event) => onRegistryIdChange(event.target.value)}
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
      {isLoading ? (
        <p role="status" className="text-sm text-muted">
          {t('marketplace.loading')}
        </p>
      ) : null}
      {(['official', 'community'] as const).map((classification) => {
        const pluginsForClassification = plugins.filter((plugin) => plugin.classification === classification);
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
                  onClick={() => onOpenDetails({ name: plugin.name, registryId: plugin.registry.id })}
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
      {!isLoading && plugins.length === 0 ? (
        <p role="status" className="text-sm text-muted">
          {t('marketplace.noResults')}
        </p>
      ) : null}
    </div>
  );
}
