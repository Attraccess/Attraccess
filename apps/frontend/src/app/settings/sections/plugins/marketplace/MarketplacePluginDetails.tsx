import { Button } from '@attraccess/plugins-frontend-ui';
import type { MarketplacePluginDto } from '@attraccess/react-query-client';
import { Card, Chip } from '@heroui/react';
import { ExternalLink, ShieldCheck } from 'lucide-react';
import { dependencyError } from '../dependencies/dependencyError';
import { DependencyPlanDetails } from '../dependencies/DependencyPlanDetails';
import { usePluginDependencyPlan } from '../dependencies/usePluginDependencyPlan';
import { useInstalledNpmPlugins } from '../installed/useInstalledNpmPlugins';
import { PluginClassificationBadge } from '../PluginClassificationBadge';
import { usePluginsTranslations } from '../usePluginsTranslations';

function MarketplaceDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-medium bg-surface-secondary p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 break-words font-medium">{value}</p>
    </div>
  );
}

interface Props {
  plugin: MarketplacePluginDto;
  onInstall: () => void;
  onManageVersion: () => void;
}

export function MarketplacePluginDetails({ plugin, onInstall, onManageVersion }: Props) {
  const { t } = usePluginsTranslations();
  const { installedByName } = useInstalledNpmPlugins();
  const installedPlugin = installedByName.get(plugin.name);
  const {
    data: dependencyPlan,
    error: planError,
    isFetching: isResolvingDependencies,
  } = usePluginDependencyPlan(
    plugin.dependencies?.length
      ? { packageName: plugin.name, spec: plugin.version ?? undefined, registryId: plugin.registry.id }
      : undefined,
  );
  const isInstalled = installedPlugin !== undefined;
  return (
    <div className="mx-auto grid w-full max-w-6xl items-start gap-6 py-2 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <Card>
        <Card.Header>
          <div className="flex flex-col gap-2">
            <Card.Title>{t('marketplace.about')}</Card.Title>
            {plugin.description ? <Card.Description>{plugin.description}</Card.Description> : null}
          </div>
        </Card.Header>
        <Card.Content className="flex flex-col gap-6">
          <div className="grid gap-3 text-sm sm:grid-cols-2">
            <MarketplaceDetail label={t('marketplace.versionLabel')} value={plugin.version ?? '-'} />
            <MarketplaceDetail label={t('marketplace.publisherLabel')} value={plugin.publisher ?? '-'} />
            <MarketplaceDetail label={t('marketplace.hostCompatibilityLabel')} value={plugin.hostRange ?? '-'} />
            <MarketplaceDetail
              label={t('marketplace.sdkCompatibilityLabel')}
              value={t('marketplace.sdkCompatibilityValue', {
                backend: plugin.sdkCompatibility?.backend ?? '-',
                frontend: plugin.sdkCompatibility?.frontend ?? '-',
              })}
            />
            <MarketplaceDetail label={t('marketplace.licenseLabel')} value={plugin.license ?? '-'} />
            <MarketplaceDetail label={t('marketplace.sourceLabel')} value={plugin.registry.url} />
          </div>
          {plugin.dependencies?.length ? (
            <DependencyPlanDetails
              dependencies={plugin.dependencies}
              plan={dependencyPlan}
              error={dependencyError(planError)}
              loading={isResolvingDependencies}
            />
          ) : null}
          {(plugin.repository || plugin.homepage) && (
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium">{t('marketplace.links')}</span>
              <div className="flex flex-wrap gap-3 text-sm">
                {plugin.repository ? (
                  <a
                    className="inline-flex items-center gap-1 text-primary underline"
                    href={plugin.repository}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {t('marketplace.repository')} <ExternalLink className="size-3" />
                  </a>
                ) : null}
                {plugin.homepage ? (
                  <a
                    className="inline-flex items-center gap-1 text-primary underline"
                    href={plugin.homepage}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {t('marketplace.homepage')} <ExternalLink className="size-3" />
                  </a>
                ) : null}
              </div>
            </div>
          )}
        </Card.Content>
      </Card>
      <Card>
        <Card.Header>
          <div className="flex flex-col gap-2">
            <PluginClassificationBadge classification={plugin.classification} />
            <Card.Title>{isInstalled ? t('marketplace.update') : t('marketplace.install')}</Card.Title>
            <Card.Description>
              {isInstalled ? t('marketplace.updateDescription') : t('marketplace.installDescription')}
            </Card.Description>
          </div>
        </Card.Header>
        <Card.Content className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">{t('marketplace.permissionsLabel')}</span>
            {plugin.permissions.length ? (
              <div className="flex flex-wrap gap-2">
                {plugin.permissions.map((permission) => (
                  <Chip key={permission} variant="soft" color="warning">
                    {permission}
                  </Chip>
                ))}
              </div>
            ) : (
              <span className="text-sm text-muted">{t('noPermissions')}</span>
            )}
          </div>
          {plugin.incompatibilityReason ? <p className="text-sm text-danger">{plugin.incompatibilityReason}</p> : null}
          {plugin.deprecated ? <p className="text-sm text-warning">{t('marketplace.deprecated')}</p> : null}
          <p className="inline-flex items-start gap-2 text-sm text-warning">
            <ShieldCheck className="mt-0.5 size-4 shrink-0" /> {t('marketplace.safetyWarning')}
          </p>
        </Card.Content>
        <Card.Footer>
          <Button
            variant="primary"
            fullWidth
            isDisabled={!isInstalled && !plugin.installable}
            onPress={isInstalled ? onManageVersion : onInstall}
          >
            {isInstalled ? t('manageVersion') : t('marketplace.install')}
          </Button>
        </Card.Footer>
      </Card>
    </div>
  );
}
