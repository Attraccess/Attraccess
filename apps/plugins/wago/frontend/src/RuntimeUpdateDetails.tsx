import { RuntimeRecoveryControls } from './RuntimeRecoveryControls';
import { Alert, Label, ProgressBar } from '@heroui/react';
import { type ManagedAccessTarget } from './useRuntimeStatus';
import runtimeMessages from './managed-runtime.en.json';
import { useRuntimeUpdateDetailsState } from './useRuntimeUpdateDetailsState';
import { RuntimeUpdateDetailsAlert } from './RuntimeUpdateDetailsAlert';

export function RuntimeUpdateDetails({ target }: { target: ManagedAccessTarget }) {
  const model = useRuntimeUpdateDetailsState({ target });

  if (model.query.isError)
    return (
      <>
        {model.summary}
        <Alert status="warning">
          <Alert.Content>
            <Alert.Title>{model.t('runtimeManagement.unavailable')}</Alert.Title>
            <Alert.Description>
              {model.query.error instanceof Error
                ? model.errorMessage(model.query.error.message)
                : model.t('runtimeManagement.unavailableDescription')}
            </Alert.Description>
          </Alert.Content>
        </Alert>
      </>
    );
  if (!model.status) return model.summary ?? <p role="status">{model.t('runtimeManagement.loading')}</p>;
  if (model.status.management === 'reenrol_required')
    return (
      <>
        {model.summary}
        <Alert status="warning">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>{model.t('runtimeManagement.reenrol')}</Alert.Title>
            <Alert.Description>{model.t('runtimeManagement.reenrolDescription')}</Alert.Description>
          </Alert.Content>
        </Alert>
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
        <Alert status="warning">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>{model.t('runtimeManagement.lastSetupFailure')}</Alert.Title>
            <Alert.Description>{model.tBackendMessage(model.status.managementFailure)}</Alert.Description>
          </Alert.Content>
        </Alert>
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
                  date: new Date(model.status.update.retryAt).toLocaleString(model.language),
                })}
            </p>
          )}
          {!!model.status.update.storageDiagnostics?.length && (
            <Alert status="warning">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Title>{model.t('runtimeManagement.storageTitle')}</Alert.Title>
                <Alert.Description>
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
                </Alert.Description>
              </Alert.Content>
            </Alert>
          )}
          {!!model.status.update.cleanupRetryAt && (
            <p role="status">
              {model.t('runtimeManagement.cleanup', {
                date: new Date(model.status.update.cleanupRetryAt).toLocaleString(model.language),
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
