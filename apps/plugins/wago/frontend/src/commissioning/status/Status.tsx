import { Alert, Button, ProgressBar, Spinner } from '@heroui/react';
import { AlertCircleIcon, CheckCircle2Icon, CpuIcon } from 'lucide-react';
import { CommissioningSession } from '../../api/client';
import { commissioningLabel } from '../../controllers/Table';
import { useWagoTranslations } from '../../i18n';
import { canRecover } from '../model';
import { formatActivity } from '../model';
import { parseActivityLog } from '../model';
import { CommissioningSecurityPanel } from './SecurityPanel';
import { useCommissioningVerification } from './useCommissioningVerification';

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

export function VerificationStatus({
  session,
  onConfigure,
}: {
  session: CommissioningSession;
  onConfigure?: (controllerId: number) => void;
}) {
  const { t, tBackendMessage } = useWagoTranslations();
  const verification = useCommissioningVerification(session);
  const controllerId = verification.data?.controllerId;
  const managementControllerId = controllerId ?? session.managementControllerId;
  return (
    <div className="wg:space-y-3">
      <Alert status={verification.enrollmentComplete ? 'success' : 'warning'}>
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>
            {t(verification.enrollmentComplete ? 'commissioningUI.enrolled' : 'commissioningUI.verifying')}
          </Alert.Title>
          <Alert.Description>
            {verification.unavailable ? (
              t('commissioningUI.verificationUnavailable')
            ) : verification.data ? (
              <ul>
                <li>
                  {t('commissioningUI.heartbeat', {
                    status: t(
                      verification.data.permanentConnection ? 'commissioningUI.received' : 'commissioningUI.pending',
                    ),
                  })}
                </li>
                <li>
                  {t('commissioningUI.credentialRevoked', {
                    status: t(
                      verification.data.enrollmentRevoked ? 'commissioningUI.verified' : 'commissioningUI.pending',
                    ),
                  })}
                </li>
              </ul>
            ) : (
              t('commissioningUI.checkingEvidence')
            )}
          </Alert.Description>
        </Alert.Content>
      </Alert>
      {verification.data && (
        <section aria-label={t('commissioningUI.qualification')}>
          <h3>
            {t(verification.runtimeVerified ? 'commissioningUI.configurationVerified' : 'commissioningUI.setupChecks')}
          </h3>
          <ul>
            <li>
              {t('commissioningUI.configuration', {
                status: t(
                  verification.data.configurationApplied ? 'commissioningUI.applied' : 'commissioningUI.pending',
                ),
              })}
            </li>
            <li>
              {t('commissioningUI.hardwareProbe', {
                status: tBackendMessage(verification.data.hardwareReadiness ?? t('commissioningUI.unverified')),
              })}
            </li>
            <li>
              {t('commissioningUI.managementStatus', {
                status: tBackendMessage(verification.data.managementHardening),
              })}
            </li>
            <li>{t('commissioningUI.physicalQualification')}</li>
          </ul>
        </section>
      )}
      {managementControllerId && (
        <>
          {onConfigure && controllerId && (
            <Button onPress={() => onConfigure(controllerId)}>{t('commissioningUI.configure')}</Button>
          )}
          <CommissioningSecurityPanel key={session.id} sessionId={session.id} controllerId={managementControllerId} />
        </>
      )}
    </div>
  );
}

export function OperationStatus({ title, description }: { title: string; description: string }) {
  return (
    <div aria-live="polite" className="wg:rounded-large wg:border wg:border-primary/30 wg:bg-primary/5 wg:p-3">
      <div className="wg:flex wg:items-center wg:gap-2">
        <Spinner color="accent" size="sm" />
        <p className="wg:text-sm wg:font-medium">{title}</p>
      </div>
      <p className="wg:mt-1 wg:text-xs wg:text-muted">{description}</p>
      <ProgressBar className="wg:mt-3" aria-label={title} isIndeterminate size="sm">
        <ProgressBar.Track>
          <ProgressBar.Fill />
        </ProgressBar.Track>
      </ProgressBar>
    </div>
  );
}

export function SummaryField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="wg:text-xs wg:text-muted">{label}</dt>
      <dd className="wg:font-medium">{value}</dd>
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

export function ActivityLog({ auditLog }: { auditLog: string }) {
  const { t, language } = useWagoTranslations();
  const events = parseActivityLog(auditLog);
  if (!events.length) return null;
  return (
    <div className="wg:mt-4 wg:border-t wg:border-default-200 wg:pt-3">
      <p className="wg:text-xs wg:font-semibold wg:uppercase wg:tracking-wider wg:text-muted">
        {t('commissioningUI.activity')}
      </p>
      <ol className="wg:mt-2 wg:space-y-1">
        {events.map((event) => (
          <li key={`${event.at}-${event.event}`} className="wg:text-xs wg:text-muted">
            <span className="wg:text-foreground">{formatActivity(event.event)}</span>{' '}
            <span>{new Date(event.at).toLocaleTimeString(language)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
