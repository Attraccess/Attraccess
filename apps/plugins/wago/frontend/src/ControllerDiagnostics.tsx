import { Button, Card } from '@heroui/react';
import { Component, useEffect, useState, type ReactNode } from 'react';
import { useWagoDiagnostics, type WagoDiagnostics } from './diagnostics';

function useDiagnosticsClock() {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}
function pollFresh(d: WagoDiagnostics, now: number) {
  const generated = Date.parse(d.generatedAt);
  return Number.isFinite(generated) && now - generated <= 15_000 && generated <= now + 1_000;
}
function sourceFresh(timestamp: string | null, now: number) {
  const source = Date.parse(timestamp ?? '');
  return Number.isFinite(source) && source <= now && now - source <= 90_000;
}

/** Shared status view with a freshness clock, but no fetching, for embedding hosts. */
export function WagoStatus({
  diagnostics: d,
  pollingFailed = false,
}: {
  diagnostics: WagoDiagnostics;
  pollingFailed?: boolean;
}) {
  const now = useDiagnosticsClock();
  const c = d.configuration;
  if (pollingFailed || !pollFresh(d, now))
    return <p role="alert">Current controller status is unknown until diagnostics polling recovers.</p>;
  return (
    <Card className="wg:min-w-0 wg:break-words">
      <Card.Header>
        <Card.Title>
          {d.name}: {d.connectivity}
        </Card.Title>
      </Card.Header>
      <Card.Content>
        <p>
          Permanent heartbeat: {d.heartbeatAt ?? 'Never'} ({d.heartbeatFreshness})
        </p>
        <p>
          Draft: {c.draftUpdatedAt ? (c.draftChanged ? 'unpublished changes' : 'matches publication') : 'none'} ·
          Published: {c.publishedRevision ?? 'none'} ({c.publishedState ?? 'none'}) · Applied:{' '}
          {c.appliedRevision ?? 'none'} · Reported: {c.reportedRevision ?? 'unknown'}
        </p>
        {(c.revisionMismatch || c.rejected || c.validationErrorCount > 0) && (
          <p role="alert">
            Configuration needs attention: {c.rejected ? 'controller rejected publication. ' : ''}
            {c.revisionMismatch ? 'revisions do not match. ' : ''}
            {c.validationErrorCount} draft validation errors. Open configuration to review and publish.
          </p>
        )}
        <p>
          Hardware readiness: {d.hardwareReadiness}. {d.hardwareReadinessReason}
        </p>
        {d.stateHardwareAvailable === false && <p role="alert">Runtime reports hardware unavailable. Inspect the controller hardware connection and configuration before retrying.</p>}
        {c.validationCodes.length > 0 && <p>Draft errors: {c.validationCodes.join(', ')}</p>}
        {c.validationErrors.map((error, index) => (
          <p key={`validation-${index}`}>
            Draft {error.path}: {error.code}. Review this field in configuration.
          </p>
        ))}
        {c.rejectionErrors.map((error, index) => (
          <p role="alert" key={`rejection-${index}`}>
            Rejected {error.path}: {error.code}. Review configuration and republish.
          </p>
        ))}
        <p>
          Observed source connection:{' '}
          {d.stateConnected === null ? 'unknown' : d.stateConnected ? 'connected' : 'disconnected'} · Source state time:{' '}
          {d.stateSourceAt ?? 'unavailable'}
        </p>
        <p>
          Sequence gaps: {d.sequenceGaps ?? 'unavailable'} · Boot: {d.activeStream ?? 'legacy/unavailable'}
        </p>
        {d.trackingExhausted && (
          <p role="alert">
            Stream tracking limit reached. Current data is unavailable; investigate repeated runtime restarts.
          </p>
        )}
        <p>
          Runtime {d.runtimeVersion} · Protocol {d.protocolVersion}
          {d.incompatible ? ' — incompatible; update the runtime' : ''}
        </p>
        <p>Capabilities: {d.capabilities.join(', ')}</p>
        {d.faults.map((fault) => (
          <p role="alert" key={fault.channelId}>
            Recent fault on {fault.channelId}: {fault.code} ({fault.receivedAt}). Inspect configuration and device
            wiring.
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
    return this.state.failed ? (
      <p role="alert">Diagnostics could not be displayed. Close and reopen diagnostics to retry.</p>
    ) : (
      this.props.children
    );
  }
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
  const query = useWagoDiagnostics(controllerId);
  const now = useDiagnosticsClock();
  const pollingStale = !!query.data && !pollFresh(query.data, now);
  // Never render a cached online/current diagnosis after a failed or stalled poll.
  const d = query.isError || pollingStale ? undefined : query.data;
  return (
    <section aria-label="Controller diagnostics" className="wg:flex wg:min-w-0 wg:flex-col wg:gap-4 wg:break-words">
      <div className="wg:flex wg:flex-wrap wg:gap-2">
        <Button
          variant="secondary"
          onPress={() => {
            void query.refetch();
          }}
        >
          Refresh diagnostics
        </Button>
        {onConfigure && (
          <Button variant="secondary" onPress={onConfigure}>
            Open configuration
          </Button>
        )}
      </div>
      {query.isError && (
        <p role="alert">
          Diagnostics unavailable. The controller may have been removed or access denied. Current connection and sample
          status are unknown until polling recovers.
        </p>
      )}
      {!query.isError && pollingStale && (
        <p role="alert">
          Diagnostics refresh is overdue. Current connection and sample status are unknown. Refresh to recover.
        </p>
      )}
      {query.isPending && <p>Loading diagnostics…</p>}
      {d && (
        <>
          <WagoStatus diagnostics={d} />
          {d.channels.map((channel) => (
            <Card key={channel.id} className="wg:min-w-0 wg:break-words">
              <Card.Header>
                <Card.Title>{channel.id}</Card.Title>
                <Card.Description>
                  {channel.profile} · {channel.capabilities.join(', ')}
                </Card.Description>
              </Card.Header>
              <Card.Content>
                {channel.samples.length === 0 && <p>No supported input, output or measurement reported.</p>}
                {channel.samples.map((sample) => (
                  <div key={`${sample.kind}:${sample.measurementKind ?? ''}`}>
                    <p>
                      Latest {sample.kind}: {String(sample.value)} {sample.unit ?? ''} {sample.measurementKind ?? ''} ·{' '}
                      {sample.current && sourceFresh(sample.sourceAt, now) && sourceFresh(d.stateSourceAt, now)
                        ? 'current source sample'
                        : `not current: ${sample.current ? 'source-stale' : sample.availabilityReason}`}
                    </p>
                    <p>
                      Source time: {sample.sourceAt ?? 'unavailable'} ({sample.sourceFreshness}). Received:{' '}
                      {sample.receivedAt}. Receipt does not prove source freshness.
                    </p>
                    <p>
                      Boot: {sample.streamId ?? 'legacy/unavailable'} · Sequence: {sample.sequence ?? 'unavailable'}
                    </p>
                  </div>
                ))}
                <p>
                  Safe state: {channel.safeState}. Disconnect: {channel.disconnectPolicy.mode}
                  {channel.disconnectPolicy.timeoutMs ? ` after ${channel.disconnectPolicy.timeoutMs} ms` : ''}.
                </p>
                <p>
                  Last correlated acknowledgement:{' '}
                  {channel.acknowledgement
                    ? `${channel.acknowledgement.status} · ${channel.acknowledgement.id} · ${channel.acknowledgement.receivedAt}`
                    : 'none observed'}
                </p>
              </Card.Content>
            </Card>
          ))}
          <Card>
            <Card.Header>
              <Card.Title>Flow references</Card.Title>
            </Card.Header>
            <Card.Content>
              <p>Warnings do not block resource usage. Required flow nodes determine gating.</p>
              {d.references.length === 0 && <p>No references found.</p>}
              {d.references.map((ref) => (
                <p key={`${ref.resourceId}-${ref.nodeId}`}>
                  <a href={ref.href}>
                    Resource {ref.resourceId}, node {ref.nodeId}
                  </a>
                  : {ref.channelId} ({ref.control ? 'control' : 'read/event'})
                  {ref.invalid ? ' — invalid reference; reopen and update this node' : ''}
                  {ref.conflict ? ' — also controlled by another resource' : ''}
                </p>
              ))}
              {d.referencesTruncated && <p role="alert">Only the first 1,000 references are shown.</p>}
            </Card.Content>
          </Card>
          <details>
            <summary>Recent protocol events ({d.events.length})</summary>
            {d.events.map((event, index) => (
              <p key={index}>
                {event.receivedAt}: {event.kind}
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
