import { Card } from '@heroui/react';
import { Chip } from '@heroui/react';
import { PluginClassificationBadge } from './PluginClassificationBadge';
import type { PluginDependency } from './index.contracts';
import type { PluginInstallPlan } from './index.contracts';
import type { PluginSystemStatusDto } from '@attraccess/react-query-client';
import { SERVER_STATUS_REQUEST_TIMEOUT_MS } from './index.state';
export function dependencyError(error: unknown): string | null {
  if (!error) return null;
  const body = (error as { body?: { message?: unknown } }).body;
  return typeof body?.message === 'string' ? body.message : error instanceof Error ? error.message : String(error);
}

export function DependencyPlanDetails({
  dependencies,
  plan,
  error,
  loading,
  t,
}: {
  dependencies: PluginDependency[];
  plan?: PluginInstallPlan;
  error: string | null;
  loading: boolean;
  t: (key: string, values?: Record<string, string>) => string;
}) {
  return (
    <Card>
      <Card.Header>
        <Card.Title>{t('dependencies.title')}</Card.Title>
        <Card.Description>{t('dependencies.description')}</Card.Description>
      </Card.Header>
      <Card.Content className="flex flex-col gap-3">
        {dependencies.map((dependency) => (
          <p key={dependency.name} className="break-words text-sm">
            {dependency.name} · {dependency.version} ·{' '}
            {t(dependency.required ? 'dependencies.required' : 'dependencies.optional')}
          </p>
        ))}
        {loading ? <p role="status">{t('dependencies.loading')}</p> : null}
        {error ? (
          <p role="alert" className="break-words text-danger">
            {error}
          </p>
        ) : null}
        {!error &&
          !loading &&
          plan?.plugins
            .filter((plugin) => plugin.name !== plan.root)
            .map((plugin) => (
              <Card key={plugin.name}>
                <Card.Content className="flex flex-col gap-2 pt-3">
                  <p className="break-words font-medium">
                    {plugin.displayName} · {plugin.version}
                  </p>
                  <p className="break-words text-sm text-muted">{plugin.name}</p>
                  {plugin.registryUrl ? (
                    <p className="break-words text-sm text-muted">
                      {t('marketplace.source', { registry: plugin.registryUrl })}
                    </p>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    <Chip size="sm" color={plugin.action === 'reuse' ? 'success' : 'accent'}>
                      {t(`dependencies.${plugin.action}`)}
                    </Chip>
                    <PluginClassificationBadge classification={plugin.classification} />
                  </div>
                  <p className="break-words text-sm">
                    {t('marketplace.permissions', { permissions: plugin.permissions.join(', ') || t('noPermissions') })}
                  </p>
                </Card.Content>
              </Card>
            ))}
      </Card.Content>
    </Card>
  );
}

export async function getServerInstanceId(getStatus: () => Promise<PluginSystemStatusDto | undefined>) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const status = await Promise.race([
    getStatus(),
    new Promise<never>((_, reject) => {
      timeout = setTimeout(
        () => reject(new Error('Plugin system status request timed out')),
        SERVER_STATUS_REQUEST_TIMEOUT_MS,
      );
    }),
  ]).finally(() => clearTimeout(timeout));
  if (!status || typeof status.instanceId !== 'string') throw new Error('Plugin system instance ID is missing');
  return status.instanceId;
}
export function MarketplaceDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-medium bg-surface-secondary p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 break-words font-medium">{value}</p>
    </div>
  );
}
