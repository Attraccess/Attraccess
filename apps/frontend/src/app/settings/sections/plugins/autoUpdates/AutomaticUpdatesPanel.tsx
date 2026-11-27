import { StatusAlert } from '@attraccess/plugins-frontend-ui';
import { usePluginControllerUpdatePolicy } from '@attraccess/react-query-client';
import { Card, Spinner } from '@heroui/react';
import { usePluginsTranslations } from '../usePluginsTranslations';
import { AutomaticUpdatesForm } from './AutomaticUpdatesForm';

/** Whether, and when, installed plugins update themselves. */
export function AutomaticUpdatesPanel() {
  const { t } = usePluginsTranslations();
  const { data: policy, isError } = usePluginControllerUpdatePolicy();
  return (
    <Card data-cy="plugins-auto-updates-panel">
      <Card.Header>
        <Card.Title>{t('autoUpdates.title')}</Card.Title>
        <Card.Description>{t('autoUpdates.description')}</Card.Description>
      </Card.Header>
      <Card.Content>
        {policy ? (
          <AutomaticUpdatesForm policy={policy} />
        ) : isError ? (
          <StatusAlert status="danger" title={t('autoUpdates.loadError')} />
        ) : (
          <Spinner />
        )}
      </Card.Content>
    </Card>
  );
}
