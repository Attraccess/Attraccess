import { Alert } from '@heroui/react';
import { ProgressBar } from '@heroui/react';
import { Spinner } from '@heroui/react';
import { AlertCircleIcon } from 'lucide-react';
import { CheckCircle2Icon } from 'lucide-react';
import { CpuIcon } from 'lucide-react';
import type { CommissioningSession } from './api';
import { commissioningLabel } from './ControllersTable';
import { useWagoTranslations } from './i18n';
import { parseActivityLog } from './CommissioningModal.error-alert.helpers';
import { canRecover } from './CommissioningModal.activity-log.helpers';
import { Button } from '@heroui/react';
import { useCommissioningVerification } from './useCommissioningVerification';
import { SummaryField } from './CommissioningModal.recovery-fields.helpers';

export function CommissioningStatusPanel({ isActive, session }: { isActive: boolean; session: CommissioningSession }) {
  const { t, tBackendMessage } = useWagoTranslations();
  const percent = session.progressPercent ?? 0;
  const isQueued = session.state === 'awaiting_delivery';
  const hasFailure = !isActive && Boolean(session.failureReason);
  const failedCheckpoint = hasFailure
    ? parseActivityLog(session.auditLog)
        .filter(({ event }) => event.startsWith('progress: '))
        .at(-1)
        ?.event.slice('progress: '.length)
    : null;
  const title = isQueued
    ? t('commissioningUI.approvalRequired')
    : (session.progressStep ?? (isActive ? t('commissioningUI.preparing') : commissioningLabel(session.state, t)));
  const detail = isQueued
    ? t('commissioningUI.approvalDescription')
    : (session.progressDetail ?? t('commissioningUI.waiting'));
  if (hasFailure) {
    return (
      <Alert status="danger">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>{t('commissioningUI.deliveryError')}</Alert.Title>
          <Alert.Description>
            <p>{tBackendMessage(session.failureReason)}</p>
            {failedCheckpoint && (
              <p>{t('commissioningUI.failedDuring', { step: tBackendMessage(failedCheckpoint) })}</p>
            )}
            <p>{t('commissioningUI.failedHost', { host: session.targetHost })}</p>
            <p>
              {t(
                canRecover(session) || session.dockerProvisionState
                  ? 'commissioningUI.cleanupNext'
                  : 'commissioningUI.retryNext',
              )}
            </p>
          </Alert.Description>
        </Alert.Content>
      </Alert>
    );
  }
  return (
    <div aria-live="polite" className="wg:rounded-large wg:border wg:border-primary/30 wg:bg-primary/5 wg:p-4">
      <div className="wg:flex wg:items-start wg:gap-3">
        {isActive ? (
          <Spinner color="accent" size="sm" />
        ) : hasFailure ? (
          <AlertCircleIcon className="wg:h-6 wg:w-6 wg:shrink-0 wg:text-danger" />
        ) : isQueued ? (
          <CpuIcon className="wg:h-6 wg:w-6 wg:shrink-0 wg:text-muted" />
        ) : (
          <CheckCircle2Icon className="wg:h-6 wg:w-6 wg:shrink-0 wg:text-success" />
        )}
        <div className="wg:min-w-0 wg:flex-1">
          <div className="wg:flex wg:items-center wg:justify-between wg:gap-3">
            <p className="wg:font-medium">{tBackendMessage(title)}</p>
            <span className="wg:text-sm wg:text-muted">{percent}%</span>
          </div>
          <p className="wg:mt-1 wg:text-sm wg:text-muted">{tBackendMessage(detail)}</p>
          <ProgressBar
            className="wg:mt-3"
            aria-label={tBackendMessage(title)}
            value={percent}
            color={hasFailure ? 'danger' : 'accent'}
            size="sm"
          >
            <ProgressBar.Track>
              <ProgressBar.Fill />
            </ProgressBar.Track>
          </ProgressBar>
        </div>
      </div>
    </div>
  );
}

export /** Read-only recap once commissioning evidence and runtime setup are both verified; nothing here still needs action. */
function CompletedSessionSummary({
  session,
  verification,
  onConfigure,
}: {
  session: CommissioningSession;
  verification: ReturnType<typeof useCommissioningVerification>;
  onConfigure?: (controllerId: number) => void;
}) {
  const { t, language, tBackendMessage } = useWagoTranslations();
  const controllerId = verification.data?.controllerId ?? session.managementControllerId ?? null;
  return (
    <div className="wg:space-y-4">
      <Alert status="success">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>{t('commissioningUI.complete')}</Alert.Title>
          <Alert.Description>
            {t('commissioningUI.completeDescription', { name: session.controllerName ?? session.hardwareId })}
          </Alert.Description>
        </Alert.Content>
      </Alert>
      <dl className="wg:grid wg:gap-3 wg:text-sm wg:sm:grid-cols-2">
        <SummaryField label={t('commissioningUI.hardwareId')} value={session.hardwareId} />
        <SummaryField label={t('commissioningUI.firmware')} value={session.firmwareBaseline} />
        <SummaryField
          label={t('commissioningUI.claimed')}
          value={new Date(session.updatedAt).toLocaleString(language)}
        />
        <SummaryField
          label={t('commissioningUI.management')}
          value={tBackendMessage(verification.data?.managementHardening ?? t('commissioningUI.unverified'))}
        />
      </dl>
      {onConfigure && controllerId && (
        <Button onPress={() => onConfigure(controllerId)}>{t('commissioningUI.configure')}</Button>
      )}
    </div>
  );
}
