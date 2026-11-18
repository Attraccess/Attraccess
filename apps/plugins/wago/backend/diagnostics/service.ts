import { Auth, type PluginContext, type PluginFlowNodeReference } from '@attraccess/plugins-backend-sdk';
import { Controller, Get, Inject, Injectable, NotFoundException, Param, ParseIntPipe } from '@nestjs/common';
import type { WagoDiagnostics } from '../../diagnostics-types';
import { type WagoResourceDiagnostics } from '../../diagnostics-types';
import { configurationHash, validateSnapshot, type WagoConfigurationSnapshot } from '../configuration/model';
import { freshness } from './store';
import { safeValidationSummaries } from './validation';
import { WagoConfigurationDraft } from '../configuration/draft.entity';
import { WagoConfigurationRevision } from '../configuration/revision.entity';
import { openWagoStorage } from '../storage';
import { loadLatestAppliedRevisions } from '../configuration/latest-applied';
import { WagoService } from '../controllers/service';
import { channelEnabled, MAX_CONFIGURATION_ITEMS } from '../../shared/configuration-limits';
import { MAX_CHANNELS } from './store';

export function configurationRejections(
  latest: WagoConfigurationRevision | null,
  runtime: ReturnType<WagoService['diagnostics']['read']>,
) {
  return latest?.rejectionErrors
    ? safeValidationSummaries(JSON.parse(latest.rejectionErrors))
    : latest && runtime.rejection?.revision === latest.revision && runtime.rejection.contentHash === latest.contentHash
      ? runtime.rejection.errors
      : [];
}

export function hasDraftChanges(
  draft: WagoConfigurationDraft | null,
  latest: WagoConfigurationRevision | null,
): boolean {
  return (
    !!draft &&
    (!latest ||
      configurationHash(JSON.parse(draft.snapshot)) !== latest.contentHash ||
      configurationHash({ metadata: draft.presetProvenance ? JSON.parse(draft.presetProvenance) : null }) !==
        configurationHash({ metadata: latest.presetProvenance ? JSON.parse(latest.presetProvenance) : null }))
  );
}

export function configurationSummary(
  draft: WagoConfigurationDraft | null,
  latest: WagoConfigurationRevision | null,
  applied: WagoConfigurationRevision | null,
  runtime: ReturnType<WagoService['diagnostics']['read']>,
  revisionMismatch: boolean,
): WagoDiagnostics['configuration'] {
  const validationErrors = draft ? validateSnapshot(JSON.parse(draft.snapshot)) : [];
  return {
    draftUpdatedAt: draft?.updatedAt ?? null,
    draftChanged: hasDraftChanges(draft, latest),
    validationErrorCount: validationErrors.length,
    // Codes originate in our validator. Omit messages and dynamic paths, which can include arbitrary draft values.
    validationCodes: [...new Set(validationErrors.map((error) => error.code))].slice(0, 50),
    validationErrors: safeValidationSummaries(validationErrors),
    rejectionErrors: configurationRejections(latest, runtime),
    publishedRevision: latest?.revision ?? null,
    publishedState: latest?.state ?? null,
    appliedRevision: applied?.revision ?? null,
    reportedRevision: runtime.revision ?? null,
    revisionMismatch,
    rejected: latest?.state === 'rejected',
  };
}

export function own<T>(values: Record<string, T>, key: string): T | undefined {
  return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : undefined;
}

/** A resource flow is owned by its resource, a global flow by itself. */
function referenceOwner(node: { resourceId: number | null; flowId?: number | null }): string {
  return node.flowId != null ? `flow ${node.flowId}` : `resource ${node.resourceId}`;
}

/** A host flow node in the shape the reference diagnostics read: the global flow's name rides along as `flow`. */
type DiagnosticNode = PluginFlowNodeReference & { flow: { name: string } | null };

const withFlow = (node: PluginFlowNodeReference): DiagnosticNode => ({
  ...node,
  flow: node.flowName ? { name: node.flowName } : null,
});

export function diagnosticReferences(
  nodes: Array<{
    id: string;
    resourceId: number | null;
    flowId?: number | null;
    /** The joined global flow, for its name. */
    flow?: { name: string } | null;
    type: string;
    data: Record<string, unknown>;
  }>,
  channelIds: string[],
  revision: number | null,
  capabilities?: Record<string, string[]>,
) {
  return nodes.map((node) => {
    const channelId = typeof node.data.channelId === 'string' ? node.data.channelId : '';
    const control = node.type === 'plugin.wago.command';
    const conflicting = control
      ? nodes.filter(
          (other) =>
            other.type === 'plugin.wago.command' &&
            referenceOwner(other) !== referenceOwner(node) &&
            other.data.channelId === channelId,
        )
      : [];
    const flowId = node.flowId ?? null;
    const conflictResourceIds = [
      ...new Set(conflicting.map((other) => other.resourceId).filter((id): id is number => id != null)),
    ];
    const conflictFlowIds = [
      ...new Set(conflicting.map((other) => other.flowId).filter((id): id is number => id != null)),
    ];
    return {
      nodeId: node.id,
      resourceId: node.resourceId ?? null,
      flowId,
      flowName: flowId !== null ? (node.flow?.name ?? null) : null,
      channelId,
      control,
      href:
        flowId !== null
          ? `/devices/flows/${flowId}?node=${encodeURIComponent(node.id)}`
          : `/resources/${node.resourceId}/flows?node=${encodeURIComponent(node.id)}`,
      invalid:
        !channelIds.includes(channelId) ||
        (control &&
          (node.data.expectedConfigurationRevision !== revision ||
            (capabilities &&
              (!own(capabilities, channelId)?.includes('output') ||
                (node.data.action === 'pulse' && !own(capabilities, channelId)?.includes('pulse')))))),
      conflict: conflicting.length > 0,
      conflictResourceIds,
      conflictFlowIds,
    };
  });
}

export function runtimeStreamSummary(runtime: ReturnType<WagoService['diagnostics']['read']>) {
  return {
    sequenceGaps: runtime.activeStream ? runtime.sequenceGaps : null,
    dropCounts: runtime.dropCounts ?? null,
    activeStream: runtime.activeStream ?? null,
    trackingExhausted: runtime.trackingExhausted,
    stateConnected: runtime.connected ?? null,
    stateHardwareAvailable: runtime.hardwareAvailable ?? null,
    stateSourceAt: runtime.stateSourceAt ?? null,
    sequenceExplanation: runtime.activeStream
      ? 'Gaps are scoped to boot stream ID and message category; duplicates and retired streams are ignored.'
      : 'Legacy payloads have no source envelope; sequence gaps and source freshness are unavailable.',
  };
}

@Injectable()
export class WagoDiagnosticsService {
  public constructor(
    @Inject(Symbol.for('attraccess.plugin.context')) protected readonly context: PluginContext,
    @Inject(WagoService) protected readonly wago: WagoService,
  ) {}

  async get(controllerId: number): Promise<WagoDiagnostics> {
    const tables = openWagoStorage(this.context);
    const controller = await tables.controllers.get(controllerId);
    if (!controller) throw new NotFoundException('WAGO controller not found');
    const [draft, latest, applied, nodes] = await Promise.all([
      tables.configurationDrafts.findOne({ where: { controllerId } }),
      tables.configurationRevisions.findOne({
        where: { controllerId },
        orderBy: [{ field: 'revision', direction: 'desc' }],
      }),
      tables.configurationRevisions.findOne({
        where: { controllerId, state: 'applied' },
        orderBy: [{ field: 'revision', direction: 'desc' }],
      }),
      this.context.hostData.flows.findNodes({
        typePrefix: 'plugin.wago.',
        dataEquals: { controllerId },
        limit: 1001,
      }),
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
    // Disabled channels are never polled or published; filter them out before the channel cut so the
    // enabled ones, which the runtime bounds to the same 256, are always all listed.
    const configuredChannels = (appliedSnapshot ?? snapshot)?.logicalChannels ?? [];
    const enabledChannels = configuredChannels.filter(channelEnabled);
    const disabledChannels = configuredChannels
      .filter((channel) => !channelEnabled(channel))
      .slice(0, MAX_CONFIGURATION_ITEMS)
      .map((channel) => ({
        id: channel.id,
        profile: channel.profile,
        capabilities: channel.capabilities,
        availability: 'disabled' as const,
      }));
    const references = diagnosticReferences(
      nodes.slice(0, 1000).map(withFlow),
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
      channels: enabledChannels.slice(0, MAX_CHANNELS).map((channel) => {
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
      disabledChannels,
      faults: Object.entries(runtime.faults).map(([channelId, fault]) => ({ channelId, ...fault })),
      references,
      referencesTruncated: nodes.length > 1000,
      events: runtime.events,
      limitations: [
        'Hardware readiness remains unknown. Legacy samples have no source time and are never current.',
        'Diagnostics retain at most 256 enabled channels, 50 recent events and 15 minutes in this process. Disabled channels are listed without samples.',
        'Flow links select the affected node. Diagnostics warnings do not block resource usage; required flow nodes determine gating.',
        'The MQTT SDK exposes neither retained-message flags nor broker connection events. Source age is bounded to 90 seconds; immediate broker-disconnect detection is unavailable.',
        'Stream tracking keeps at most 16 retired boot stream IDs per controller and six category counters, and fails closed when exhausted. Replayed source times never become receipt times.',
      ],
    };
  }

  async getResource(resourceId: number): Promise<WagoResourceDiagnostics> {
    const nodes = (
      await this.context.hostData.flows.findNodes({
        typePrefix: 'plugin.wago.',
        resourceId,
        orderById: true,
        limit: 1001,
      })
    ).map(withFlow);
    const controllerIds = new Set<number>();
    let invalidControllerReferences = 0;
    for (const node of nodes.slice(0, 1000)) {
      const id = node.data.controllerId;
      if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0) {
        invalidControllerReferences++;
      } else {
        controllerIds.add(id);
      }
    }
    const selectedControllerIds = [...controllerIds].slice(0, 20);
    if (!selectedControllerIds.length)
      return { resourceId, controllers: [], invalidControllerReferences, truncated: nodes.length > 1000 };

    const localNodes = nodes.slice(0, 1000);
    const localChannelIds = [
      ...new Set(
        localNodes
          .map((node) => node.data.channelId)
          .filter((channelId): channelId is string => typeof channelId === 'string'),
      ),
    ];
    const controllerIdsForQuery = selectedControllerIds;
    const tables = openWagoStorage(this.context);
    const [controllers, appliedRows, conflictNodes] = await Promise.all([
      tables.controllers.find({ where: { id: { in: selectedControllerIds } } }),
      // Only the newest applied revision of each controller; older snapshots are never loaded.
      loadLatestAppliedRevisions(tables.configurationRevisions, selectedControllerIds),
      localChannelIds.length
        ? this.context.hostData.flows.findNodes({
            type: 'plugin.wago.command',
            dataIn: { controllerId: controllerIdsForQuery, channelId: localChannelIds },
            limit: 1001,
          })
        : Promise.resolve([]),
    ]);
    const controllersById = new Map(controllers.map((controller) => [controller.id, controller]));
    const appliedByControllerId = new Map(appliedRows.map((revision) => [revision.controllerId, revision]));
    const referencesTruncated = conflictNodes.length > 1000;
    const conflictNodesByControllerId = new Map<number, DiagnosticNode[]>();
    for (const node of conflictNodes.slice(0, 1000)) {
      // This resource's own nodes are already in localNodes; including them again duplicates every reference.
      if (node.resourceId === resourceId) continue;
      const controllerId = node.data.controllerId;
      if (typeof controllerId !== 'number') continue;
      const matchingNodes = conflictNodesByControllerId.get(controllerId) ?? [];
      matchingNodes.push(withFlow(node));
      conflictNodesByControllerId.set(controllerId, matchingNodes);
    }
    // The lookup names the owner of every node, so conflicting resources need no query of their own.
    const resourceNames = new Map<number, string>();
    for (const node of conflictNodes) {
      if (node.resourceId != null && node.resourceName != null) resourceNames.set(node.resourceId, node.resourceName);
    }
    const flowNames = new Map<number, string>();
    for (const node of conflictNodes) {
      if (node.flowId != null && node.flowName) flowNames.set(node.flowId, node.flowName);
    }
    const controllersResult = selectedControllerIds.map((controllerId) => {
      const controller = controllersById.get(controllerId);
      if (!controller)
        return {
          controllerId,
          name: `Controller ${controllerId}`,
          unavailable: true,
          references: [],
          referencesTruncated: false,
        };
      try {
        const applied = appliedByControllerId.get(controllerId);
        const appliedSnapshot = applied ? (JSON.parse(applied.snapshot) as WagoConfigurationSnapshot) : null;
        const controllerNodes = localNodes.filter((node) => node.data.controllerId === controllerId);
        const references = diagnosticReferences(
          [...controllerNodes, ...(conflictNodesByControllerId.get(controllerId) ?? [])],
          appliedSnapshot?.logicalChannels.map((channel) => channel.id) ?? [],
          applied?.revision ?? null,
          Object.fromEntries(
            appliedSnapshot?.logicalChannels.map((channel) => [channel.id, channel.capabilities]) ?? [],
          ),
        )
          .filter((reference) => reference.flowId === null && reference.resourceId === resourceId)
          .map((reference) => ({
            ...reference,
            conflictResources: reference.conflictResourceIds.map((id) => ({
              id,
              name: resourceNames.get(id) ?? `Resource ${id}`,
            })),
            // The frontend names a flow without a loaded name by its id, in the user's language.
            conflictFlows: reference.conflictFlowIds.map((id) => ({ id, name: flowNames.get(id) ?? null })),
          }));
        return {
          controllerId,
          name: controller.name ?? controller.hardwareId,
          unavailable: false,
          references,
          referencesTruncated,
        };
      } catch {
        return {
          controllerId,
          name: controller.name ?? controller.hardwareId,
          unavailable: true,
          references: [],
          referencesTruncated: false,
        };
      }
    });
    return {
      resourceId,
      controllers: controllersResult,
      invalidControllerReferences,
      truncated: nodes.length > 1000 || controllerIds.size > 20,
    };
  }
}

@Auth('resources.update')
@Controller('wago')
export class WagoDiagnosticsController {
  constructor(@Inject(WagoDiagnosticsService) private readonly diagnostics: WagoDiagnosticsService) {}
  @Get('controllers/:id/diagnostics')
  get(@Param('id', ParseIntPipe) id: number) {
    return this.diagnostics.get(id);
  }
  @Get('resources/:id/diagnostics')
  getResource(@Param('id', ParseIntPipe) id: number) {
    return this.diagnostics.getResource(id);
  }
}
