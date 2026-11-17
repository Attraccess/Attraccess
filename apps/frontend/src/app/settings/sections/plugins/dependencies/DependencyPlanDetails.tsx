import type { PluginDependencyInfo, PluginDependencyPlanDto } from '@attraccess/react-query-client';
import { Card, Chip } from '@heroui/react';
import { PluginClassificationBadge } from '../PluginClassificationBadge';
import { usePluginsTranslations } from '../usePluginsTranslations';

interface Props {
  dependencies: PluginDependencyInfo[];
  plan?: PluginDependencyPlanDto;
  error: string | null;
  loading: boolean;
}

export function DependencyPlanDetails({ dependencies, plan, error, loading }: Props) {
  const { t } = usePluginsTranslations();
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
