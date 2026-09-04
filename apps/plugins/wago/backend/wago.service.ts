import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import type { PluginContext, PluginMqttSubscription, Repository } from '@attraccess/plugins-backend-sdk';
import {
  CONFIGURATION_PROTOCOL_VERSION,
  DISCOVERY_ROOT,
  compatibilityError,
  commandTopic,
  configurationDesiredTopic,
  configurationReportedHardwareId,
  configurationReportedTopic,
  configurationReportedWildcardTopic,
  discoveryTopic,
  heartbeatTopic,
  normalizeOperationalPrefix,
  parseAnnouncement,
  type WagoAnnouncement,
} from './protocol';
import { WagoController } from './wago-controller.entity';
import { WagoSettings } from './wago-settings.entity';
import { WagoEnrollment } from './wago-enrollment.entity';
import {
  canonicalSnapshot,
  applyPreset,
  configurationDiff,
  configurationHash,
  parseConfigurationReport,
  WAGO_PRESETS,
  type ConfigurationValidationError,
  type WagoConfigurationSnapshot,
  type WagoPresetApplication,
  validateSnapshot,
} from './configuration';
import { WagoConfigurationDraft } from './wago-configuration-draft.entity';
import { WagoConfigurationRevision } from './wago-configuration-revision.entity';

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
export class WagoService implements OnModuleInit, OnModuleDestroy {
  private controllers!: Repository<WagoController>;
  private settings!: Repository<WagoSettings>;
  private enrollments!: Repository<WagoEnrollment>;
  private drafts!: Repository<WagoConfigurationDraft>;
  private revisions!: Repository<WagoConfigurationRevision>;
  private readonly subscriptions: PluginMqttSubscription[] = [];
  private readonly enrollmentExpiryTimers = new Map<number, ReturnType<typeof setTimeout>>();
  private readonly claimLocks = new Map<number, Promise<void>>();
  private readonly configurationLocks = new Map<number, Promise<void>>();
  private readonly configurationReportQueues = new Map<number, { pending: Map<number, Buffer>; processing: boolean }>();
  private claimConfigurationLock = Promise.resolve();
  private subscriptionRebuild = Promise.resolve();
  private subscriptionRetryTimer: ReturnType<typeof setTimeout> | null = null;
  private activeSubscriptionGeneration = 0;
  private destroyed = false;

  constructor(@Inject(PLUGIN_CONTEXT) private readonly context: PluginContext) {}

  async onModuleInit(): Promise<void> {
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
    this.enrollmentExpiryTimers.forEach((timer) => clearTimeout(timer));
    this.enrollmentExpiryTimers.clear();
    if (this.subscriptionRetryTimer) clearTimeout(this.subscriptionRetryTimer);
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
      lastHeartbeatAt: controller.lastHeartbeatAt,
      lastSeenAt: controller.lastSeenAt,
      compatibilityError: controller.compatibilityError,
      createdAt: controller.createdAt,
      updatedAt: controller.updatedAt,
      connectivity: this.connectivity(controller),
    }));
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

  async enrollmentCredentialSupport(mqttServerId: number): Promise<{ automatic: boolean }> {
    if (!(await this.context.getMqttServerConfig(mqttServerId)))
      throw new NotFoundException(`MQTT server ${mqttServerId} not found`);
    const providers = await this.context.getMqttCredentialProvisioning().availableProviders(mqttServerId);
    return { automatic: providers.length === 1 };
  }

  async getDraft(controllerId: number): Promise<WagoConfigurationDraft | null> {
    await this.claimedController(controllerId);
    return this.drafts.findOneBy({ controllerId });
  }

  async saveDraft(controllerId: number, snapshot: unknown): Promise<WagoConfigurationDraft> {
    return this.withConfigurationLock(controllerId, () => this.saveDraftWhileLocked(controllerId, snapshot));
  }

  async validateDraft(controllerId: number): Promise<{ valid: boolean; errors: ConfigurationValidationError[] }> {
    const draft = await this.getDraft(controllerId);
    if (!draft) throw new NotFoundException(`WAGO controller ${controllerId} has no configuration draft`);
    const errors = validateSnapshot(JSON.parse(draft.snapshot));
    return { valid: errors.length === 0, errors };
  }

  presets() {
    return WAGO_PRESETS;
  }

  async previewPreset(
    controllerId: number,
    application: WagoPresetApplication,
  ): Promise<{ draftHash: string; diff: ReturnType<typeof configurationDiff> }> {
    const draft = await this.draftForPreset(controllerId);
    const snapshot = JSON.parse(draft.snapshot) as WagoConfigurationSnapshot;
    return {
      draftHash: configurationHash(snapshot),
      diff: configurationDiff(snapshot, applyPreset(snapshot, application)),
    };
  }

  async applyPreset(
    controllerId: number,
    application: WagoPresetApplication,
    selectedPaths: string[],
    previewedDraftHash: string,
  ): Promise<WagoConfigurationDraft> {
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
      draft.snapshot = canonicalSnapshot(applySelectedChanges(snapshot, diff, selectedPaths));
      draft.reviewedHash = null;
      draft.presetProvenance = JSON.stringify([
        ...parsePresetProvenance(draft.presetProvenance).slice(-99),
        { presetId: application.presetId, appliedAt: new Date().toISOString(), selectedPaths },
      ]);
      draft.updatedAt = new Date().toISOString();
      return this.drafts.save(draft);
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
        'publishedAt',
        'reportedAt',
      ],
      skip: pageOffset,
      take: pageLimit,
    });
    return { revisions, offset: pageOffset, limit: pageLimit };
  }

  async reviewDraft(controllerId: number): Promise<{
    draft: WagoConfigurationDraft;
    previous: WagoConfigurationRevision | null;
    changed: boolean;
    diff: ReturnType<typeof configurationDiff>;
  }> {
    return this.withConfigurationLock(controllerId, () => this.reviewDraftWhileLocked(controllerId));
  }

  async publishDraft(controllerId: number): Promise<WagoConfigurationRevision> {
    return this.withConfigurationLock(controllerId, () => this.publishDraftWhileLocked(controllerId));
  }

  async rollback(controllerId: number, revision: number): Promise<WagoConfigurationRevision> {
    return this.withConfigurationLock(controllerId, async () => {
      const source = await this.revisions.findOneBy({ controllerId, revision });
      if (!source) throw new NotFoundException(`WAGO configuration revision ${revision} not found`);
      await this.saveDraftWhileLocked(controllerId, JSON.parse(source.snapshot));
      await this.reviewDraftWhileLocked(controllerId);
      return this.publishDraftWhileLocked(controllerId);
    });
  }

  async previewRevision(
    controllerId: number,
    revision: number,
  ): Promise<{
    revision: WagoConfigurationRevision;
    current: WagoConfigurationRevision | null;
    diff: ReturnType<typeof configurationDiff>;
  }> {
    await this.claimedController(controllerId);
    const selected = await this.revisions.findOneBy({ controllerId, revision });
    if (!selected) throw new NotFoundException(`WAGO configuration revision ${revision} not found`);
    const [current] = await this.revisions.find({ where: { controllerId }, order: { revision: 'DESC' }, take: 1 });
    return {
      revision: selected,
      current: current ?? null,
      diff: configurationDiff(current ? JSON.parse(current.snapshot) : null, JSON.parse(selected.snapshot)),
    };
  }

  private async saveDraftWhileLocked(controllerId: number, snapshot: unknown): Promise<WagoConfigurationDraft> {
    await this.claimedController(controllerId);
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
    draft.reviewedHash = null;
    draft.updatedAt = new Date().toISOString();
    return this.drafts.save(draft);
  }

  private async reviewDraftWhileLocked(controllerId: number): Promise<{
    draft: WagoConfigurationDraft;
    previous: WagoConfigurationRevision | null;
    changed: boolean;
    diff: ReturnType<typeof configurationDiff>;
  }> {
    await this.claimedController(controllerId);
    const draft = await this.drafts.findOneBy({ controllerId });
    if (!draft) throw new NotFoundException(`WAGO controller ${controllerId} has no configuration draft`);
    const previous = await this.latestRevision(controllerId);
    draft.reviewedHash = configurationHash(JSON.parse(draft.snapshot));
    await this.drafts.save(draft);
    const diff = configurationDiff(previous ? JSON.parse(previous.snapshot) : null, JSON.parse(draft.snapshot));
    return { draft, previous, changed: diff.length > 0, diff };
  }

  private async draftForPreset(controllerId: number): Promise<WagoConfigurationDraft> {
    await this.claimedController(controllerId);
    const draft = await this.drafts.findOneBy({ controllerId });
    if (!draft) throw new NotFoundException(`WAGO controller ${controllerId} has no configuration draft`);
    return draft;
  }

  private async publishDraftWhileLocked(controllerId: number): Promise<WagoConfigurationRevision> {
    const controller = await this.claimedController(controllerId);
    const draft = await this.drafts.findOneBy({ controllerId });
    if (!draft) throw new NotFoundException(`WAGO controller ${controllerId} has no configuration draft`);
    const validation = validateSnapshot(JSON.parse(draft.snapshot));
    if (validation.length)
      throw new ConflictException({ message: 'configuration draft is invalid', errors: validation });
    const contentHash = configurationHash(JSON.parse(draft.snapshot));
    if (draft.reviewedHash !== contentHash)
      throw new ConflictException('review the current configuration draft before publishing it');
    const previous = await this.latestRevision(controllerId);
    if (previous?.state === 'pending' && previous.contentHash === contentHash)
      return this.publishRevision(controller, previous);
    const revision = this.revisions.create({
      controllerId,
      revision: (previous?.revision ?? 0) + 1,
      snapshot: draft.snapshot,
      contentHash,
      state: 'pending',
      rejectionErrors: null,
      publishedAt: new Date().toISOString(),
      reportedAt: null,
    });
    return this.publishRevision(controller, await this.revisions.save(revision));
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
        publish: [discoveryTopic(normalizedHardwareId)],
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

  async claim(id: number, name: string, verifier: string, mqttServerId?: number): Promise<WagoController> {
    return this.withClaimLock(id, async () => {
      const prepared = await this.withClaimConfigurationLock(() => this.prepareClaim(id, name, verifier, mqttServerId));
      try {
        await this.context.mqtt.publish(
          prepared.mqttServerId,
          `${discoveryTopic(prepared.controller.hardwareId)}/claim`,
          JSON.stringify({
            username: prepared.credential.username,
            password: prepared.credential.password,
            configuration: prepared.configuration,
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
      // Revoke discovery access before sending the permanent password to its one-time topic.
      await this.revokeEnrollment(enrollment);
      // Persist the claimed state before delivery so post-delivery failures cannot revoke its credentials.
      controller.trustState = 'claimed';
      controller.name = name.trim();
      controller.mqttServerId = selectedServerId;
      controller.updatedAt = new Date().toISOString();
      await this.controllers.save(controller);
      return {
        controller,
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
              if (controller) this.enqueueConfigurationReport(controller.id, message.payload);
            },
          ),
        );
        if (this.destroyed) {
          replacements.forEach((subscription) => subscription.unsubscribe());
          return;
        }
        for (const controller of claimedControllers) {
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
  }

  private async onHeartbeat(hardwareId: string, payload: Buffer): Promise<void> {
    let heartbeat: WagoAnnouncement;
    try {
      heartbeat = parseAnnouncement(payload);
    } catch (error) {
      this.context.logger.warn(
        `Ignoring invalid WAGO heartbeat: ${error instanceof Error ? error.message : String(error)}`,
      );
      return;
    }
    if (heartbeat.hardwareId !== hardwareId) return;
    const controller = await this.controllers.findOneBy({ hardwareId });
    if (
      !controller ||
      controller.trustState !== 'claimed' ||
      (heartbeat.sequence !== undefined && heartbeat.sequence < controller.lastSequence)
    )
      return;
    const now = new Date().toISOString();
    controller.protocolVersion = heartbeat.protocolVersion;
    controller.runtimeVersion = heartbeat.runtimeVersion;
    controller.capabilities = JSON.stringify(heartbeat.capabilities);
    controller.lastSequence = heartbeat.sequence ?? controller.lastSequence;
    controller.lastHeartbeatAt = now;
    controller.lastSeenAt = now;
    controller.compatibilityError = compatibilityError(heartbeat);
    controller.updatedAt = now;
    await this.controllers.save(controller);
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
    return controller.lastHeartbeatAt && Date.now() - Date.parse(controller.lastHeartbeatAt) <= STALE_AFTER_MS
      ? 'online'
      : 'stale';
  }
  private matchesVerifier(controller: WagoController, verifier: string): boolean {
    const value = verifier.trim();
    return (
      (Boolean(value) && Boolean(controller.fingerprint) && value === controller.fingerprint) ||
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

function parsePresetProvenance(value: string | null): unknown[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
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
