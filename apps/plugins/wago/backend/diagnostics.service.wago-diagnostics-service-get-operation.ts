import { NotFoundException } from '@nestjs/common';
import { ResourceFlowNode } from '@attraccess/plugins-backend-sdk';
import { WagoController } from './wago-controller.entity';
import { WagoConfigurationDraft } from './wago-configuration-draft.entity';
import { WagoConfigurationRevision } from './wago-configuration-revision.entity';
import { type WagoConfigurationSnapshot } from './configuration';
import { freshness } from './diagnostics-store';
import type { WagoDiagnostics } from '../diagnostics-types';
import { configurationSummary } from './diagnostics.helpers';
import { runtimeStreamSummary } from './diagnostics.helpers';
import { own } from './diagnostics.helpers';
import { diagnosticReferences } from './diagnostics.helpers';
import { WagoDiagnosticsServiceGetResourceOperation } from './diagnostics.service.wago-diagnostics-service-get-resource-operation';
export abstract class WagoDiagnosticsServiceGetOperation extends WagoDiagnosticsServiceGetResourceOperation {
  async get(controllerId: number): Promise<WagoDiagnostics> {
    const controller = await this.context.getRepository(WagoController).findOneBy({ id: controllerId });
    if (!controller) throw new NotFoundException('WAGO controller not found');
    const [draft, latest, applied, nodes] = await Promise.all([
      this.context.getRepository(WagoConfigurationDraft).findOneBy({ controllerId }),
      this.context
        .getRepository(WagoConfigurationRevision)
        .findOne({ where: { controllerId }, order: { revision: 'DESC' } }),
      this.context
        .getRepository(WagoConfigurationRevision)
        .findOne({ where: { controllerId, state: 'applied' }, order: { revision: 'DESC' } }),
      this.context.dataSource
        .getRepository(ResourceFlowNode)
        .createQueryBuilder('node')
        .where('node.type LIKE :type', { type: 'plugin.wago.%' })
        .andWhere("node.data ->> 'controllerId' = :controllerId", { controllerId })
        .take(1001)
        .getMany(),
    ]);
    const runtime = this.wago.diagnostics.read(controllerId);
    const runtimeUpdate = this.wago.isRuntimeUpdateRequired?.(controllerId) ?? false;
    const snapshot = latest ? (JSON.parse(latest.snapshot) as WagoConfigurationSnapshot) : null;
    const appliedSnapshot = applied ? (JSON.parse(applied.snapshot) as WagoConfigurationSnapshot) : null;
    const heartbeatAt = runtime.heartbeatAt ?? controller.lastHeartbeatAt;
    const heartbeatFreshness = freshness(heartbeatAt);
    const expected = latest?.state === 'rejected' ? applied : latest;
    const revisionMismatch =
      !!expected &&
      (applied?.revision !== expected.revision ||
        runtime.revision !== expected.revision ||
        (runtime.activeStream !== undefined && runtime.contentHash !== expected.contentHash));
    const connected =
      runtime.connected === false
        ? false
        : heartbeatFreshness === 'fresh' || freshness(runtime.stateSourceAt) === 'fresh';
    const references = diagnosticReferences(
      nodes.slice(0, 1000),
      appliedSnapshot?.logicalChannels.map((channel) => channel.id) ?? [],
      applied?.revision ?? null,
      Object.fromEntries(appliedSnapshot?.logicalChannels.map((channel) => [channel.id, channel.capabilities]) ?? []),
    );
    return {
      controllerId,
      generatedAt: new Date().toISOString(),
      name: controller.name ?? controller.hardwareId,
      connectivity:
        controller.trustState !== 'claimed'
          ? 'untrusted'
          : runtimeUpdate
            ? 'runtime_update'
            : runtime.connected === false
              ? 'disconnected'
              : connected
                ? 'online'
                : 'stale',
      heartbeatAt,
      heartbeatFreshness,
      runtimeVersion: controller.runtimeVersion,
      protocolVersion: controller.protocolVersion,
      capabilities: (JSON.parse(controller.capabilities) as string[]).slice(0, 64),
      incompatible: !!controller.compatibilityError,
      ...runtimeStreamSummary(runtime),
      configuration: configurationSummary(draft, latest, applied, runtime, revisionMismatch),
      manualOutputChannelIds:
        !runtimeUpdate && connected && !revisionMismatch && freshness(runtime.stateSourceAt) === 'fresh'
          ? (runtime.manualOutputChannelIds ?? []).filter((id) =>
              appliedSnapshot?.logicalChannels.some(
                (channel) => channel.id === id && channel.capabilities.includes('output'),
              ),
            )
          : [],
      hardwareReadiness: 'unknown' as const,
      hardwareReadinessReason:
        'Reported hardware availability is shown when supplied; it does not prove physical I/O readiness. Applied configuration and cached output state are not physical proof.',
      channels: ((appliedSnapshot ?? snapshot)?.logicalChannels ?? []).slice(0, 256).map((channel) => {
        const values = [
          channel.capabilities.includes('input') ? own(runtime.inputs, channel.id) : undefined,
          channel.capabilities.includes('output') ? own(runtime.outputs, channel.id) : undefined,
          channel.capabilities.includes('measurement') ? own(runtime.measurements, channel.id) : undefined,
          channel.capabilities.includes('measurement') ? own(runtime.cumulativeMeasurements, channel.id) : undefined,
        ].filter((value) => value !== undefined);
        const samples = values.map((value) => {
          const sourceFreshness = freshness(value.sourceAt);
          const availabilityReason =
            controller.trustState !== 'claimed'
              ? 'untrusted'
              : runtimeUpdate
                ? 'runtime-update'
                : controller.compatibilityError
                  ? 'incompatible-runtime'
                  : runtime.trackingExhausted
                    ? 'stream-tracking-exhausted'
                    : runtime.connected !== true || !connected
                      ? 'disconnected-or-unknown'
                      : runtime.hardwareAvailable === false
                        ? 'hardware-unavailable'
                        : revisionMismatch || !applied
                          ? 'configuration-mismatch'
                          : own(runtime.faults, channel.id)
                            ? 'recent-fault'
                            : freshness(runtime.stateSourceAt) !== 'fresh'
                              ? 'state-source-unavailable-or-stale'
                              : value.streamId !== runtime.activeStream
                                ? 'old-or-legacy-stream'
                                : sourceFreshness !== 'fresh'
                                  ? `source-${sourceFreshness}`
                                  : 'current';
          return { ...value, sourceFreshness, current: availabilityReason === 'current', availabilityReason };
        });
        return {
          id: channel.id,
          profile: channel.profile,
          capabilities: channel.capabilities,
          disconnectPolicy: channel.disconnectPolicy,
          safeState: channel.capabilities.includes('output') ? 'not specified' : 'not applicable',
          samples,
          current: samples.length > 0 && samples.every((value) => value.current),
          fault: own(runtime.faults, channel.id) ?? null,
          acknowledgement: own(runtime.acknowledgements, channel.id) ?? null,
        };
      }),
      faults: Object.entries(runtime.faults).map(([channelId, fault]) => ({ channelId, ...fault })),
      references,
      referencesTruncated: nodes.length > 1000,
      events: runtime.events,
      limitations: [
        'Hardware readiness remains unknown. Legacy samples have no source time and are never current.',
        'Diagnostics retain at most 256 channels, 50 recent events and 15 minutes in this process.',
        'Flow links select the affected node. Diagnostics warnings do not block resource usage; required flow nodes determine gating.',
        'The MQTT SDK exposes neither retained-message flags nor broker connection events. Source age is bounded to 90 seconds; immediate broker-disconnect detection is unavailable.',
        'Stream tracking keeps at most 16 retired boot stream IDs per controller and six category counters, and fails closed when exhausted. Replayed source times never become receipt times.',
      ],
    };
  }
}
