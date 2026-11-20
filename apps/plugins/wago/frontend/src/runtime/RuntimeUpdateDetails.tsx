import { StatusAlert } from '@attraccess/plugins-frontend-ui';
import { Label, ProgressBar } from '@heroui/react';
import { useEffect, useState } from 'react';
import { getRootRecoveryPassword, restoreManagedAccess, retryManagedAccess, retryRuntimeUpdate } from '../api/client';
import { useWagoTranslations } from '../i18n';
import runtimeMessages from '../managed-runtime.en.json';
import { RuntimeRecoveryControls, type RuntimeRecoveryAction } from './RuntimeRecoveryControls';
import { RuntimeUpdateDetailsAlert } from './RuntimeUpdateDetailsAlert';
import { RuntimeUpdateProgress } from './RuntimeUpdateProgress';
import { RuntimeUpdateSummary } from './RuntimeUpdateSummary';
import { useRuntimeFailureMessages } from './useRuntimeFailureMessages';
import { useRuntimeStatus, type ManagedAccessTarget } from './useRuntimeStatus';

export function RuntimeUpdateDetails({ target }: { target: ManagedAccessTarget }) {
  const { t, tBackendMessage } = useWagoTranslations();
  const { failureMessage, errorMessage } = useRuntimeFailureMessages();
  const controllerId = 'controller' in target ? target.controller.id : null;
  const query = useRuntimeStatus(target);
  const status = query.data;
  // Recovery state stays here: a status-query error unmounts RuntimeRecoveryControls, but a running
  // restore or retry must stay pending and its failure must still show once the status returns.
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

  const setupMessage = (reason: string) =>
    t(`runtimeManagement.setup.${Object.hasOwn(runtimeMessages.setup, reason) ? reason : 'unknown'}`);

  const action = async (kind: RuntimeRecoveryAction) => {
    const sessionId = status?.sessionId;
    if (!sessionId) return;
    const generation = lifetime.recoveryGeneration;
    setPending(true);
    setFailed(null);
    try {
      if (kind === 'password') {
        const result = await getRootRecoveryPassword(sessionId);
        if (lifetime.active && lifetime.recoveryExpanded && lifetime.recoveryGeneration === generation)
          setPassword(result.password);
      } else {
        if (kind === 'runtime' && controllerId) await retryRuntimeUpdate(controllerId);
        else if (kind === 'restore') await restoreManagedAccess(sessionId);
        else await retryManagedAccess(sessionId);
        if (lifetime.active) await query.refetch();
      }
    } catch (error) {
      if (lifetime.active) setFailed(error instanceof Error ? error.message : t('runtimeManagement.actionFailed'));
    } finally {
      if (lifetime.active) setPending(false);
    }
  };
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
            <Label>{setupMessage(status.managementSetup.reason)}</Label>
            <ProgressBar.Track>
              <ProgressBar.Fill />
            </ProgressBar.Track>
          </ProgressBar>
        ) : (
          <p role="status">{setupMessage(status.managementSetup.reason)}</p>
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
      {status.update && <RuntimeUpdateProgress update={status.update} />}
      <RuntimeRecoveryControls
        status={status}
        controllerId={controllerId}
        password={password}
        pending={pending}
        onAction={(kind) => void action(kind)}
        onHidePassword={() => setPassword(null)}
        onExpandedChange={(expanded) => {
          lifetime.recoveryExpanded = expanded;
          if (!expanded) {
            lifetime.recoveryGeneration++;
            setPassword(null);
          }
        }}
      />
      {failed && <p role="alert">{errorMessage(failed)}</p>}
    </>
  );
}
