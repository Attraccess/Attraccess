import { WagoAudit, wagoAuditSummary } from './wago-audit';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import type {
  PluginAuditPrincipal,
  PluginContext,
  PluginMqttSubscription,
  Repository,
} from '@attraccess/plugins-backend-sdk';
import {
  CONFIGURATION_PROTOCOL_VERSION,
  DISCOVERY_ROOT,
  compatibilityError,
  commandTopic,
  acknowledgementHardwareId,
  acknowledgementWildcardTopic,
  configurationDesiredTopic,
  configurationReportedHardwareId,
  configurationReportedTopic,
  configurationReportedWildcardTopic,
  discoveryTopic,
  heartbeatTopic,
  normalizeOperationalPrefix,
  parseAnnouncement,
  parseHeartbeat,
  type WagoHeartbeat,
  type WagoAnnouncement,
} from './protocol';
import { WagoController } from './wago-controller.entity';
import { WagoSettings } from './wago-settings.entity';
import { WagoEnrollment } from './wago-enrollment.entity';
import {
  WAGO_PRESETS,
  applyPreset,
  type WagoPresetApplication,
  type WagoConfigurationSnapshot,
  canonicalSnapshot,
  configurationDiff,
  configurationHash,
  parseConfigurationReport,
  type ConfigurationValidationError,
} from './configuration';
import {
  editorMetadata,
  previewConfigurationPreset,
  selectPresetChanges,
  validateEditorSnapshot,
  type ConfigurationEditorMetadata,
} from './configuration-editor';
import { WagoConfigurationDraft } from './wago-configuration-draft.entity';
import { configurationFlowImpacts } from './configuration-flow-references';
import { WagoConfigurationRevision } from './wago-configuration-revision.entity';
import { WagoCommandError, WagoCommandHandler } from './wago-command-handler';
import { freshness, WagoDiagnosticsStore } from './diagnostics-store';
import { canonicalEnvelope, sourceTime, validEnvelope } from './diagnostics-envelope';

const PLUGIN_CONTEXT = Symbol.for('attraccess.plugin.context');
const STALE_AFTER_MS = 90_000;
const MAX_PENDING_CONFIGURATION_REPORTS = 100;
const ENROLLMENT_RETRY_MS = 60_000;

class MqttSubscriptionError extends Error {
  constructor(readonly mqttError: unknown) {
    super(String(mqttError));
  }
}

type WagoControllerSummary = Omit<WagoController, 'fingerprint' | 'pairingCodeHash'> & {
  connectivity: 'online' | 'stale' | 'untrusted';
};

@Injectable()
export class WagoService implements OnApplicationBootstrap, OnModuleDestroy {
  readonly diagnostics = new WagoDiagnosticsStore();
  private controllers!: Repository<WagoController>;
  private settings!: Repository<WagoSettings>;
  private enrollments!: Repository<WagoEnrollment>;
  private drafts!: Repository<WagoConfigurationDraft>;
  private revisions!: Repository<WagoConfigurationRevision>;
  private readonly subscriptions: PluginMqttSubscription[] = [];
  private readonly enrollmentExpiryTimers = new Map<number, ReturnType<typeof setTimeout>>();
  private readonly claimAcknowledgementSubscriptions = new Map<number, PluginMqttSubscription>();
  private readonly claimLocks = new Map<number, Promise<void>>();
  private readonly configurationLocks = new Map<number, Promise<void>>();
  private readonly configurationReportQueues = new Map<number, { pending: Map<number, Buffer>; processing: boolean }>();
  private commissioningDiscoveryHandler: ((controller: WagoController) => Promise<void>) | null = null;
  private readonly commands = new WagoCommandHandler({
    context: this.context,
    controllers: () => this.controllers,
    claimedController: (id) => this.claimedController(id),
    getSettings: () => this.getSettings(),
    appliedRevision: (id) => this.appliedRevision(id),
    onCommand: (controllerId, channelId, id) => this.diagnostics.command(controllerId, channelId, id),
    onCommandFailure: (id, status) => this.diagnostics.commandFailed(id, status),
  });
  private claimConfigurationLock = Promise.resolve();
  private subscriptionRebuild = Promise.resolve();
  private subscriptionRetryTimer: ReturnType<typeof setTimeout> | null = null;
  private activeSubscriptionGeneration = 0;
  private destroyed = false;

  constructor(@Inject(PLUGIN_CONTEXT) private readonly context: PluginContext) {}

  async onApplicationBootstrap(): Promise<void> {
    // The host datasource is available only after plugin module construction completes.
    this.controllers = this.context.getRepository(WagoController);
    this.settings = this.context.getRepository(WagoSettings);
    this.enrollments = this.context.getRepository(WagoEnrollment);
    this.drafts = this.context.getRepository(WagoConfigurationDraft);
    this.revisions = this.context.getRepository(WagoConfigurationRevision);
    const enrollments = await this.enrollments
      .createQueryBuilder('enrollment')
      .where('enrollment.consumedAt IS NULL')
      .getMany();
    for (const enrollment of enrollments) this.scheduleEnrollmentExpiry(enrollment);
    try {
      await this.subscribeConfiguredServers();
    } catch (error) {
      if (!(error instanceof MqttSubscriptionError)) throw error;
      this.context.logger.warn(
        `Could not establish WAGO MQTT subscriptions during startup: ${String(error.mqttError)}`,
      );
      this.scheduleSubscriptionRetry();
    }
  }
  onModuleDestroy(): void {
    this.destroyed = true;
    this.unsubscribe();
    this.claimAcknowledgementSubscriptions.forEach((subscription) => subscription.unsubscribe());
    this.claimAcknowledgementSubscriptions.clear();
    this.enrollmentExpiryTimers.forEach((timer) => clearTimeout(timer));
    this.enrollmentExpiryTimers.clear();
    if (this.subscriptionRetryTimer) clearTimeout(this.subscriptionRetryTimer);
    this.commands.destroy();
  }

  async commandSchema(config: Record<string, unknown>, resourceId: number): Promise<Record<string, unknown>> {
    return this.commands.schema(config, resourceId);
  }

  async validateCommandConfig(config: Record<string, unknown>, validationContext = new Map<string, unknown>()) {
    return this.commands.validate(config, validationContext);
  }

  async executeCommand(config: Record<string, unknown>): Promise<void> {
    return this.commands.execute(config);
  }

  commandFailureBehavior(config: Record<string, unknown>) {
    return ['fail-flow', 'failure-output', 'log-and-continue'].includes(config.failureBehavior as string)
      ? (config.failureBehavior as 'fail-flow' | 'failure-output' | 'log-and-continue')
      : 'fail-flow';
  }

  commandFailureKind(error: unknown) {
    return error instanceof WagoCommandError ? error.kind : 'node-failure';
  }

  async list(): Promise<WagoControllerSummary[]> {
    const controllers = await this.controllers.find({ order: { hardwareId: 'ASC' } });
    return controllers.map((controller) => ({
      id: controller.id,
      hardwareId: controller.hardwareId,
      trustState: controller.trustState,
      name: controller.name,
      mqttServerId: controller.mqttServerId,
      enrollmentId: controller.enrollmentId,
      protocolVersion: controller.protocolVersion,
      runtimeVersion: controller.runtimeVersion,
      capabilities: controller.capabilities,
      lastSequence: controller.lastSequence,
      lastHeartbeatAt: this.diagnostics.read(controller.id).heartbeatAt ?? controller.lastHeartbeatAt,
      lastSeenAt: controller.lastSeenAt,
      compatibilityError: controller.compatibilityError,
      createdAt: controller.createdAt,
      updatedAt: controller.updatedAt,
      connectivity: this.connectivity(controller),
    }));
  }

  registerCommissioningDiscoveryHandler(handler: (controller: WagoController) => Promise<void>): void {
    this.commissioningDiscoveryHandler = handler;
  }

  async getSettings(): Promise<WagoSettings> {
    const settings = await this.settings.findOneBy({ id: 1 });
    if (settings) return settings;
    await this.settings
      .createQueryBuilder()
      .insert()
      .values({ id: 1, defaultMqttServerId: null, operationalPrefix: 'attraccess/wago' })
      .orIgnore()
      .execute();
    return this.settings.findOneByOrFail({ id: 1 });
  }

  async setSettings(serverId?: number | null, operationalPrefix?: string): Promise<WagoSettings> {
    if (serverId !== undefined && serverId !== null && !(await this.context.getMqttServerConfig(serverId)))
      throw new NotFoundException(`MQTT server ${serverId} not found`);
    const save = async (): Promise<WagoSettings> => {
      const settings = await this.getSettings();
      if (serverId !== undefined) settings.defaultMqttServerId = serverId;
      if (operationalPrefix !== undefined) {
        const normalizedPrefix = normalizeOperationalPrefix(operationalPrefix);
        if (normalizedPrefix !== settings.operationalPrefix) {
          const controllers = await this.controllers.find({ where: { trustState: 'claimed' } });
          if (controllers.length)
            throw new ConflictException('operational MQTT prefix cannot change after a controller has been claimed');
          settings.operationalPrefix = normalizedPrefix;
        }
      }
      await this.settings.save(settings);
      return settings;
    };
    const settings = operationalPrefix === undefined ? await save() : await this.withClaimConfigurationLock(save);
    await this.subscribeConfiguredServers();
    return settings;
  }

  async setDefaultMqttServer(serverId: number | null): Promise<WagoSettings> {
    return this.setSettings(serverId);
  }

  async getDraft(controllerId: number): Promise<WagoConfigurationDraft | null> {
    await this.claimedController(controllerId);
    return this.drafts.findOneBy({ controllerId });
  }

  async saveDraft(
    controllerId: number,
    snapshot: unknown,
    metadata?: ConfigurationEditorMetadata,
    principal?: PluginAuditPrincipal,
  ): Promise<WagoConfigurationDraft> {
    return this.withConfigurationLock(controllerId, async () => {
      const previous = await this.getDraft(controllerId);
      const validatedMetadata = metadata === undefined ? undefined : editorMetadata(metadata);
      const previousMetadata = this.metadataFromProvenance(previous?.presetProvenance);
      const before = previous ? JSON.parse(previous.snapshot) : null;
      const candidate = snapshot as WagoConfigurationSnapshot;
      let persist = () => this.saveDraftWhileLocked(controllerId, snapshot, validatedMetadata);
      if (principal && validateEditorSnapshot(snapshot).length === 0) {
        for (const application of validatedMetadata?.presets ?? []) {
          if (
            !candidate.logicalChannels.some(
              (channel) =>
                channel.id === application.channelId && channel.physicalPointId === application.physicalPointId,
            )
          )
            continue;
          const old = previousMetadata.presets.find(
            (entry) => entry.presetId === application.presetId && entry.channelId === application.channelId,
          );
          if (
            old &&
            configurationHash(old) === configurationHash(application) &&
            configurationHash(
              (before as WagoConfigurationSnapshot | null)?.logicalChannels.find(
                (channel) => channel.id === application.channelId,
              ) ?? null,
            ) ===
              configurationHash(
                candidate.logicalChannels.find((channel) => channel.id === application.channelId) ?? null,
              )
          )
            continue;
          const operation = persist;
          const details = {
            presetId: application.presetId,
            channelId: application.channelId,
            before: wagoAuditSummary(before),
          };
          persist = () =>
            new WagoAudit(this.context).run(
              principal,
              controllerId,
              old ? 'preset_reapplication' : 'preset_application',
              details,
              operation,
              (saved) => ({ ...details, after: wagoAuditSummary(JSON.parse(saved.snapshot)) }),
            );
        }
        for (const profile of candidate.modbus?.profiles ?? []) {
          const old = (before as WagoConfigurationSnapshot | null)?.modbus?.profiles.find(
            (entry) => entry.id === profile.id,
          );
          if (old && configurationHash(old) === configurationHash(profile)) continue;
          const operation = persist;
          const details = { profileId: profile.id, profileVersion: profile.version, before: wagoAuditSummary(before) };
          persist = () =>
            new WagoAudit(this.context).run(
              principal,
              controllerId,
              old ? 'profile_change' : 'profile_creation',
              details,
              operation,
              (saved) => ({ ...details, after: wagoAuditSummary(JSON.parse(saved.snapshot)) }),
            );
        }
      }
      return persist();
    });
  }

  presets() {
    return WAGO_PRESETS;
  }

  async previewPreset(controllerId: number, application: WagoPresetApplication, snapshot?: WagoConfigurationSnapshot) {
    const draft = await this.getDraft(controllerId);
    const source =
      snapshot ?? (draft ? JSON.parse(draft.snapshot) : { version: 1, physicalPoints: [], logicalChannels: [] });
    try {
      return previewConfigurationPreset(source, application);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'invalid preset');
    }
  }

  async validateDraft(
    controllerId: number,
    snapshot?: unknown,
  ): Promise<{ valid: boolean; errors: ConfigurationValidationError[] }> {
    const draft = await this.getDraft(controllerId);
    if (!draft && snapshot === undefined)
      throw new NotFoundException(`WAGO controller ${controllerId} has no configuration draft`);
    const errors = validateEditorSnapshot(snapshot === undefined && draft ? JSON.parse(draft.snapshot) : snapshot);
    return { valid: errors.length === 0, errors };
  }

  private async draftForPreset(controllerId: number): Promise<WagoConfigurationDraft> {
    await this.claimedController(controllerId);
    const draft = await this.drafts.findOneBy({ controllerId });
    if (!draft) throw new NotFoundException(`WAGO controller ${controllerId} has no configuration draft`);
    return draft;
  }

  async applyPreset(
    controllerId: number,
    application: WagoPresetApplication,
    selectedPaths: string[],
    previewedDraftHash: string,
    snapshotOrPrincipal?: WagoConfigurationSnapshot | PluginAuditPrincipal,
    principal?: PluginAuditPrincipal,
  ): Promise<Pick<WagoConfigurationDraft, 'snapshot'>> {
    if (snapshotOrPrincipal && 'version' in snapshotOrPrincipal) {
      await this.claimedController(controllerId);
      return {
        snapshot: canonicalSnapshot(
          selectPresetChanges(snapshotOrPrincipal, application, selectedPaths, previewedDraftHash),
        ),
      };
    }
    if (snapshotOrPrincipal && 'userId' in snapshotOrPrincipal) principal ??= snapshotOrPrincipal;
    return this.withConfigurationLock(controllerId, async () => {
      const draft = await this.draftForPreset(controllerId);
      const snapshot = JSON.parse(draft.snapshot) as WagoConfigurationSnapshot;
      if (previewedDraftHash !== configurationHash(snapshot))
        throw new ConflictException('selected preset changes no longer match the configuration draft');
      const candidate = applyPreset(snapshot, application);
      const diff = configurationDiff(snapshot, candidate);
      const validPaths = new Set(diff.map((change) => change.path));
      if (!Array.isArray(selectedPaths) || selectedPaths.some((path) => !validPaths.has(path)))
        throw new ConflictException('selected preset changes no longer match the configuration draft');
      const updatedSnapshot = applySelectedChanges(snapshot, diff, selectedPaths);
      if (configurationHash(updatedSnapshot) === configurationHash(snapshot)) return draft;
      const provenance = parsePresetProvenance(draft.presetProvenance);
      const metadata = this.metadataFromProvenance(draft.presetProvenance);
      const reapplied = [...provenance, ...metadata.presets].some((entry) => {
        if (!entry || typeof entry !== 'object') return false;
        const previous = entry as { presetId?: string; channelId?: string };
        return (
          previous.presetId === application.presetId &&
          (previous.channelId === application.channelId ||
            (!previous.channelId &&
              snapshot.logicalChannels.some(
                (channel) => channel.id === application.channelId && channel.profile === application.presetId,
              )))
        );
      });
      const details = {
        presetId: application.presetId,
        channelId: application.channelId,
        before: wagoAuditSummary(snapshot),
      };
      const persist = async () => {
        draft.snapshot = canonicalSnapshot(updatedSnapshot);
        draft.reviewedHash = null;
        const storedProvenance = draft.presetProvenance ? JSON.parse(draft.presetProvenance) : null;
        draft.presetProvenance = storedProvenance?.editor
          ? JSON.stringify({
              ...storedProvenance,
              editor: {
                ...metadata,
                presets: [
                  ...metadata.presets.filter((entry) => entry.channelId !== application.channelId),
                  application,
                ],
              },
            })
          : JSON.stringify([
              ...provenance.slice(-99),
              {
                presetId: application.presetId,
                channelId: application.channelId,
                appliedAt: new Date().toISOString(),
                selectedPaths,
              },
            ]);
        draft.updatedAt = new Date().toISOString();
        return this.drafts.save(draft);
      };
      // Classification and before/after evidence belong to this same configuration lock.
      return principal
        ? new WagoAudit(this.context).run(
            principal,
            controllerId,
            reapplied ? 'preset_reapplication' : 'preset_application',
            details,
            persist,
            (saved) => ({ ...details, after: wagoAuditSummary(JSON.parse(saved.snapshot)) }),
          )
        : persist();
    });
  }

  async revisionsFor(
    controllerId: number,
    offset = 0,
    limit = 20,
  ): Promise<{ revisions: Array<Omit<WagoConfigurationRevision, 'snapshot'>>; offset: number; limit: number }> {
    await this.claimedController(controllerId);
    const pageOffset = Number.isSafeInteger(offset) && offset > 0 ? offset : 0;
    const pageLimit = Number.isSafeInteger(limit) && limit > 0 ? Math.min(limit, 100) : 20;
    const revisions = await this.revisions.find({
      where: { controllerId },
      order: { revision: 'DESC' },
      select: [
        'id',
        'controllerId',
        'revision',
        'contentHash',
        'state',
        'rejectionErrors',
        'rejectionAcknowledgedAt',
        'rejectionAcknowledgedBy',
        'publishedAt',
        'reportedAt',
        'presetProvenance',
      ],
      skip: pageOffset,
      take: pageLimit,
    });
    return { revisions, offset: pageOffset, limit: pageLimit };
  }

  async reviewDraft(controllerId: number): Promise<{
    impacts: Awaited<ReturnType<typeof configurationFlowImpacts>>;
    draft: WagoConfigurationDraft;
    previous: WagoConfigurationRevision | null;
    changed: boolean;
    diff: ReturnType<typeof configurationDiff>;
    metadataDiff: ReturnType<typeof configurationDiff>;
  }> {
    return this.withConfigurationLock(controllerId, () => this.reviewDraftWhileLocked(controllerId));
  }

  async publishDraft(
    controllerId: number,
    force = false,
    reviewedHash?: string,
    principal?: PluginAuditPrincipal,
  ): Promise<WagoConfigurationRevision> {
    return this.withConfigurationLock(controllerId, () =>
      this.publishDraftWhileLocked(controllerId, force, reviewedHash, principal),
    );
  }

  async rollback(
    controllerId: number,
    revision: number,
    force = false,
    sourceHash?: string,
    currentHash?: string | null,
    draftHash?: string,
    principal?: PluginAuditPrincipal,
  ): Promise<WagoConfigurationRevision> {
    return this.withConfigurationLock(controllerId, async () => {
      const controller = await this.claimedController(controllerId);
      this.requireConfigurationCompatibility(controller);
      const source = await this.revisions.findOneBy({ controllerId, revision });
      if (!source) throw new NotFoundException(`WAGO configuration revision ${revision} not found`);
      const current = await this.latestRevision(controllerId);
      const draft = await this.drafts.findOneBy({ controllerId });
      const snapshot = JSON.parse(source.snapshot);
      const errors = validateEditorSnapshot(snapshot);
      if (errors.length) throw new ConflictException({ message: 'rollback configuration is invalid', errors });
      const approvedImpacts = await configurationFlowImpacts(
        this.context,
        controllerId,
        current ? JSON.parse(current.snapshot) : null,
        snapshot,
      );
      const assertPreview = (impacts: typeof approvedImpacts) => {
        if (
          draftHash !== this.rollbackIdentity(draft, current, source, impacts) ||
          sourceHash !== source.contentHash ||
          currentHash !== (current?.contentHash ?? null)
        )
          throw new ConflictException('configuration changed since rollback preview; preview and confirm again');
      };
      assertPreview(approvedImpacts);
      if (approvedImpacts.length && !force)
        throw new ConflictException({
          message: 'acknowledge potential flow impacts before publishing',
          impacts: approvedImpacts,
        });
      const persist = async () => {
        // Flow edits use a separate lock. Recheck before replacing the draft, then
        // carry the original consent into publication instead of silently re-reviewing.
        assertPreview(
          await configurationFlowImpacts(
            this.context,
            controllerId,
            current ? JSON.parse(current.snapshot) : null,
            snapshot,
          ),
        );
        const replacement = await this.saveDraftWhileLocked(
          controllerId,
          snapshot,
          (source.presetProvenance ? JSON.parse(source.presetProvenance).editor : null) ?? { names: {}, presets: [] },
        );
        const approvedHash = this.reviewIdentity(replacement, current, approvedImpacts);
        replacement.reviewedHash = approvedHash;
        await this.drafts.save(replacement);
        return this.publishDraftWhileLocked(controllerId, force, approvedHash);
      };
      return principal
        ? new WagoAudit(this.context).run(
            principal,
            controllerId,
            'rollback',
            { sourceRevision: revision },
            persist,
            (published) => ({ revision: published.revision }),
          )
        : persist();
    });
  }

  async acknowledgeRejection(
    controllerId: number,
    revision: number,
    expected: { contentHash?: string; reportedAt?: string },
    principal: PluginAuditPrincipal,
  ): Promise<WagoConfigurationRevision> {
    return this.withConfigurationLock(controllerId, async () => {
      await this.claimedController(controllerId);
      const rejected = await this.revisions.findOneBy({ controllerId, revision });
      if (!rejected) throw new NotFoundException(`WAGO configuration revision ${revision} not found`);
      if (
        rejected.state !== 'rejected' ||
        !rejected.reportedAt ||
        expected.contentHash !== rejected.contentHash ||
        expected.reportedAt !== rejected.reportedAt
      )
        throw new ConflictException('rejection changed; refresh and review it before acknowledging');
      if (rejected.rejectionAcknowledgedAt) return rejected;
      return new WagoAudit(this.context).run(
        principal,
        controllerId,
        'rejection_acknowledgement',
        { revision },
        async () => {
          return this.revisions.save({
            ...rejected,
            rejectionAcknowledgedAt: new Date().toISOString(),
            rejectionAcknowledgedBy: principal.userId,
          });
        },
      );
    });
  }

  async previewRevision(
    controllerId: number,
    revision: number,
  ): Promise<{
    impacts: Awaited<ReturnType<typeof configurationFlowImpacts>>;
    revision: WagoConfigurationRevision;
    draftHash: string;
    current: WagoConfigurationRevision | null;
    diff: ReturnType<typeof configurationDiff>;
    metadataDiff: ReturnType<typeof configurationDiff>;
  }> {
    return this.withConfigurationLock(controllerId, async () => {
      await this.claimedController(controllerId);
      const selected = await this.revisions.findOneBy({ controllerId, revision });
      if (!selected) throw new NotFoundException(`WAGO configuration revision ${revision} not found`);
      const [current] = await this.revisions.find({ where: { controllerId }, order: { revision: 'DESC' }, take: 1 });
      const draft = await this.drafts.findOneBy({ controllerId });
      const impacts = await configurationFlowImpacts(
        this.context,
        controllerId,
        current ? JSON.parse(current.snapshot) : null,
        JSON.parse(selected.snapshot),
      );
      return {
        draftHash: this.rollbackIdentity(draft, current ?? null, selected, impacts),
        impacts,
        revision: selected,
        current: current ?? null,
        diff: configurationDiff(current ? JSON.parse(current.snapshot) : null, JSON.parse(selected.snapshot)),
        metadataDiff: configurationDiff(
          this.metadataFromProvenance(current?.presetProvenance),
          this.metadataFromProvenance(selected.presetProvenance),
        ),
      };
    });
  }

  private revisionIdentity(revision: WagoConfigurationRevision | null): unknown {
    return revision
      ? { revision: revision.revision, contentHash: revision.contentHash, metadata: revision.presetProvenance ?? null }
      : null;
  }

  private impactIdentity(impacts: Awaited<ReturnType<typeof configurationFlowImpacts>>): unknown {
    return impacts
      .map((impact) => ({
        ...impact,
        references: [...impact.references].sort((a, b) => configurationHash(a).localeCompare(configurationHash(b))),
      }))
      .sort((a, b) => a.channelId.localeCompare(b.channelId));
  }

  private reviewIdentity(
    draft: WagoConfigurationDraft,
    current: WagoConfigurationRevision | null,
    impacts: Awaited<ReturnType<typeof configurationFlowImpacts>>,
  ): string {
    return configurationHash({
      draft: this.draftIdentity(draft),
      current: this.revisionIdentity(current),
      impacts: this.impactIdentity(impacts),
    });
  }

  private rollbackIdentity(
    draft: WagoConfigurationDraft | null,
    current: WagoConfigurationRevision | null,
    source: WagoConfigurationRevision,
    impacts: Awaited<ReturnType<typeof configurationFlowImpacts>>,
  ): string {
    return configurationHash({
      draft: this.draftIdentity(draft),
      current: this.revisionIdentity(current),
      source: this.revisionIdentity(source),
      impacts: this.impactIdentity(impacts),
    });
  }

  private draftIdentity(draft: WagoConfigurationDraft | null): string {
    return configurationHash({
      draft: draft ? { snapshot: draft.snapshot, metadata: draft.presetProvenance ?? null } : null,
    });
  }

  private metadataFromProvenance(provenance: string | null | undefined): ConfigurationEditorMetadata {
    if (!provenance) return { names: {}, presets: [] };
    try {
      return editorMetadata(JSON.parse(provenance).editor);
    } catch {
      return { names: {}, presets: [] };
    }
  }

  private async saveDraftWhileLocked(
    controllerId: number,
    snapshot: unknown,
    metadata?: ConfigurationEditorMetadata,
  ): Promise<WagoConfigurationDraft> {
    await this.claimedController(controllerId);
    let provenance: string | undefined;
    if (metadata !== undefined) {
      try {
        provenance = JSON.stringify({ editor: editorMetadata(metadata) });
      } catch (error) {
        throw new BadRequestException(error instanceof Error ? error.message : 'invalid editor metadata');
      }
    }
    const serialized = canonicalSnapshot(snapshot);
    const existing = await this.drafts.findOneBy({ controllerId });
    const draft =
      existing ??
      this.drafts.create({
        controllerId,
        snapshot: serialized,
        reviewedHash: null,
        presetProvenance: null,
        updatedAt: '',
      });
    draft.snapshot = serialized;
    if (provenance !== undefined) draft.presetProvenance = provenance;
    draft.reviewedHash = null;
    draft.updatedAt = new Date().toISOString();
    return this.drafts.save(draft);
  }

  private async reviewDraftWhileLocked(controllerId: number): Promise<{
    impacts: Awaited<ReturnType<typeof configurationFlowImpacts>>;
    draft: WagoConfigurationDraft;
    previous: WagoConfigurationRevision | null;
    changed: boolean;
    diff: ReturnType<typeof configurationDiff>;
    metadataDiff: ReturnType<typeof configurationDiff>;
  }> {
    await this.claimedController(controllerId);
    const draft = await this.drafts.findOneBy({ controllerId });
    if (!draft) throw new NotFoundException(`WAGO controller ${controllerId} has no configuration draft`);
    const previous = await this.latestRevision(controllerId);
    const impacts = await configurationFlowImpacts(
      this.context,
      controllerId,
      previous ? JSON.parse(previous.snapshot) : null,
      JSON.parse(draft.snapshot),
    );
    draft.reviewedHash = this.reviewIdentity(draft, previous, impacts);
    await this.drafts.save(draft);
    const diff = configurationDiff(previous ? JSON.parse(previous.snapshot) : null, JSON.parse(draft.snapshot));
    const metadataDiff = configurationDiff(
      this.metadataFromProvenance(previous?.presetProvenance),
      this.metadataFromProvenance(draft.presetProvenance),
    );
    return {
      draft,
      previous,
      changed: diff.length > 0 || metadataDiff.length > 0,
      diff,
      metadataDiff,
      impacts,
    };
  }

  private requireConfigurationCompatibility(controller: WagoController): void {
    const incompatibility = compatibilityError({
      protocolVersion: controller.protocolVersion,
      capabilities: JSON.parse(controller.capabilities) as string[],
    });
    if (incompatibility) throw new ConflictException(`Cannot publish configuration: ${incompatibility}`);
  }

  private async publishDraftWhileLocked(
    controllerId: number,
    force = false,
    reviewedHash?: string,
    principal?: PluginAuditPrincipal,
  ): Promise<WagoConfigurationRevision> {
    const controller = await this.claimedController(controllerId);
    this.requireConfigurationCompatibility(controller);
    const draft = await this.drafts.findOneBy({ controllerId });
    if (!draft) throw new NotFoundException(`WAGO controller ${controllerId} has no configuration draft`);
    const validation = validateEditorSnapshot(JSON.parse(draft.snapshot));
    if (validation.length)
      throw new ConflictException({ message: 'configuration draft is invalid', errors: validation });
    const contentHash = configurationHash(JSON.parse(draft.snapshot));
    const previous = await this.latestRevision(controllerId);
    const impacts = await configurationFlowImpacts(
      this.context,
      controllerId,
      previous ? JSON.parse(previous.snapshot) : null,
      JSON.parse(draft.snapshot),
    );
    const reviewIdentity = this.reviewIdentity(draft, previous, impacts);
    if (reviewedHash !== undefined && reviewedHash !== reviewIdentity)
      throw new ConflictException('draft changed since your review; review it again');
    if (draft.reviewedHash !== reviewIdentity)
      throw new ConflictException('review the current configuration draft before publishing it');
    if (impacts.length && !force)
      throw new ConflictException({ message: 'acknowledge potential flow impacts before publishing', impacts });
    const persist = async () => {
      if (
        previous?.state === 'pending' &&
        previous.contentHash === contentHash &&
        (previous.presetProvenance ?? null) === (draft.presetProvenance ?? null)
      )
        return this.publishRevision(controller, previous);
      const revision = this.revisions.create({
        controllerId,
        revision: (previous?.revision ?? 0) + 1,
        snapshot: draft.snapshot,
        presetProvenance: draft.presetProvenance ?? null,
        contentHash,
        state: 'pending',
        rejectionErrors: null,
        publishedAt: new Date().toISOString(),
        reportedAt: null,
      });
      return this.publishRevision(controller, await this.revisions.save(revision));
    };
    return principal
      ? new WagoAudit(this.context).run(
          principal,
          controllerId,
          force ? 'forced_publication' : 'publication',
          {},
          persist,
          (published) => ({ revision: published.revision }),
        )
      : persist();
  }

  private async latestRevision(controllerId: number): Promise<WagoConfigurationRevision | null> {
    const [revision] = await this.revisions.find({ where: { controllerId }, order: { revision: 'DESC' }, take: 1 });
    return revision ?? null;
  }

  async createEnrollment(
    hardwareId: string,
    mqttServerId?: number,
    manualCredentials?: { username: string; password: string },
  ): Promise<{
    id: number;
    broker: { host: string; port: number; useTls: boolean };
    username: string;
    password?: string;
    claimSecret: string;
    expiresAt: string;
    manualInstructions?: readonly string[];
  }> {
    const normalizedHardwareId = hardwareId.trim();
    if (!isValidHardwareId(normalizedHardwareId))
      throw new ConflictException('a valid hardware ID without MQTT separators or wildcards is required');
    const selectedServerId = mqttServerId ?? (await this.getSettings()).defaultMqttServerId;
    if (!selectedServerId) throw new ConflictException('select an MQTT server before creating an enrollment package');
    const server = await this.context.getMqttServerConfig(selectedServerId);
    if (!server) throw new NotFoundException(`MQTT server ${selectedServerId} not found`);
    const claimSecret = randomBytes(24).toString('base64url');
    const identity = `wago-enrollment-${randomBytes(8).toString('hex')}`;
    const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
    const provisionedCredential = await this.context.getMqttCredentialProvisioning().provision({
      mqttServerId: selectedServerId,
      identity,
      username: identity,
      vhost: '/',
      topicPolicy: {
        publish: [discoveryTopic(normalizedHardwareId), `${discoveryTopic(normalizedHardwareId)}/claim/ack`],
        subscribe: [`${discoveryTopic(normalizedHardwareId)}/claim`],
      },
    });
    if (!('password' in provisionedCredential) && !manualCredentials)
      throw new ConflictException(
        `Manual discovery credentials are required: ${provisionedCredential.instructions.join(' ')}`,
      );
    const credential = 'password' in provisionedCredential ? provisionedCredential : manualCredentials;
    if (!credential?.username.trim() || !credential.password)
      throw new ConflictException('a manual discovery username and password are required');
    const enrollment = await this.enrollments.save(
      this.enrollments.create({
        mqttServerId: selectedServerId,
        hardwareId: normalizedHardwareId,
        secretHash: hash(claimSecret),
        identity: credential.username,
        createdAt: new Date().toISOString(),
        expiresAt,
      }),
    );
    this.scheduleEnrollmentExpiry(enrollment);
    await this.subscribeConfiguredServers().catch((error) => {
      this.context.logger.warn(`Could not refresh WAGO MQTT subscriptions after enrollment: ${String(error)}`);
      this.scheduleSubscriptionRetry();
    });
    return {
      id: enrollment.id,
      broker: { host: server.host, port: server.port, useTls: server.useTls },
      username: credential.username,
      password: 'password' in credential ? credential.password : undefined,
      claimSecret,
      expiresAt,
      manualInstructions:
        'instructions' in provisionedCredential
          ? provisionedCredential.instructions.map((instruction) =>
              instruction.replaceAll(identity, () => credential.username),
            )
          : undefined,
    };
  }

  /** Server-side commissioning revokes the enrollment it created without exposing credentials to a browser. */
  async revokeEnrollmentById(id: number): Promise<void> {
    const enrollment = await this.enrollments.findOneBy({ id });
    // Expiry limits enrollment use but does not revoke the provisioned broker credential.
    if (enrollment && !enrollment.consumedAt) await this.revokeEnrollment(enrollment);
  }

  async deleteEnrollmentById(id: number): Promise<void> {
    await this.enrollments.delete(id);
  }

  /** Revokes the controller's access before removing all of its local state. */
  async remove(id: number): Promise<string> {
    return this.withClaimLock(id, () =>
      this.withClaimConfigurationLock(async () => {
        const controller = await this.controllers.findOneBy({ id });
        if (!controller) throw new NotFoundException(`WAGO controller ${id} not found`);

        if (controller.trustState === 'claimed' && controller.mqttServerId) {
          const identity = `wago-controller-${controller.hardwareId}`;
          const manual = await this.context.getMqttCredentialProvisioning().revoke({
            mqttServerId: controller.mqttServerId,
            identity,
            username: identity,
            vhost: '/',
          });
          if (manual)
            throw new ConflictException(`Manual credential revocation is required: ${manual.instructions.join(' ')}`);
        }

        if (controller.enrollmentId) await this.revokeEnrollmentById(controller.enrollmentId);
        await Promise.all([this.drafts.delete({ controllerId: id }), this.revisions.delete({ controllerId: id })]);
        await this.controllers.delete(id);
        this.configurationReportQueues.delete(id);
        await this.subscribeConfiguredServers().catch((error) => {
          this.context.logger.warn(
            `Could not refresh WAGO MQTT subscriptions after controller removal: ${String(error)}`,
          );
          this.scheduleSubscriptionRetry();
        });
        return controller.hardwareId;
      }),
    );
  }

  async claim(id: number, name: string, verifier: string, mqttServerId?: number): Promise<WagoController> {
    return this.withClaimLock(id, async () => {
      const prepared = await this.withClaimConfigurationLock(() => this.prepareClaim(id, name, verifier, mqttServerId));
      try {
        const acknowledgementToken = randomBytes(24).toString('base64url');
        await this.watchClaimAcknowledgement(prepared, acknowledgementToken);
        await this.context.mqtt.publish(
          prepared.mqttServerId,
          `${discoveryTopic(prepared.controller.hardwareId)}/claim`,
          JSON.stringify({
            username: prepared.credential.username,
            password: prepared.credential.password,
            configuration: prepared.configuration,
            acknowledgementToken,
          }),
          { qos: 1 },
        );
        prepared.credentialDelivered = true;
        await this.context.mqtt.publish(prepared.mqttServerId, discoveryTopic(prepared.controller.hardwareId), '', {
          qos: 1,
          retain: true,
        });
        return prepared.controller;
      } catch (error) {
        this.clearClaimAcknowledgement(prepared.enrollment.id);
        if (!prepared.credentialDelivered) await this.restoreUnclaimedController(prepared);
        throw error;
      } finally {
        await this.subscribeConfiguredServers().catch((error) => {
          this.context.logger.warn(`Could not refresh WAGO MQTT subscriptions after claim: ${String(error)}`);
          this.scheduleSubscriptionRetry();
        });
      }
    });
  }

  private async prepareClaim(
    id: number,
    name: string,
    verifier: string,
    mqttServerId?: number,
  ): Promise<{
    controller: WagoController;
    enrollment: WagoEnrollment;
    mqttServerId: number;
    credential: { username: string; password: string };
    configuration: { protocolVersion: number; namespace: string; desiredTopic: string; reportedTopic: string };
    identity: string;
    previousController: Pick<WagoController, 'trustState' | 'name' | 'mqttServerId' | 'updatedAt'>;
    credentialDelivered: boolean;
  }> {
    const controller = await this.controllers.findOneBy({ id });
    if (!controller) throw new NotFoundException(`WAGO controller ${id} not found`);
    if (controller.trustState === 'claimed') throw new ConflictException('controller has already been claimed');
    if (!name.trim()) throw new ConflictException('a controller name is required');
    if (!this.matchesVerifier(controller, verifier))
      throw new ConflictException('physical pairing code or fingerprint does not match the controller');
    if (controller.compatibilityError) throw new ConflictException(controller.compatibilityError);
    const selectedServerId = mqttServerId ?? controller.mqttServerId;
    if (!selectedServerId) throw new ConflictException('select an MQTT server before claiming this controller');
    if (selectedServerId !== controller.mqttServerId)
      throw new ConflictException('claim the controller on the MQTT server used for its enrollment package');
    if (!(await this.context.getMqttServerConfig(selectedServerId)))
      throw new NotFoundException(`MQTT server ${selectedServerId} not found`);
    const enrollment = await this.activeEnrollment(controller.enrollmentId);
    if (!enrollment)
      throw new ConflictException(
        'the controller enrollment package has expired or was already consumed; create a new one',
      );

    const identity = `wago-controller-${controller.hardwareId}`;
    const settings = await this.getSettings();
    const namespace = normalizeOperationalPrefix(settings.operationalPrefix);
    const credential = await this.context.getMqttCredentialProvisioning().provision({
      mqttServerId: selectedServerId,
      identity,
      username: identity,
      vhost: '/',
      topicPolicy: {
        publish: [`${namespace}/v${CONFIGURATION_PROTOCOL_VERSION}/controllers/${controller.hardwareId}/#`],
        subscribe: [
          configurationDesiredTopic(namespace, controller.hardwareId),
          commandTopic(namespace, controller.hardwareId),
        ],
      },
    });
    if (!('password' in credential)) {
      throw new ConflictException(`Manual credential provisioning is required: ${credential.instructions.join(' ')}`);
    }
    const previousController = {
      trustState: controller.trustState,
      name: controller.name,
      mqttServerId: controller.mqttServerId,
      updatedAt: controller.updatedAt,
    };
    try {
      // Persist the claimed state before delivery so post-delivery failures cannot revoke its credentials.
      controller.trustState = 'claimed';
      controller.name = name.trim();
      controller.mqttServerId = selectedServerId;
      controller.updatedAt = new Date().toISOString();
      await this.controllers.save(controller);
      return {
        controller,
        enrollment,
        mqttServerId: selectedServerId,
        credential,
        configuration: {
          protocolVersion: CONFIGURATION_PROTOCOL_VERSION,
          namespace,
          desiredTopic: configurationDesiredTopic(namespace, controller.hardwareId),
          reportedTopic: configurationReportedTopic(namespace, controller.hardwareId),
        },
        identity,
        previousController,
        credentialDelivered: false,
      };
    } catch (error) {
      await this.restoreUnclaimedControllerWhileLocked({
        controller,
        mqttServerId: selectedServerId,
        identity,
        previousController,
      });
      throw error;
    }
  }

  private async restoreUnclaimedController({
    controller,
    mqttServerId,
    identity,
    previousController,
  }: {
    controller: WagoController;
    mqttServerId: number;
    identity: string;
    previousController: Pick<WagoController, 'trustState' | 'name' | 'mqttServerId' | 'updatedAt'>;
  }): Promise<void> {
    await this.withClaimConfigurationLock(() =>
      this.restoreUnclaimedControllerWhileLocked({
        controller,
        mqttServerId,
        identity,
        previousController,
      }),
    );
  }

  private async restoreUnclaimedControllerWhileLocked({
    controller,
    mqttServerId,
    identity,
    previousController,
  }: {
    controller: WagoController;
    mqttServerId: number;
    identity: string;
    previousController: Pick<WagoController, 'trustState' | 'name' | 'mqttServerId' | 'updatedAt'>;
  }): Promise<void> {
    await this.context
      .getMqttCredentialProvisioning()
      .revoke({ mqttServerId, identity, username: identity, vhost: '/' })
      .catch(() => undefined);
    Object.assign(controller, previousController);
    await this.controllers.save(controller).catch((rollbackError) => {
      this.context.logger.warn(
        `Could not restore WAGO controller ${controller.id} after claim failure: ${String(rollbackError)}`,
      );
    });
  }

  private async subscribeConfiguredServers(): Promise<void> {
    if (this.destroyed) return;
    const rebuild = this.subscriptionRebuild.then(() => this.rebuildSubscriptions());
    this.subscriptionRebuild = rebuild.catch(() => undefined);
    return rebuild;
  }

  private async rebuildSubscriptions(): Promise<void> {
    if (this.destroyed) return;
    const settings = await this.getSettings();
    const [controllers, enrollments] = await Promise.all([this.controllers.find(), this.activeEnrollments()]);
    const serverIds = new Set<number>();
    if (settings.defaultMqttServerId) serverIds.add(settings.defaultMqttServerId);
    controllers
      .filter((controller) => controller.trustState === 'claimed')
      .forEach((controller) => {
        const serverId = controller.mqttServerId ?? settings.defaultMqttServerId;
        if (serverId) serverIds.add(serverId);
      });
    enrollments.forEach((enrollment) => {
      serverIds.add(enrollment.mqttServerId);
    });
    const generation = this.activeSubscriptionGeneration + 1;
    const replacements: PluginMqttSubscription[] = [];
    const retainedStates = new Map<number, Buffer>();
    try {
      for (const serverId of serverIds) {
        replacements.push(
          await this.subscribeMqtt(serverId, `${DISCOVERY_ROOT}/+`, async (message) => {
            if (!this.isActiveSubscriptionGeneration(generation)) return;
            await this.onDiscovery(serverId, message.topic, message.payload);
          }),
        );
        if (this.destroyed) {
          replacements.forEach((subscription) => subscription.unsubscribe());
          return;
        }
        const claimedControllers = controllers.filter(
          (item) => item.trustState === 'claimed' && (item.mqttServerId ?? settings.defaultMqttServerId) === serverId,
        );
        const controllersByHardwareId = new Map(
          claimedControllers.map((controller) => [controller.hardwareId, controller]),
        );
        replacements.push(
          await this.subscribeMqtt(
            serverId,
            configurationReportedWildcardTopic(settings.operationalPrefix),
            (message) => {
              if (!this.isActiveSubscriptionGeneration(generation)) return;
              const hardwareId = configurationReportedHardwareId(settings.operationalPrefix, message.topic);
              const controller = hardwareId ? controllersByHardwareId.get(hardwareId) : undefined;
              if (controller) {
                this.diagnostics.ingest(controller.id, 'configuration/reported', message.payload);
                this.enqueueConfigurationReport(controller.id, message.payload);
              }
            },
          ),
        );
        replacements.push(
          await this.subscribeMqtt(serverId, acknowledgementWildcardTopic(settings.operationalPrefix), (message) => {
            if (!this.isActiveSubscriptionGeneration(generation)) return;
            const hardwareId = acknowledgementHardwareId(settings.operationalPrefix, message.topic);
            const controller = hardwareId ? controllersByHardwareId.get(hardwareId) : undefined;
            if (controller) {
              this.diagnostics.ingest(controller.id, 'acknowledgements', message.payload);
              this.onCommandAcknowledgement(controller.id, message.payload);
            }
          }),
        );
        if (this.destroyed) {
          replacements.forEach((subscription) => subscription.unsubscribe());
          return;
        }
        for (const controller of claimedControllers) {
          for (const suffix of ['state', 'measurements', 'faults']) {
            replacements.push(
              await this.subscribeMqtt(
                serverId,
                `${settings.operationalPrefix}/v1/controllers/${controller.hardwareId}/${suffix}`,
                (message) => {
                  if (this.isActiveSubscriptionGeneration(generation))
                    this.diagnostics.ingest(controller.id, suffix, message.payload);
                  // MQTT may deliver a retained snapshot before the generation swap completes.
                  else if (!this.destroyed && suffix === 'state' && message.payload.length <= 65_536)
                    retainedStates.set(controller.id, Buffer.from(message.payload));
                },
              ),
            );
          }
          replacements.push(
            await this.subscribeMqtt(
              serverId,
              heartbeatTopic(settings.operationalPrefix, controller.hardwareId),
              async (message) => {
                if (!this.isActiveSubscriptionGeneration(generation)) return;
                await this.onHeartbeat(controller.hardwareId, message.payload);
              },
            ),
          );
          if (this.destroyed) {
            replacements.forEach((subscription) => subscription.unsubscribe());
            return;
          }
        }
      }
    } catch (error) {
      replacements.forEach((subscription) => subscription.unsubscribe());
      throw error;
    }
    if (this.destroyed) {
      replacements.forEach((subscription) => subscription.unsubscribe());
      return;
    }
    // New handlers are inert until this synchronous generation swap disables the old set.
    this.activeSubscriptionGeneration = generation;
    retainedStates.forEach((payload, controllerId) => this.diagnostics.ingest(controllerId, 'state', payload));
    this.unsubscribe();
    this.subscriptions.push(...replacements);
  }

  private unsubscribe(): void {
    this.subscriptions.splice(0).forEach((subscription) => subscription.unsubscribe());
  }

  private async subscribeMqtt(
    ...args: Parameters<PluginContext['mqtt']['subscribe']>
  ): Promise<PluginMqttSubscription> {
    try {
      return await this.context.mqtt.subscribe(...args);
    } catch (error) {
      throw new MqttSubscriptionError(error);
    }
  }

  private isActiveSubscriptionGeneration(generation: number): boolean {
    return !this.destroyed && generation === this.activeSubscriptionGeneration;
  }

  private async onDiscovery(serverId: number, topic: string, payload: Buffer): Promise<void> {
    const hardwareId = topic.slice(`${DISCOVERY_ROOT}/`.length);
    if (!isValidHardwareId(hardwareId)) return;
    let announcement: WagoAnnouncement;
    try {
      announcement = parseAnnouncement(payload);
    } catch (error) {
      this.context.logger.warn(
        `Ignoring invalid WAGO announcement: ${error instanceof Error ? error.message : String(error)}`,
      );
      return;
    }
    if (announcement.hardwareId !== hardwareId) {
      this.context.logger.warn(`Ignoring WAGO announcement with mismatched hardware ID on ${topic}`);
      return;
    }
    const enrollment = announcement.enrollmentSecret
      ? await this.validEnrollment(announcement.enrollmentSecret, serverId, hardwareId)
      : null;
    if (!enrollment) {
      this.context.logger.warn(`Ignoring WAGO announcement without a valid enrollment secret on ${topic}`);
      return;
    }
    const existing = await this.controllers.findOneBy({ hardwareId });
    if (existing?.trustState === 'claimed') return; // Discovery can never modify trusted identity or configuration.
    const now = new Date().toISOString();
    const candidate =
      existing ??
      this.controllers.create({
        hardwareId,
        trustState: 'untrusted',
        name: null,
        mqttServerId: serverId,
        enrollmentId: enrollment.id,
        pairingCodeHash: '',
        fingerprint: null,
        protocolVersion: '',
        runtimeVersion: '',
        capabilities: '[]',
        lastSequence: 0,
        lastHeartbeatAt: null,
        lastSeenAt: now,
        compatibilityError: null,
        createdAt: now,
        updatedAt: now,
      });
    candidate.mqttServerId = serverId;
    candidate.enrollmentId = enrollment.id;
    candidate.pairingCodeHash = hash(announcement.pairingCode);
    candidate.fingerprint = announcement.fingerprint ?? null;
    candidate.protocolVersion = announcement.protocolVersion;
    candidate.runtimeVersion = announcement.runtimeVersion;
    candidate.capabilities = JSON.stringify(announcement.capabilities);
    candidate.lastSequence = announcement.sequence ?? candidate.lastSequence;
    candidate.lastSeenAt = now;
    candidate.compatibilityError = compatibilityError(announcement);
    candidate.updatedAt = now;
    await this.controllers.save(candidate);
    if (this.commissioningDiscoveryHandler) {
      try {
        await this.commissioningDiscoveryHandler(candidate);
      } catch (error) {
        this.context.logger.warn(
          `Could not automatically claim commissioned WAGO controller ${candidate.hardwareId}: ${String(error)}`,
        );
      }
    }
  }

  private async onHeartbeat(hardwareId: string, payload: Buffer): Promise<void> {
    let heartbeat: WagoHeartbeat;
    try {
      heartbeat = parseHeartbeat(payload);
    } catch (error) {
      this.context.logger.warn(
        `Ignoring invalid WAGO heartbeat: ${error instanceof Error ? error.message : String(error)}`,
      );
      return;
    }
    if (heartbeat.hardwareId !== hardwareId) return;
    let rawHeartbeat: Record<string, unknown>;
    try {
      rawHeartbeat = JSON.parse(payload.toString('utf8'));
    } catch {
      return;
    }
    const canonical = canonicalEnvelope(rawHeartbeat, 'heartbeat');
    const controller = await this.controllers.findOneBy({ hardwareId });
    if (
      !controller ||
      controller.trustState !== 'claimed' ||
      (!canonical && heartbeat.sequence !== undefined && heartbeat.sequence < controller.lastSequence)
    )
      return;
    const now = new Date().toISOString();
    const canTrackDiagnostics = this.diagnostics.canTrack(controller.id);
    const admitted = this.diagnostics.ingest(controller.id, 'heartbeat', payload);
    // Rejected legacy packets must not refresh checkpoints or overwrite runtime metadata either.
    if (canTrackDiagnostics && !admitted) return;
    const heartbeatAt = admitted
      ? this.diagnostics.read(controller.id).heartbeatAt
      : typeof rawHeartbeat.timestamp === 'string'
        ? rawHeartbeat.timestamp
        : undefined;
    const persistedHeartbeatAt = sourceTime(controller.lastHeartbeatAt);
    // A full bounded diagnostic cache must not disable permanent heartbeat checkpoints.
    // Other canonical rejections remain invalid and never use receipt time as liveness.
    if (
      canonical &&
      (!validEnvelope(rawHeartbeat, Date.now()) ||
        !heartbeatAt ||
        (persistedHeartbeatAt !== null && sourceTime(heartbeatAt) < persistedHeartbeatAt))
    )
      return;
    // Connectivity is process-local between bounded persistence checkpoints.
    // Avoid a database write for every permanent heartbeat.
    const metadataChanged =
      controller.protocolVersion !== heartbeat.protocolVersion ||
      controller.runtimeVersion !== heartbeat.runtimeVersion ||
      controller.capabilities !== JSON.stringify(heartbeat.capabilities) ||
      controller.compatibilityError !== compatibilityError(heartbeat);
    if (
      controller.lastHeartbeatAt &&
      freshness(controller.lastSeenAt, Date.now(), 30_000) === 'fresh' &&
      !metadataChanged
    )
      return;
    controller.protocolVersion = heartbeat.protocolVersion;
    controller.runtimeVersion = heartbeat.runtimeVersion;
    controller.capabilities = JSON.stringify(heartbeat.capabilities);
    if (!canonical) {
      controller.lastSequence = this.diagnostics.read(controller.id).legacyHeartbeatSequence ?? controller.lastSequence;
      controller.lastHeartbeatAt = now;
    } else {
      controller.lastHeartbeatAt = heartbeatAt;
    }
    controller.lastSeenAt = now;
    controller.compatibilityError = compatibilityError(heartbeat);
    controller.updatedAt = now;
    await this.controllers.save(controller);
  }

  private async watchClaimAcknowledgement(
    prepared: {
      controller: WagoController;
      enrollment: WagoEnrollment;
      mqttServerId: number;
    },
    acknowledgementToken: string,
  ): Promise<void> {
    const topic = `${discoveryTopic(prepared.controller.hardwareId)}/claim/ack`;
    const subscription = await this.subscribeMqtt(prepared.mqttServerId, topic, async (message) => {
      if (!isClaimAcknowledgement(message.payload, acknowledgementToken)) return;
      this.clearClaimAcknowledgement(prepared.enrollment.id);
      try {
        await this.revokeEnrollment(prepared.enrollment);
      } catch (error) {
        this.context.logger.warn(
          `Could not revoke acknowledged WAGO enrollment ${prepared.enrollment.id}: ${String(error)}`,
        );
      }
    });
    this.claimAcknowledgementSubscriptions.set(prepared.enrollment.id, subscription);
  }

  private async onConfigurationReported(controllerId: number, payload: Buffer): Promise<void> {
    let report: ReturnType<typeof parseConfigurationReport>;
    try {
      report = parseConfigurationReport(JSON.parse(payload.toString('utf8')));
    } catch {
      this.context.logger.warn(`Ignoring invalid WAGO configuration report for controller ${controllerId}`);
      return;
    }
    if (!report) {
      this.context.logger.warn(`Ignoring malformed WAGO configuration report for controller ${controllerId}`);
      return;
    }
    await this.withConfigurationLock(controllerId, async () => {
      const revision = await this.revisions.findOneBy({ controllerId, revision: report.revision });
      if (!revision || revision.contentHash !== report.contentHash) return;
      if (revision.state !== 'published') return;
      revision.state = report.errors.length ? 'rejected' : 'applied';
      revision.rejectionErrors = report.errors.length ? JSON.stringify(report.errors) : null;
      revision.reportedAt = new Date().toISOString();
      await this.revisions.save(revision);
    });
  }

  private onCommandAcknowledgement(controllerId: number, payload: Buffer): void {
    this.commands.acknowledge(controllerId, payload);
  }

  private enqueueConfigurationReport(controllerId: number, payload: Buffer): void {
    const queue = this.configurationReportQueues.get(controllerId) ?? { pending: new Map(), processing: false };
    this.configurationReportQueues.set(controllerId, queue);
    if (queue.processing) {
      // Preserve acknowledgements for distinct immutable revisions in arrival order.
      const revision = this.configurationReportRevision(payload);
      const key = revision ?? Number.NaN;
      if (queue.pending.has(key) || queue.pending.size < MAX_PENDING_CONFIGURATION_REPORTS)
        queue.pending.set(key, payload);
      else this.context.logger.warn(`Dropping excess WAGO configuration report for controller ${controllerId}`);
      return;
    }
    queue.processing = true;
    void this.processConfigurationReports(controllerId, payload, queue);
  }

  private async processConfigurationReports(
    controllerId: number,
    payload: Buffer,
    queue: { pending: Map<number, Buffer>; processing: boolean },
  ): Promise<void> {
    let next: Buffer | null = payload;
    while (next) {
      try {
        await this.onConfigurationReported(controllerId, next);
      } catch (error) {
        this.context.logger.warn(`Could not process WAGO configuration report: ${String(error)}`);
      }
      const pending = queue.pending.entries().next();
      if (pending.done) next = null;
      else {
        const [revision, report] = pending.value;
        queue.pending.delete(revision);
        next = report;
      }
    }
    queue.processing = false;
    if (this.configurationReportQueues.get(controllerId) === queue) this.configurationReportQueues.delete(controllerId);
  }

  private configurationReportRevision(payload: Buffer): number | null {
    try {
      const report = JSON.parse(payload.toString('utf8')) as { revision?: unknown };
      return Number.isSafeInteger(report.revision) && (report.revision as number) >= 1
        ? (report.revision as number)
        : null;
    } catch {
      return null;
    }
  }

  private async publishRevision(
    controller: WagoController,
    revision: WagoConfigurationRevision,
  ): Promise<WagoConfigurationRevision> {
    if (!controller.mqttServerId) throw new ConflictException(`WAGO controller ${controller.id} has no MQTT server`);
    const incompatibility = compatibilityError({
      protocolVersion: controller.protocolVersion,
      capabilities: JSON.parse(controller.capabilities) as string[],
    });
    if (incompatibility) throw new ConflictException(`Cannot publish configuration: ${incompatibility}`);
    const settings = await this.getSettings();
    await this.context.mqtt.publish(
      controller.mqttServerId,
      configurationDesiredTopic(settings.operationalPrefix ?? 'attraccess/wago', controller.hardwareId),
      JSON.stringify({
        protocolVersion: CONFIGURATION_PROTOCOL_VERSION,
        revision: revision.revision,
        contentHash: revision.contentHash,
        snapshot: JSON.parse(revision.snapshot),
      }),
      { qos: 1, retain: true },
    );
    revision.state = 'published';
    return this.revisions.save(revision);
  }

  private connectivity(controller: WagoController): 'online' | 'stale' | 'untrusted' {
    if (controller.trustState === 'untrusted') return 'untrusted';
    const heartbeatAt = this.diagnostics.read(controller.id).heartbeatAt ?? controller.lastHeartbeatAt;
    return freshness(heartbeatAt, Date.now(), STALE_AFTER_MS) === 'fresh' ? 'online' : 'stale';
  }
  private async appliedRevision(controllerId: number): Promise<WagoConfigurationRevision | null> {
    const [revision] = await this.revisions.find({
      where: { controllerId, state: 'applied' },
      order: { revision: 'DESC' },
      take: 1,
    });
    return revision ?? null;
  }
  private matchesVerifier(controller: WagoController, verifier: string): boolean {
    const value = verifier.trim();
    return (
      (Boolean(value) && Boolean(controller.fingerprint) && safeEqual(hash(value), hash(controller.fingerprint))) ||
      safeEqual(hash(value), controller.pairingCodeHash)
    );
  }
  private async validEnrollment(secret: string, serverId: number, hardwareId: string): Promise<WagoEnrollment | null> {
    const enrollment = await this.enrollments.findOneBy({
      secretHash: hash(secret),
      mqttServerId: serverId,
      hardwareId,
    });
    return enrollment && this.isActiveEnrollment(enrollment) ? enrollment : null;
  }
  private async activeEnrollment(id: number | null): Promise<WagoEnrollment | null> {
    if (!id) return null;
    const enrollment = await this.enrollments.findOneBy({ id });
    return enrollment && this.isActiveEnrollment(enrollment) ? enrollment : null;
  }
  private activeEnrollments(): Promise<WagoEnrollment[]> {
    return this.enrollments
      .createQueryBuilder('enrollment')
      .where('enrollment.consumedAt IS NULL')
      .andWhere('enrollment.revokedAt IS NULL')
      .andWhere('enrollment.expiresAt > :now', { now: new Date().toISOString() })
      .getMany();
  }
  private isActiveEnrollment(enrollment: WagoEnrollment): boolean {
    return !enrollment.consumedAt && !enrollment.revokedAt && Date.parse(enrollment.expiresAt) > Date.now();
  }
  private scheduleEnrollmentExpiry(
    enrollment: WagoEnrollment,
    delay = Date.parse(enrollment.expiresAt) - Date.now(),
  ): void {
    if (enrollment.consumedAt) return;
    const existing = this.enrollmentExpiryTimers.get(enrollment.id);
    if (existing) clearTimeout(existing);
    this.enrollmentExpiryTimers.set(
      enrollment.id,
      setTimeout(
        () => {
          this.enrollmentExpiryTimers.delete(enrollment.id);
          if (this.destroyed) return;
          void this.revokeEnrollment(enrollment)
            .then(() => this.subscribeConfiguredServers())
            .catch((error) => {
              this.context.logger.warn(`Could not revoke expired WAGO enrollment ${enrollment.id}: ${String(error)}`);
              if (!enrollment.consumedAt) this.scheduleEnrollmentExpiry(enrollment, ENROLLMENT_RETRY_MS);
              this.scheduleSubscriptionRetry();
            });
        },
        Math.max(0, delay),
      ),
    );
  }
  private async revokeEnrollment(enrollment: WagoEnrollment): Promise<void> {
    if (!enrollment.revokedAt) {
      const manual = await this.context.getMqttCredentialProvisioning().revoke({
        mqttServerId: enrollment.mqttServerId,
        identity: enrollment.identity,
        username: enrollment.identity,
        vhost: '/',
      });
      if (manual)
        throw new ConflictException(`Manual credential revocation is required: ${manual.instructions.join(' ')}`);
      enrollment.revokedAt = new Date().toISOString();
      await this.enrollments.save(enrollment);
    }
    enrollment.consumedAt = new Date().toISOString();
    await this.enrollments.save(enrollment);
    const timer = this.enrollmentExpiryTimers.get(enrollment.id);
    if (timer) clearTimeout(timer);
    this.enrollmentExpiryTimers.delete(enrollment.id);
    this.clearClaimAcknowledgement(enrollment.id);
  }
  private clearClaimAcknowledgement(enrollmentId: number): void {
    this.claimAcknowledgementSubscriptions.get(enrollmentId)?.unsubscribe();
    this.claimAcknowledgementSubscriptions.delete(enrollmentId);
  }
  private async withClaimLock<T>(id: number, operation: () => Promise<T>): Promise<T> {
    const previous = this.claimLocks.get(id) ?? Promise.resolve();
    let release!: () => void;
    const lock = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.claimLocks.set(id, lock);
    await previous;
    try {
      return await operation();
    } finally {
      release();
      if (this.claimLocks.get(id) === lock) this.claimLocks.delete(id);
    }
  }
  private async withClaimConfigurationLock<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.claimConfigurationLock;
    let release!: () => void;
    const lock = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.claimConfigurationLock = lock;
    await previous;
    try {
      return await operation();
    } finally {
      release();
      if (this.claimConfigurationLock === lock) this.claimConfigurationLock = Promise.resolve();
    }
  }
  private async claimedController(id: number): Promise<WagoController> {
    const controller = await this.controllers.findOneBy({ id });
    if (!controller || controller.trustState !== 'claimed')
      throw new NotFoundException(`claimed WAGO controller ${id} not found`);
    if (!controller.mqttServerId) throw new ConflictException(`WAGO controller ${id} has no MQTT server`);
    return controller;
  }
  private async withConfigurationLock<T>(id: number, operation: () => Promise<T>): Promise<T> {
    const previous = this.configurationLocks.get(id) ?? Promise.resolve();
    let release!: () => void;
    const lock = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.configurationLocks.set(id, lock);
    await previous;
    try {
      return await operation();
    } finally {
      release();
      if (this.configurationLocks.get(id) === lock) this.configurationLocks.delete(id);
    }
  }
  private scheduleSubscriptionRetry(): void {
    if (this.destroyed || this.subscriptionRetryTimer) return;
    this.subscriptionRetryTimer = setTimeout(() => {
      this.subscriptionRetryTimer = null;
      if (this.destroyed) return;
      void this.subscribeConfiguredServers().catch((error) => {
        this.context.logger.warn(`Could not refresh WAGO MQTT subscriptions: ${String(error)}`);
        this.scheduleSubscriptionRetry();
      });
    }, ENROLLMENT_RETRY_MS);
  }
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
function safeEqual(left: string, right: string): boolean {
  return left.length === right.length && timingSafeEqual(Buffer.from(left), Buffer.from(right));
}
function isValidHardwareId(hardwareId: string): boolean {
  return Boolean(hardwareId) && !/[/+#]/.test(hardwareId);
}
function isClaimAcknowledgement(payload: Buffer, token: string): boolean {
  try {
    const value = JSON.parse(payload.toString('utf8')) as { acknowledgementToken?: unknown };
    return typeof value.acknowledgementToken === 'string' && safeEqual(value.acknowledgementToken, token);
  } catch {
    return false;
  }
}

function applySelectedChanges(
  snapshot: WagoConfigurationSnapshot,
  diff: ReturnType<typeof configurationDiff>,
  selectedPaths: string[],
): WagoConfigurationSnapshot {
  let merged = JSON.parse(JSON.stringify(snapshot)) as WagoConfigurationSnapshot;
  const changes = new Map(diff.map((change) => [change.path, change]));
  for (const path of selectedPaths) {
    const change = changes.get(path);
    if (!change) continue;
    const segments = [...path.matchAll(/\.([^.[\]]+)|\[(\d+)\]/g)].map((match) => match[1] ?? Number(match[2]));
    if (!segments.length || segments.some((segment) => typeof segment === 'string' && unsafePathSegment(segment)))
      continue;
    merged = replacePath(merged, segments, change.current) as WagoConfigurationSnapshot;
  }
  return merged;
}

function replacePath(value: unknown, [segment, ...remaining]: (string | number)[], replacement: unknown): unknown {
  if (segment === undefined) return replacement;
  if (typeof segment === 'number') {
    const next = Array.isArray(value) ? [...value] : [];
    if (remaining.length) next[segment] = replacePath(next[segment], remaining, replacement);
    else if (replacement === undefined) delete next[segment];
    else next[segment] = replacement;
    return next;
  }

  const entries = Object.entries(value ?? {}).filter(([key]) => key !== segment);
  if (remaining.length)
    entries.push([
      segment,
      replacePath((value as Record<string, unknown> | undefined)?.[segment], remaining, replacement),
    ]);
  else if (replacement !== undefined) entries.push([segment, replacement]);
  return Object.fromEntries(entries);
}

function unsafePathSegment(segment: string): boolean {
  return segment === '__proto__' || segment === 'constructor' || segment === 'prototype';
}

function parsePresetProvenance(value: string | null): unknown[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
