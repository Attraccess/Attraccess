import { Button } from '@attraccess/plugins-frontend-ui';
import { Accordion } from '@heroui/react';
import { useEffect, useState } from 'react';
import {
  getRootRecoveryPassword,
  restoreManagedAccess,
  retryManagedAccess,
  retryRuntimeUpdate,
  type RuntimeUpdateStatus,
} from '../api/client';
import { useWagoTranslations } from '../i18n';
import { useRuntimeFailureMessages } from './useRuntimeFailureMessages';

interface RuntimeRecoveryControlsProps {
  status: RuntimeUpdateStatus;
  /** Set for an enrolled controller; recovery then also offers retrying the runtime update. */
  controllerId: number | null;
  /** The status query failed; a revealed password and the expanded state are discarded. */
  statusFailed: boolean;
  onRefetch: () => Promise<unknown>;
}

export function RuntimeRecoveryControls({
  status,
  controllerId,
  statusFailed,
  onRefetch,
}: RuntimeRecoveryControlsProps) {
  const { t } = useWagoTranslations();
  const { errorMessage } = useRuntimeFailureMessages();
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
    if (statusFailed) {
      lifetime.recoveryGeneration++;
      lifetime.recoveryExpanded = false;
      setPassword(null);
    }
  }, [statusFailed, lifetime]);

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
        if (lifetime.active) await onRefetch();
      }
    } catch (error) {
      if (lifetime.active) setFailed(error instanceof Error ? error.message : t('runtimeManagement.actionFailed'));
    } finally {
      if (lifetime.active) setPending(false);
    }
  };

  return (
    <>
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
