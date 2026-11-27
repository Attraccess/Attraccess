import { StatusAlert } from '@attraccess/plugins-frontend-ui';
import { usePluginControllerUpdatePolicy } from '@attraccess/react-query-client';
import { Spinner } from '@heroui/react';
import { useId } from 'react';
import { usePluginsTranslations } from '../usePluginsTranslations';
import { AutomaticUpdatesForm } from './AutomaticUpdatesForm';

/** Whether, and when, installed plugins update themselves. */
export function AutomaticUpdatesPanel() {
  const { t } = usePluginsTranslations();
  const { data: policy, isError } = usePluginControllerUpdatePolicy();
  const titleId = useId();
  return (
    // Not a Card: the form fields would be hard to see on its surface.
    <section
      aria-labelledby={titleId}
      className="flex flex-col gap-4 rounded-lg border border-divider p-4"
      data-cy="plugins-auto-updates-panel"
    >
      <div className="flex flex-col gap-1">
        <h3 id={titleId} className="font-semibold text-foreground">
          {t('autoUpdates.title')}
        </h3>
        <p className="text-sm text-muted">{t('autoUpdates.description')}</p>
      </div>
      {policy ? (
        <AutomaticUpdatesForm policy={policy} />
      ) : isError ? (
        <StatusAlert status="danger" title={t('autoUpdates.loadError')} />
      ) : (
        <Spinner />
      )}
    </section>
  );
}
