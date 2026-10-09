import { Accordion, Alert, Button, Label, ProgressBar } from '@heroui/react';
import { useEffect, useState } from 'react';
import { getRootRecoveryPassword, retryManagedAccess, retryRuntimeUpdate, restoreManagedAccess } from './api';
import { useRuntimeStatus, type ManagedAccessTarget } from './useRuntimeStatus';
import { useWagoTranslations } from './i18n';
import runtimeMessages from './managed-runtime.en.json';
import { RuntimeUpdateSummary } from './RuntimeUpdateSummary';

export function RuntimeUpdateDetails({ target }: { target: ManagedAccessTarget }) {
  const { t, language, tBackendMessage } = useWagoTranslations();
  const failureMessage = (failure: string) =>
    t(`runtimeManagement.failures.${Object.hasOwn(runtimeMessages.failures, failure) ? failure : 'unknown'}`);
  const errorMessage = (message: string) => {
    const failure = /^CC100 runtime update failed: ([a-z_]+)\./.exec(message);
    return failure ? failureMessage(failure[1]) : tBackendMessage(message);
  };
  const controllerId = 'controller' in target ? target.controller.id : null;
  const query = useRuntimeStatus(target);
  const [password, setPassword] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [lifetime] = useState(() => ({ active: true, recoveryExpanded: false, recoveryGeneration: 0 }));
  useEffect(() => {
    lifetime.active = true;
    return () => {
      lifetime.active = false;
    };
  }, [lifetime]);
  useEffect(() => {
    if (query.isError) {
      lifetime.recoveryGeneration++;
      lifetime.recoveryExpanded = false;
      setPassword(null);
    }
  }, [query.isError, lifetime]);
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
        <Alert status="warning">
          <Alert.Content>
            <Alert.Title>{t('runtimeManagement.unavailable')}</Alert.Title>
            <Alert.Description>
              {query.error instanceof Error
                ? errorMessage(query.error.message)
                : t('runtimeManagement.unavailableDescription')}
            </Alert.Description>
          </Alert.Content>
        </Alert>
      </>
    );
  if (!status) return summary ?? <p role="status">{t('runtimeManagement.loading')}</p>;
  if (status.management === 'reenrol_required')
    return (
      <>
        {summary}
        <Alert status="warning">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>{t('runtimeManagement.reenrol')}</Alert.Title>
            <Alert.Description>{t('runtimeManagement.reenrolDescription')}</Alert.Description>
          </Alert.Content>
        </Alert>
      </>
    );
  const action = async (kind: 'password' | 'retry' | 'restore' | 'runtime') => {
    if (!status.sessionId) return;
    const generation = lifetime.recoveryGeneration;
    setPending(true);
    setFailed(null);
    try {
      if (kind === 'password') {
        const result = await getRootRecoveryPassword(status.sessionId);
        if (lifetime.active && lifetime.recoveryExpanded && lifetime.recoveryGeneration === generation)
          setPassword(result.password);
      } else {
        if (kind === 'runtime' && controllerId) await retryRuntimeUpdate(controllerId);
        else if (kind === 'restore') await restoreManagedAccess(status.sessionId);
        else await retryManagedAccess(status.sessionId);
        if (lifetime.active) await query.refetch();
      }
    } catch (error) {
      if (lifetime.active) setFailed(error instanceof Error ? error.message : t('runtimeManagement.actionFailed'));
    } finally {
      if (lifetime.active) setPending(false);
    }
  };
  return (
    <>
      {summary}
      <Alert
        status={
          status.management === 'managed' &&
          status.update?.phase === 'current' &&
          !status.blocker &&
          !status.runtimeUpdateRequired
            ? 'success'
            : 'warning'
        }
      >
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>
            {status.management === 'managed'
              ? t('runtimeManagement.automatic')
              : status.management === 'verified'
                ? t('runtimeManagement.setupTitle')
                : status.management === 'retired'
                  ? t('runtimeManagement.retired')
                  : t('runtimeManagement.attention')}
          </Alert.Title>
          <Alert.Description>
            {status.management === 'retired'
              ? t('runtimeManagement.retiredDescription')
              : status.management !== 'managed'
                ? Object.hasOwn(runtimeMessages.stateDescriptions, status.management)
                  ? t(`runtimeManagement.stateDescriptions.${status.management}`)
                  : t('runtimeManagement.actionFailed')
                : t('runtimeManagement.automaticDescription')}
          </Alert.Description>
        </Alert.Content>
      </Alert>
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
        <Alert status="warning">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>{t('runtimeManagement.lastSetupFailure')}</Alert.Title>
            <Alert.Description>{tBackendMessage(status.managementFailure)}</Alert.Description>
          </Alert.Content>
        </Alert>
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
                t('runtimeManagement.retryAfter', { date: new Date(status.update.retryAt).toLocaleString(language) })}
            </p>
          )}
          {!!status.update.storageDiagnostics?.length && (
            <Alert status="warning">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Title>{t('runtimeManagement.storageTitle')}</Alert.Title>
                <Alert.Description>
                  {status.update.storageDiagnostics.map((diagnostic) => (
                    <p key={diagnostic.path}>
                      {t('runtimeManagement.storageShortfall', {
                        path: diagnostic.path,
                        required: (diagnostic.requiredKiB / 1024).toLocaleString(language, { maximumFractionDigits: 1 }),
                        available: (diagnostic.availableKiB / 1024).toLocaleString(language, { maximumFractionDigits: 1 }),
                        shortfall: ((diagnostic.requiredKiB - diagnostic.availableKiB) / 1024).toLocaleString(language, { maximumFractionDigits: 1 }),
                      })}
                    </p>
                  ))}
                  <p>{t('runtimeManagement.storageAction')}</p>
                  <p>{t(status.update.phase === 'failed' ? 'runtimeManagement.previousRuntimeRunning' : 'runtimeManagement.recoveryPending')}</p>
                </Alert.Description>
              </Alert.Content>
            </Alert>
          )}
          {!!status.update.cleanupRetryAt && (
            <p role="status">
              {t('runtimeManagement.cleanup', {
                date: new Date(status.update.cleanupRetryAt).toLocaleString(language),
              })}
            </p>
          )}
        </>
      )}
      <Accordion>
        <Accordion.Item
          onExpandedChange={(expanded) => {
            lifetime.recoveryExpanded = expanded;
            if (!expanded) {
              lifetime.recoveryGeneration++;
              setPassword(null);
            }
          }}
        >
          <Accordion.Heading>
            <Accordion.Trigger>
              {t('runtimeManagement.administratorRecovery')}
              <Accordion.Indicator />
            </Accordion.Trigger>
          </Accordion.Heading>
          <Accordion.Panel>
            <Accordion.Body>
              {status.management === 'recovery_required' && (
                <Button variant="secondary" isPending={pending} onPress={() => void action('retry')}>
                  {t('runtimeManagement.retryAccess')}
                </Button>
              )}
              {controllerId &&
                status.management === 'managed' &&
                status.update &&
                (['failed', 'blocked', 'recovery_required'].includes(status.update.phase) ||
                  !!status.update.cleanupRetryAt) && (
                  <Button variant="secondary" isPending={pending} onPress={() => void action('runtime')}>
                    {t('runtimeManagement.retryRuntime')}
                  </Button>
                )}
              <p className="wg:mb-3 wg:text-sm wg:text-muted">{t('runtimeManagement.recoveryDescription')}</p>
              <Button
                fullWidth
                className="wg:h-auto wg:min-h-8 wg:whitespace-normal wg:py-2"
                size="sm"
                variant="secondary"
                isDisabled={pending || !status.sessionId}
                onPress={() => (password ? setPassword(null) : void action('password'))}
              >
                {t(password ? 'runtimeManagement.hidePassword' : 'runtimeManagement.revealPassword')}
              </Button>
              {password && (
                <code className="wg:break-all" aria-label={t('runtimeManagement.passwordLabel')}>
                  {password}
                </code>
              )}
              <p className="wg:text-sm wg:text-muted">{t('runtimeManagement.restoreDescription')}</p>
              <Button
                fullWidth
                className="wg:h-auto wg:min-h-8 wg:whitespace-normal wg:py-2"
                size="sm"
                variant="secondary"
                isDisabled={pending || !status.sessionId}
                onPress={() => void action('restore')}
              >
                {t('runtimeManagement.restore')}
              </Button>
            </Accordion.Body>
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>
      {failed && <p role="alert">{errorMessage(failed)}</p>}
    </>
  );
}
