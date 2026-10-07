import { Alert, ProgressBar, Spinner } from '@heroui/react';
import { AlertCircleIcon, CheckCircle2Icon, CpuIcon } from 'lucide-react';
import { CommissioningSession } from './api';
import { commissioningLabel } from './ControllersTable';
import { useWagoTranslations } from './i18n';
import { parseActivityLog } from './CommissioningModal.parse-activity-log';
import { canRecover } from './CommissioningModal.can-recover';

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
