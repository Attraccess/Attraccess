import { Card } from '@heroui/react';
import { type WagoDiagnostics } from './diagnostics';
import { useWagoTranslations } from './i18n';
import { useDiagnosticsClock } from './ControllerDiagnostics.helpers';
import { pollFresh } from './ControllerDiagnostics.helpers';

/** Shared status view with a freshness clock, but no fetching, for embedding hosts. */
export function WagoStatus({
  diagnostics: d,
  pollingFailed = false,
  pollingUpdatedAt,
}: {
  diagnostics: WagoDiagnostics;
  pollingFailed?: boolean;
  pollingUpdatedAt?: number;
}) {
  const { t, language, tBackendMessage } = useWagoTranslations();
  const now = useDiagnosticsClock();
  const c = d.configuration;
  if (pollingFailed || (pollingUpdatedAt !== undefined && !pollFresh(pollingUpdatedAt, now)))
    return <p role="alert">{t('diagnostics.unknownStatus')}</p>;
  return (
    <Card className="wg:min-w-0 wg:break-words">
      <Card.Header>
        <Card.Title>
          {d.name}: {t(`connectivity.${d.connectivity}`)}
        </Card.Title>
      </Card.Header>
      <Card.Content>
        <p>
          {t('diagnostics.heartbeat', {
            time: d.heartbeatAt ? new Date(d.heartbeatAt).toLocaleString(language) : t('controllers.never'),
            freshness: tBackendMessage(d.heartbeatFreshness),
          })}
        </p>
        <p>
          {t('diagnostics.configuration', {
            draft: t(
              c.draftUpdatedAt
                ? c.draftChanged
                  ? 'diagnostics.draftChanged'
                  : 'diagnostics.draftMatches'
                : 'diagnostics.none',
            ),
            published: c.publishedRevision ?? t('diagnostics.none'),
            state: c.publishedState ? t(`revisions.state.${c.publishedState}`) : t('diagnostics.none'),
            applied: c.appliedRevision ?? t('diagnostics.none'),
            reported: c.reportedRevision ?? t('diagnostics.unknown'),
          })}
        </p>
        {(c.revisionMismatch || c.rejected || c.validationErrorCount > 0) && (
          <p role="alert">
            {t('diagnostics.attention')} {c.rejected ? t('diagnostics.rejected') : ''}{' '}
            {c.revisionMismatch ? t('diagnostics.mismatch') : ''}{' '}
            {t('diagnostics.validationErrors', { count: c.validationErrorCount })}
          </p>
        )}
        <p>
          {t('diagnostics.hardware', { status: tBackendMessage(d.hardwareReadiness) })}{' '}
          {tBackendMessage(d.hardwareReadinessReason)}
        </p>
        {d.stateHardwareAvailable === false && <p role="alert">{t('diagnostics.hardwareUnavailable')}</p>}
        {c.validationCodes.length > 0 && <p>{t('diagnostics.draftErrors', { codes: c.validationCodes.join(', ') })}</p>}
        {c.validationErrors.map((error, index) => (
          <p key={`validation-${index}`}>{t('diagnostics.draftField', { path: error.path, code: error.code })}</p>
        ))}
        {c.rejectionErrors.map((error, index) => (
          <p role="alert" key={`rejection-${index}`}>
            {t('diagnostics.rejectedField', { path: error.path, code: error.code })}
          </p>
        ))}
        <p>
          {t('diagnostics.connection', {
            status: t(
              d.stateConnected === null
                ? 'diagnostics.unknown'
                : d.stateConnected
                  ? 'diagnostics.connected'
                  : 'diagnostics.disconnected',
            ),
            time: d.stateSourceAt ? new Date(d.stateSourceAt).toLocaleString(language) : t('diagnostics.unavailable'),
          })}
        </p>
        <p>
          {t('diagnostics.sequence', {
            gaps: d.sequenceGaps ?? t('diagnostics.unavailable'),
            boot: d.activeStream ?? t('diagnostics.legacy'),
          })}
        </p>
        {d.trackingExhausted && <p role="alert">{t('diagnostics.trackingLimit')}</p>}
        <p>
          {t('diagnostics.versions', { runtime: d.runtimeVersion, protocol: d.protocolVersion })}
          {d.incompatible ? t('diagnostics.incompatible') : ''}
        </p>
        <p>{t('diagnostics.capabilities', { capabilities: d.capabilities.map(tBackendMessage).join(', ') })}</p>
        {d.faults.map((fault) => (
          <p role="alert" key={fault.channelId}>
            {t('diagnostics.fault', {
              channel: fault.channelId,
              code: fault.code,
              time: new Date(fault.receivedAt).toLocaleString(language),
            })}
          </p>
        ))}
      </Card.Content>
    </Card>
  );
}
