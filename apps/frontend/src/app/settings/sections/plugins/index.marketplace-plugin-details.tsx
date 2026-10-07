import { Card, Chip } from '@heroui/react';
import { ExternalLink, ShieldCheck } from 'lucide-react';
import { Button } from '../../../../components/button';
import { PluginClassificationBadge } from './PluginClassificationBadge';

import type { MarketplacePlugin } from './index.contracts';
import type { InstalledNpmPlugin } from './index.contracts';
import type { PluginInstallPlan } from './index.contracts';
import { MarketplaceDetail } from './index.dependency-error.helpers';
import { DependencyPlanDetails } from './index.dependency-error.helpers';

export function MarketplacePluginDetails({
  plugin,
  installedPlugin,
  onInstall,
  onManageVersion,
  dependencyPlan,
  dependencyError,
  isResolvingDependencies,
  t,
}: {
  plugin: MarketplacePlugin;
  installedPlugin?: InstalledNpmPlugin;
  onInstall: () => void;
  onManageVersion: () => void;
  dependencyPlan?: PluginInstallPlan;
  dependencyError: string | null;
  isResolvingDependencies: boolean;
  t: (key: string, values?: Record<string, string>) => string;
}) {
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
              error={dependencyError}
              loading={isResolvingDependencies}
              t={t}
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
