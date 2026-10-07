import { useEffect, useState } from 'react';
import { useRuntimeStatus, type ManagedAccessTarget } from './useRuntimeStatus';
import { useWagoTranslations } from './i18n';
import runtimeMessages from './managed-runtime.en.json';
import { RuntimeUpdateSummary } from './RuntimeUpdateSummary';
export function useRuntimeUpdateDetailsState({ target }: { target: ManagedAccessTarget }) {
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
  return {
    t,
    language,
    tBackendMessage,
    failureMessage,
    errorMessage,
    controllerId,
    query,
    password,
    setPassword,
    pending,
    setPending,
    failed,
    setFailed,
    lifetime,
    status,
    summary,
    action,
  } as const;
}

import { getRootRecoveryPassword, retryManagedAccess, retryRuntimeUpdate, restoreManagedAccess } from './api';
