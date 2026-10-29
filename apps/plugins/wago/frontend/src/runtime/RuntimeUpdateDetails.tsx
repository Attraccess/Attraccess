import { StatusAlert, useDateTimeFormatter } from '@attraccess/plugins-frontend-ui';
import { RuntimeRecoveryControls } from './RuntimeRecoveryControls';
import { Label, ProgressBar } from '@heroui/react';
import { type ManagedAccessTarget } from './useRuntimeStatus';
import runtimeMessages from '../managed-runtime.en.json';
import { useRuntimeUpdateDetailsState } from './useRuntimeUpdateDetailsState';
import { RuntimeUpdateDetailsAlert } from './RuntimeUpdateDetailsAlert';

export function RuntimeUpdateDetails({ target }: { target: ManagedAccessTarget }) {
  const formatDateTime = useDateTimeFormatter({ showSeconds: true });
  const model = useRuntimeUpdateDetailsState({ target });

  if (model.query.isError)
    return (
      <>
        {model.summary}
        <StatusAlert status="warning" title={model.t('runtimeManagement.unavailable')}>
          {model.query.error instanceof Error
            ? model.errorMessage(model.query.error.message)
            : model.t('runtimeManagement.unavailableDescription')}
        </StatusAlert>
      </>
    );
  if (!model.status) return model.summary ?? <p role="status">{model.t('runtimeManagement.loading')}</p>;
  if (model.status.management === 'reenrol_required')
    return (
      <>
        {model.summary}
        <StatusAlert status="warning" title={model.t('runtimeManagement.reenrol')}>
          {model.t('runtimeManagement.reenrolDescription')}
        </StatusAlert>
      </>
    );
  return (
    <>
      {model.summary}
      <RuntimeUpdateDetailsAlert {...model} />
      <p>
        {model.t('runtimeManagement.managementLabel')}{' '}
        <strong>{model.t(`runtimeManagement.states.${model.status.management}`)}</strong>
      </p>
      {model.status.management === 'verified' &&
        model.status.managementSetup &&
        (model.status.managementSetup.state === 'running' ? (
          <ProgressBar isIndeterminate size="sm">
            <Label>
              {model.t(
                `runtimeManagement.setup.${Object.hasOwn(runtimeMessages.setup, model.status.managementSetup.reason) ? model.status.managementSetup.reason : 'unknown'}`,
              )}
            </Label>
            <ProgressBar.Track>
              <ProgressBar.Fill />
            </ProgressBar.Track>
          </ProgressBar>
        ) : (
          <p role="status">
            {model.t(
              `runtimeManagement.setup.${Object.hasOwn(runtimeMessages.setup, model.status.managementSetup.reason) ? model.status.managementSetup.reason : 'unknown'}`,
            )}
          </p>
        ))}
      {model.status.managementFailure && (
        <StatusAlert status="warning" title={model.t('runtimeManagement.lastSetupFailure')}>
          {model.tBackendMessage(model.status.managementFailure)}
        </StatusAlert>
      )}
      {model.status.blocker && <p role="alert">{model.failureMessage(model.status.blocker)}</p>}
      <p>
        {model.t('runtimeManagement.updateLabel')}{' '}
        <strong>
          {model.status.runtimeUpdateRequired && model.status.update?.phase === 'current'
            ? model.t('connectivity.runtime_update')
            : model.status.update
              ? model.t(`runtimeManagement.phases.${model.status.update.phase}`)
              : model.t('runtimeManagement.waiting')}
        </strong>
      </p>
      {model.status.update && (
        <>
          <p>
            {model.t('runtimeManagement.desired')}{' '}
            <code className="wg:break-all">{model.status.update.desiredImageId}</code>
          </p>
          {model.status.update.failure && (
            <p role="status">
              {model.t('runtimeManagement.failure', {
                failure: model.failureMessage(model.status.update.failure),
              })}{' '}
              {model.status.update.retryAt > 0 &&
                model.t('runtimeManagement.retryAfter', {
                  date: formatDateTime(model.status.update.retryAt),
                })}
            </p>
          )}
          {!!model.status.update.storageDiagnostics?.length && (
            <StatusAlert status="warning" title={model.t('runtimeManagement.storageTitle')}>
              {model.status.update.storageDiagnostics.map((diagnostic) => (
                <p key={diagnostic.path}>
                  {model.t('runtimeManagement.storageShortfall', {
                    path: diagnostic.path,
                    required: (diagnostic.requiredKiB / 1024).toLocaleString(model.language, {
                      maximumFractionDigits: 1,
                    }),
                    available: (diagnostic.availableKiB / 1024).toLocaleString(model.language, {
                      maximumFractionDigits: 1,
                    }),
                    shortfall: ((diagnostic.requiredKiB - diagnostic.availableKiB) / 1024).toLocaleString(
                      model.language,
                      { maximumFractionDigits: 1 },
                    ),
                  })}
                </p>
              ))}
              <p>{model.t('runtimeManagement.storageAction')}</p>
              <p>
                {model.t(
                  model.status.update.phase === 'failed'
                    ? 'runtimeManagement.previousRuntimeRunning'
                    : 'runtimeManagement.recoveryPending',
                )}
              </p>
            </StatusAlert>
          )}
          {!!model.status.update.cleanupRetryAt && (
            <p role="status">
              {model.t('runtimeManagement.cleanup', {
                date: formatDateTime(model.status.update.cleanupRetryAt),
              })}
            </p>
          )}
        </>
      )}
      <RuntimeRecoveryControls model={model} />
      {model.failed && <p role="alert">{model.errorMessage(model.failed)}</p>}
    </>
  );
}
