import { StatusAlert, useDateTimeFormatter } from '@attraccess/plugins-frontend-ui';
import { Label, ProgressBar } from '@heroui/react';
import { useWagoTranslations } from '../i18n';
import runtimeMessages from '../managed-runtime.en.json';
import { RuntimeRecoveryControls } from './RuntimeRecoveryControls';
import { RuntimeUpdateDetailsAlert } from './RuntimeUpdateDetailsAlert';
import { RuntimeUpdateSummary } from './RuntimeUpdateSummary';
import { useRuntimeFailureMessages } from './useRuntimeFailureMessages';
import { useRuntimeStatus, type ManagedAccessTarget } from './useRuntimeStatus';

export function RuntimeUpdateDetails({ target }: { target: ManagedAccessTarget }) {
  const { t, language, tBackendMessage } = useWagoTranslations();
  const { failureMessage, errorMessage } = useRuntimeFailureMessages();
  const formatDateTime = useDateTimeFormatter({ showSeconds: true });
  const controllerId = 'controller' in target ? target.controller.id : null;
  const query = useRuntimeStatus(target);
  const status = query.data;
  const summary =
    'controller' in target ? (
      <RuntimeUpdateSummary
        controller={target.controller}
        status={query.isError ? undefined : status}
        unavailable={query.isError}
      />
    ) : null;

  if (query.isError)
    return (
      <>
        {summary}
        <StatusAlert status="warning" title={t('runtimeManagement.unavailable')}>
          {query.error instanceof Error
            ? errorMessage(query.error.message)
            : t('runtimeManagement.unavailableDescription')}
        </StatusAlert>
      </>
    );
  if (!status) return summary ?? <p role="status">{t('runtimeManagement.loading')}</p>;
  if (status.management === 'reenrol_required')
    return (
      <>
        {summary}
        <StatusAlert status="warning" title={t('runtimeManagement.reenrol')}>
          {t('runtimeManagement.reenrolDescription')}
        </StatusAlert>
      </>
    );
  return (
    <>
      {summary}
      <RuntimeUpdateDetailsAlert status={status} />
      <p>
        {t('runtimeManagement.managementLabel')} <strong>{t(`runtimeManagement.states.${status.management}`)}</strong>
      </p>
      {status.management === 'verified' &&
        status.managementSetup &&
        (status.managementSetup.state === 'running' ? (
          <ProgressBar isIndeterminate size="sm">
            <Label>
              {t(
                `runtimeManagement.setup.${Object.hasOwn(runtimeMessages.setup, status.managementSetup.reason) ? status.managementSetup.reason : 'unknown'}`,
              )}
            </Label>
            <ProgressBar.Track>
              <ProgressBar.Fill />
            </ProgressBar.Track>
          </ProgressBar>
        ) : (
          <p role="status">
            {t(
              `runtimeManagement.setup.${Object.hasOwn(runtimeMessages.setup, status.managementSetup.reason) ? status.managementSetup.reason : 'unknown'}`,
            )}
          </p>
        ))}
      {status.managementFailure && (
        <StatusAlert status="warning" title={t('runtimeManagement.lastSetupFailure')}>
          {tBackendMessage(status.managementFailure)}
        </StatusAlert>
      )}
      {status.blocker && <p role="alert">{failureMessage(status.blocker)}</p>}
      <p>
        {t('runtimeManagement.updateLabel')}{' '}
        <strong>
          {status.runtimeUpdateRequired && status.update?.phase === 'current'
            ? t('connectivity.runtime_update')
            : status.update
              ? t(`runtimeManagement.phases.${status.update.phase}`)
              : t('runtimeManagement.waiting')}
        </strong>
      </p>
      {status.update && (
        <>
          <p>
            {t('runtimeManagement.desired')} <code className="wg:break-all">{status.update.desiredImageId}</code>
          </p>
          {status.update.failure && (
            <p role="status">
              {t('runtimeManagement.failure', {
                failure: failureMessage(status.update.failure),
              })}{' '}
              {status.update.retryAt > 0 &&
                t('runtimeManagement.retryAfter', {
                  date: formatDateTime(status.update.retryAt),
                })}
            </p>
          )}
          {!!status.update.storageDiagnostics?.length && (
            <StatusAlert status="warning" title={t('runtimeManagement.storageTitle')}>
              {status.update.storageDiagnostics.map((diagnostic) => (
                <p key={diagnostic.path}>
                  {t('runtimeManagement.storageShortfall', {
                    path: diagnostic.path,
                    required: (diagnostic.requiredKiB / 1024).toLocaleString(language, {
                      maximumFractionDigits: 1,
                    }),
                    available: (diagnostic.availableKiB / 1024).toLocaleString(language, {
                      maximumFractionDigits: 1,
                    }),
                    shortfall: ((diagnostic.requiredKiB - diagnostic.availableKiB) / 1024).toLocaleString(language, {
                      maximumFractionDigits: 1,
                    }),
                  })}
                </p>
              ))}
              <p>{t('runtimeManagement.storageAction')}</p>
              <p>
                {t(
                  status.update.phase === 'failed'
                    ? 'runtimeManagement.previousRuntimeRunning'
                    : 'runtimeManagement.recoveryPending',
                )}
              </p>
            </StatusAlert>
          )}
          {!!status.update.cleanupRetryAt && (
            <p role="status">
              {t('runtimeManagement.cleanup', {
                date: formatDateTime(status.update.cleanupRetryAt),
              })}
            </p>
          )}
        </>
      )}
      <RuntimeRecoveryControls
        status={status}
        controllerId={controllerId}
        statusFailed={query.isError}
        onRefetch={query.refetch}
      />
    </>
  );
}
