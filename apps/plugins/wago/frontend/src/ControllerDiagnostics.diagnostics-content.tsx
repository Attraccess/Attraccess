import { Button, Card } from '@heroui/react';
import { useWagoDiagnostics } from './diagnostics';
import { useWagoTranslations } from './i18n';
import { presetDisplayName } from './configuration-model';
import { useDiagnosticsClock } from './ControllerDiagnostics.helpers';
import { pollFresh } from './ControllerDiagnostics.helpers';
import { WagoStatus } from './ControllerDiagnostics.wago-status';

export function DiagnosticsContent({ controllerId, onConfigure }: { controllerId: number; onConfigure?: () => void }) {
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
