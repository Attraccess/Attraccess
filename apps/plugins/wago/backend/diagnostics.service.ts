import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ResourceFlowNode, type PluginContext } from '@attraccess/plugins-backend-sdk';
import { WagoService } from './wago.service';
import { WagoController } from './wago-controller.entity';
import { WagoConfigurationDraft } from './wago-configuration-draft.entity';
import { WagoConfigurationRevision } from './wago-configuration-revision.entity';
import { configurationHash, validateSnapshot, type WagoConfigurationSnapshot } from './configuration';
import { freshness } from './diagnostics-store';
import { safeValidationSummaries } from './diagnostics-validation';
import type { WagoDiagnostics } from '../diagnostics-types';

function own<T>(values: Record<string, T>, key: string): T | undefined {
  return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : undefined;
}

export function diagnosticReferences(
  nodes: Array<{ id: string; resourceId: number; type: string; data: Record<string, unknown> }>,
  channelIds: string[],
  revision: number | null,
  capabilities?: Record<string, string[]>,
) {
  return nodes.map((node) => {
    const channelId = typeof node.data.channelId === 'string' ? node.data.channelId : '';
    const control = node.type === 'plugin.wago.command';
    return {
      nodeId: node.id,
      resourceId: node.resourceId,
      channelId,
      control,
      href: `/resources/${node.resourceId}/flows`,
      invalid:
        !channelIds.includes(channelId) ||
        (control &&
          (node.data.expectedConfigurationRevision !== revision ||
            (capabilities &&
              (!own(capabilities, channelId)?.includes('output') ||
                (node.data.action === 'pulse' && !own(capabilities, channelId)?.includes('pulse')))))),
      conflict:
        control &&
        nodes.some(
          (other) =>
            other.type === 'plugin.wago.command' &&
            other.resourceId !== node.resourceId &&
            other.data.channelId === channelId,
        ),
    };
  });
}

@Injectable()
export class WagoDiagnosticsService {
  constructor(
    @Inject(Symbol.for('attraccess.plugin.context')) private readonly context: PluginContext,
    @Inject(WagoService) private readonly wago: WagoService,
  ) {}
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
    const snapshot = latest ? (JSON.parse(latest.snapshot) as WagoConfigurationSnapshot) : null;
    const appliedSnapshot = applied ? (JSON.parse(applied.snapshot) as WagoConfigurationSnapshot) : null;
    const heartbeatAt = runtime.heartbeatAt ?? controller.lastHeartbeatAt;
    const heartbeatFreshness = freshness(heartbeatAt);
    const revisionMismatch =
      !!latest &&
      (applied?.revision !== latest.revision ||
        runtime.revision !== latest.revision ||
        (runtime.activeStream !== undefined && runtime.contentHash !== latest.contentHash));
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
    const validationErrors = draft ? validateSnapshot(JSON.parse(draft.snapshot)) : [];
    return {
      controllerId,
      generatedAt: new Date().toISOString(),
      name: controller.name ?? controller.hardwareId,
      connectivity:
        controller.trustState !== 'claimed'
          ? 'untrusted'
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
      sequenceGaps: runtime.activeStream ? runtime.sequenceGaps : null,
      activeStream: runtime.activeStream ?? null,
      trackingExhausted: runtime.trackingExhausted,
      stateConnected: runtime.connected ?? null,
      stateHardwareAvailable: runtime.hardwareAvailable ?? null,
      stateSourceAt: runtime.stateSourceAt ?? null,
      sequenceExplanation: runtime.activeStream
        ? 'Gaps are scoped to boot UUID and message category; duplicates and retired streams are ignored.'
        : 'Legacy payloads have no source envelope; sequence gaps and source freshness are unavailable.',
      configuration: {
        draftUpdatedAt: draft?.updatedAt ?? null,
        draftChanged: !!draft && (!latest || configurationHash(JSON.parse(draft.snapshot)) !== latest.contentHash),
        validationErrorCount: validationErrors.length,
        // Codes originate in our validator. Omit messages and dynamic paths, which can include arbitrary draft values.
        validationCodes: [...new Set(validationErrors.map((error) => error.code))].slice(0, 50),
        validationErrors: safeValidationSummaries(validationErrors),
        rejectionErrors: latest?.rejectionErrors
          ? safeValidationSummaries(JSON.parse(latest.rejectionErrors))
          : latest &&
              runtime.rejection?.revision === latest.revision &&
              runtime.rejection.contentHash === latest.contentHash
            ? runtime.rejection.errors
            : [],
        publishedRevision: latest?.revision ?? null,
        publishedState: latest?.state ?? null,
        appliedRevision: applied?.revision ?? null,
        reportedRevision: runtime.revision ?? null,
        revisionMismatch,
        rejected: latest?.state === 'rejected',
      },
      hardwareReadiness: 'unknown' as const,
      hardwareReadinessReason:
        'Reported hardware availability is shown when supplied; it does not prove physical I/O readiness. Applied configuration and cached output state are not physical proof.',
      channels: (snapshot?.logicalChannels ?? []).slice(0, 256).map((channel) => {
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
          safeState: channel.capabilities.includes('output') ? 'off (runtime default)' : 'not applicable',
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
        'Resource-page slots are not integrated. Flow links open the affected resource flow; node IDs identify the exact nodes.',
        'The MQTT SDK exposes neither retained-message flags nor broker connection events. Source age is bounded to 90 seconds; immediate broker-disconnect detection is unavailable.',
        'Stream tracking keeps at most 16 retired boot UUIDs per controller and six category counters, and fails closed when exhausted. Replayed source times never become receipt times.',
      ],
    };
  }
}
