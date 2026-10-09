import { Button, Card } from '@heroui/react';
import { Component, useEffect, useState, type ReactNode } from 'react';
import { useWagoDiagnostics, type WagoDiagnostics } from './diagnostics';
import { useWagoTranslations } from './i18n';
import { presetDisplayName } from './configuration-model';

function useDiagnosticsClock() {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}
function pollFresh(receivedAt: number, now: number) {
  return receivedAt > 0 && now - receivedAt <= 15_000;
}

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

export class WagoDiagnosticsBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? <DiagnosticsFailure /> : this.props.children;
  }
}

function DiagnosticsFailure() {
  const { t } = useWagoTranslations();
  return <p role="alert">{t('diagnostics.boundaryError')}</p>;
}

/** Includes polling and an error boundary; embedding hosts only supply the selected controller. */
export function ControllerDiagnostics(props: { controllerId: number; onConfigure?: () => void }) {
  return (
    <WagoDiagnosticsBoundary key={props.controllerId}>
      <DiagnosticsContent {...props} />
    </WagoDiagnosticsBoundary>
  );
}

function DiagnosticsContent({ controllerId, onConfigure }: { controllerId: number; onConfigure?: () => void }) {
  const { t, tExists, language, tBackendMessage } = useWagoTranslations();
  const query = useWagoDiagnostics(controllerId);
  const now = useDiagnosticsClock();
  const pollingStale = !!query.data && !pollFresh(query.dataUpdatedAt, now);
  // Never render a cached online/current diagnosis after a failed or stalled poll.
  const d = query.isError || pollingStale ? undefined : query.data;
  return (
    <section aria-label={t('diagnostics.title')} className="wg:flex wg:min-w-0 wg:flex-col wg:gap-4 wg:break-words">
      <div className="wg:flex wg:flex-wrap wg:gap-2">
        <Button
          variant="secondary"
          onPress={() => {
            void query.refetch();
          }}
        >
          {t('diagnostics.refresh')}
        </Button>
        {onConfigure && (
          <Button variant="secondary" onPress={onConfigure}>
            {t('diagnostics.configure')}
          </Button>
        )}
      </div>
      {query.isError && <p role="alert">{t('diagnostics.accessError')}</p>}
      {!query.isError && pollingStale && <p role="alert">{t('diagnostics.overdue')}</p>}
      {query.isPending && <p>{t('diagnostics.loading')}</p>}
      {d && (
        <>
          <WagoStatus diagnostics={d} pollingUpdatedAt={query.dataUpdatedAt} />
          {d.channels.map((channel) => (
            <Card key={channel.id} className="wg:min-w-0 wg:break-words">
              <Card.Header>
                <Card.Title>{channel.id}</Card.Title>
                <Card.Description>
                  {t('diagnostics.preset', {
                    preset: presetDisplayName(channel.profile, t),
                    capabilities: channel.capabilities.map(tBackendMessage).join(', '),
                  })}
                </Card.Description>
              </Card.Header>
              <Card.Content>
                {channel.samples.length === 0 && <p>{t('diagnostics.noSamples')}</p>}
                {channel.samples.map((sample) => (
                  <div key={`${sample.kind}:${sample.measurementKind ?? ''}`}>
                    <p>
                      {t('diagnostics.latest', { kind: tBackendMessage(sample.kind) })} {String(sample.value)}{' '}
                      {sample.unit && tExists(`modbus.options.${sample.unit}`)
                        ? t(`modbus.options.${sample.unit}`)
                        : (sample.unit ?? '')}{' '}
                      {tBackendMessage(sample.measurementKind)} ·{' '}
                      {sample.current
                        ? t('diagnostics.current')
                        : t('diagnostics.notCurrent', { reason: tBackendMessage(sample.availabilityReason) })}
                    </p>
                    <p>
                      {t('diagnostics.sampleTime', {
                        source: sample.sourceAt
                          ? new Date(sample.sourceAt).toLocaleString(language)
                          : t('diagnostics.unavailable'),
                        freshness: tBackendMessage(sample.sourceFreshness),
                        received: new Date(sample.receivedAt).toLocaleString(language),
                      })}
                    </p>
                    <p>
                      {t('diagnostics.sampleSequence', {
                        boot: sample.streamId ?? t('diagnostics.legacy'),
                        sequence: sample.sequence ?? t('diagnostics.unavailable'),
                      })}
                    </p>
                  </div>
                ))}
                <p>
                  {t('diagnostics.safeState', {
                    state: tBackendMessage(channel.safeState),
                    mode: tBackendMessage(channel.disconnectPolicy.mode),
                    timeout: channel.disconnectPolicy.timeoutMs
                      ? t('diagnostics.timeout', { timeout: channel.disconnectPolicy.timeoutMs })
                      : '',
                  })}
                </p>
                <p>
                  {t('diagnostics.acknowledgement')}{' '}
                  {channel.acknowledgement
                    ? `${tBackendMessage(channel.acknowledgement.status)} · ${channel.acknowledgement.id} · ${new Date(channel.acknowledgement.receivedAt).toLocaleString(language)}`
                    : t('diagnostics.noAcknowledgement')}
                </p>
              </Card.Content>
            </Card>
          ))}
          <Card>
            <Card.Header>
              <Card.Title>{t('diagnostics.references')}</Card.Title>
            </Card.Header>
            <Card.Content>
              <p>{t('diagnostics.referenceWarning')}</p>
              {d.references.length === 0 && <p>{t('diagnostics.noReferences')}</p>}
              {d.references.map((ref) => (
                <p key={`${ref.resourceId}-${ref.nodeId}`}>
                  <a href={ref.href}>{t('diagnostics.reference', { resource: ref.resourceId, node: ref.nodeId })}</a>:{' '}
                  {ref.channelId} ({t(ref.control ? 'diagnostics.control' : 'diagnostics.readEvent')})
                  {ref.invalid ? t('diagnostics.invalidReference') : ''}
                  {ref.conflict ? t('diagnostics.conflictingReference') : ''}
                </p>
              ))}
              {d.referencesTruncated && <p role="alert">{t('diagnostics.truncated')}</p>}
            </Card.Content>
          </Card>
          <details>
            <summary>{t('diagnostics.events', { count: d.events.length })}</summary>
            {d.events.map((event, index) => (
              <p key={index}>
                {new Date(event.receivedAt).toLocaleString(language)}: {event.kind}
              </p>
            ))}
            <p>{d.sequenceExplanation}</p>
          </details>
          {d.limitations.map((limitation) => (
            <p key={limitation}>{limitation}</p>
          ))}
        </>
      )}
    </section>
  );
}
