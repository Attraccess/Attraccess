import { Button } from '@attraccess/plugins-frontend-ui';
import { Accordion } from '@heroui/react';
import type { RuntimeUpdateStatus } from '../api/client';
import { useWagoTranslations } from '../i18n';

export type RuntimeRecoveryAction = 'password' | 'retry' | 'restore' | 'runtime';

interface RuntimeRecoveryControlsProps {
  status: RuntimeUpdateStatus;
  /** Set for an enrolled controller; recovery then also offers retrying the runtime update. */
  controllerId: number | null;
  /** The revealed root recovery password, if any. */
  password: string | null;
  /** A recovery action is running; RuntimeUpdateDetails owns it so it survives a status-query error. */
  pending: boolean;
  onAction: (kind: RuntimeRecoveryAction) => void;
  onHidePassword: () => void;
  onExpandedChange: (expanded: boolean) => void;
}

export function RuntimeRecoveryControls({
  status,
  controllerId,
  password,
  pending,
  onAction,
  onHidePassword,
  onExpandedChange,
}: RuntimeRecoveryControlsProps) {
  const { t } = useWagoTranslations();
  return (
    <Accordion>
      <Accordion.Item onExpandedChange={onExpandedChange}>
        <Accordion.Heading>
          <Accordion.Trigger>
            {t('runtimeManagement.administratorRecovery')}
            <Accordion.Indicator />
          </Accordion.Trigger>
        </Accordion.Heading>
        <Accordion.Panel>
          <Accordion.Body>
            {status.management === 'recovery_required' && (
              <Button variant="secondary" isPending={pending} onPress={() => onAction('retry')}>
                {t('runtimeManagement.retryAccess')}
              </Button>
            )}
            {controllerId &&
              status.management === 'managed' &&
              status.update &&
              (['failed', 'blocked', 'recovery_required'].includes(status.update.phase) ||
                !!status.update.cleanupRetryAt) && (
                <Button variant="secondary" isPending={pending} onPress={() => onAction('runtime')}>
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
              onPress={() => (password ? onHidePassword() : onAction('password'))}
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
              onPress={() => onAction('restore')}
            >
              {t('runtimeManagement.restore')}
            </Button>
          </Accordion.Body>
        </Accordion.Panel>
      </Accordion.Item>
    </Accordion>
  );
}
