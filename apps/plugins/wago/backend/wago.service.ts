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
  DISCOVERY_ROOT,
  compatibilityError,
  discoveryTopic,
  heartbeatTopic,
  parseAnnouncement,
  type WagoAnnouncement,
} from './protocol';
import { WagoController } from './wago-controller.entity';
import { WagoSettings } from './wago-settings.entity';
import { WagoEnrollment } from './wago-enrollment.entity';

const PLUGIN_CONTEXT = Symbol.for('attraccess.plugin.context');
const STALE_AFTER_MS = 90_000;
const ENROLLMENT_RETRY_MS = 60_000;

type WagoControllerSummary = Omit<WagoController, 'fingerprint' | 'pairingCodeHash'> & {
  connectivity: 'online' | 'stale' | 'untrusted';
};

@Injectable()
export class WagoService implements OnModuleInit, OnModuleDestroy {
  private readonly controllers: Repository<WagoController>;
  private readonly settings: Repository<WagoSettings>;
  private readonly enrollments: Repository<WagoEnrollment>;
  private readonly subscriptions: PluginMqttSubscription[] = [];
  private readonly enrollmentExpiryTimers = new Map<number, ReturnType<typeof setTimeout>>();
  private readonly claimLocks = new Map<number, Promise<void>>();
  private subscriptionRebuild = Promise.resolve();
  private subscriptionRetryTimer: ReturnType<typeof setTimeout> | null = null;
  private activeSubscriptionGeneration = 0;
  private destroyed = false;

  constructor(@Inject(PLUGIN_CONTEXT) private readonly context: PluginContext) {
    this.controllers = context.getRepository(WagoController);
    this.settings = context.getRepository(WagoSettings);
    this.enrollments = context.getRepository(WagoEnrollment);
  }

  async onModuleInit(): Promise<void> {
    const enrollments = await this.enrollments.find();
    for (const enrollment of enrollments) this.scheduleEnrollmentExpiry(enrollment);
    await this.subscribeConfiguredServers();
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
    return this.settings.findOneBy({ id: 1 }) ?? this.settings.save({ id: 1, defaultMqttServerId: null });
  }

  async setDefaultMqttServer(serverId: number | null): Promise<WagoSettings> {
    if (serverId !== null && !(await this.context.getMqttServerConfig(serverId)))
      throw new NotFoundException(`MQTT server ${serverId} not found`);
    const settings = await this.getSettings();
    settings.defaultMqttServerId = serverId;
    await this.settings.save(settings);
    await this.subscribeConfiguredServers();
    return settings;
  }

  async createEnrollment(
    hardwareId: string,
    mqttServerId?: number,
  ): Promise<{
    broker: { host: string; port: number; useTls: boolean };
    username: string;
    password?: string;
    claimSecret: string;
    expiresAt: string;
    manualInstructions?: readonly string[];
  }> {
    const normalizedHardwareId = hardwareId.trim();
    if (!normalizedHardwareId || normalizedHardwareId.includes('/'))
      throw new ConflictException('a valid hardware ID is required');
    const selectedServerId = mqttServerId ?? (await this.getSettings()).defaultMqttServerId;
    if (!selectedServerId) throw new ConflictException('select an MQTT server before creating an enrollment package');
    const server = await this.context.getMqttServerConfig(selectedServerId);
    if (!server) throw new NotFoundException(`MQTT server ${selectedServerId} not found`);
    const claimSecret = randomBytes(24).toString('base64url');
    const identity = `wago-enrollment-${randomBytes(8).toString('hex')}`;
    const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
    const credential = await this.context.getMqttCredentialProvisioning().provision({
      mqttServerId: selectedServerId,
      identity,
      username: identity,
      vhost: '/',
      topicPolicy: {
        publish: [discoveryTopic(normalizedHardwareId)],
        subscribe: [`${discoveryTopic(normalizedHardwareId)}/claim`],
      },
    });
    const enrollment = await this.enrollments.save(
      this.enrollments.create({
        mqttServerId: selectedServerId,
        hardwareId: normalizedHardwareId,
        secretHash: hash(claimSecret),
        identity,
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
      manualInstructions: 'instructions' in credential ? credential.instructions : undefined,
    };
  }

  async claim(id: number, name: string, verifier: string, mqttServerId?: number): Promise<WagoController> {
    return this.withClaimLock(id, () => this.claimController(id, name, verifier, mqttServerId));
  }

  private async claimController(id: number, name: string, verifier: string, mqttServerId?: number): Promise<WagoController> {
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
      throw new ConflictException('the controller enrollment package has expired or was already consumed; create a new one');

    const identity = `wago-controller-${controller.hardwareId}`;
    const credential = await this.context.getMqttCredentialProvisioning().provision({
      mqttServerId: selectedServerId,
      identity,
      username: identity,
      vhost: '/',
      topicPolicy: {
        publish: [`attraccess/wago/controllers/${controller.hardwareId}/#`],
        subscribe: [`attraccess/wago/controllers/${controller.hardwareId}/desired/#`],
      },
    });
    if (!('password' in credential)) {
      throw new ConflictException(`Manual credential provisioning is required: ${credential.instructions.join(' ')}`);
    }
    try {
      // Revoke discovery access before sending the permanent password to its one-time topic.
      await this.revokeEnrollment(enrollment);
      await this.context.mqtt.publish(
        selectedServerId,
        `${discoveryTopic(controller.hardwareId)}/claim`,
        JSON.stringify({ username: credential.username, password: credential.password }),
        { qos: 1 },
      );
      await this.context.mqtt.publish(selectedServerId, discoveryTopic(controller.hardwareId), '', {
        qos: 1,
        retain: true,
      });
      controller.trustState = 'claimed';
      controller.name = name.trim();
      controller.mqttServerId = selectedServerId;
      controller.updatedAt = new Date().toISOString();
      await this.controllers.save(controller);
      return controller;
    } catch (error) {
      await this.context
        .getMqttCredentialProvisioning()
        .revoke({ mqttServerId: selectedServerId, identity, username: identity, vhost: '/' })
        .catch(() => undefined);
      throw error;
    } finally {
      await this.subscribeConfiguredServers().catch((error) => {
        this.context.logger.warn(`Could not refresh WAGO MQTT subscriptions after claim: ${String(error)}`);
        this.scheduleSubscriptionRetry();
      });
    }
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
          await this.context.mqtt.subscribe(serverId, `${DISCOVERY_ROOT}/+`, async (message) => {
            if (!this.isActiveSubscriptionGeneration(generation)) return;
            await this.onDiscovery(serverId, message.topic, message.payload);
          }),
        );
        for (const controller of controllers.filter(
          (item) => item.trustState === 'claimed' && (item.mqttServerId ?? settings.defaultMqttServerId) === serverId,
        )) {
          replacements.push(
            await this.context.mqtt.subscribe(serverId, heartbeatTopic(controller.hardwareId), async (message) => {
              if (!this.isActiveSubscriptionGeneration(generation)) return;
              await this.onHeartbeat(controller.hardwareId, message.payload);
            }),
          );
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

  private isActiveSubscriptionGeneration(generation: number): boolean {
    return !this.destroyed && generation === this.activeSubscriptionGeneration;
  }

  private async onDiscovery(serverId: number, topic: string, payload: Buffer): Promise<void> {
    const hardwareId = topic.slice(`${DISCOVERY_ROOT}/`.length);
    if (!hardwareId || hardwareId.includes('/')) return;
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
      .andWhere('enrollment.expiresAt > :now', { now: new Date().toISOString() })
      .getMany();
  }
  private isActiveEnrollment(enrollment: WagoEnrollment): boolean {
    return !enrollment.consumedAt && Date.parse(enrollment.expiresAt) > Date.now();
  }
  private scheduleEnrollmentExpiry(enrollment: WagoEnrollment, delay = Date.parse(enrollment.expiresAt) - Date.now()): void {
    if (enrollment.consumedAt) return;
    const existing = this.enrollmentExpiryTimers.get(enrollment.id);
    if (existing) clearTimeout(existing);
    this.enrollmentExpiryTimers.set(
      enrollment.id,
      setTimeout(() => {
        this.enrollmentExpiryTimers.delete(enrollment.id);
        if (this.destroyed) return;
        void this.revokeEnrollment(enrollment)
          .then(() => this.subscribeConfiguredServers())
          .catch((error) => {
            this.context.logger.warn(`Could not revoke expired WAGO enrollment ${enrollment.id}: ${String(error)}`);
            if (!enrollment.consumedAt) this.scheduleEnrollmentExpiry(enrollment, ENROLLMENT_RETRY_MS);
            this.scheduleSubscriptionRetry();
          });
      }, Math.max(0, delay)),
    );
  }
  private async revokeEnrollment(enrollment: WagoEnrollment): Promise<void> {
    const manual = await this.context.getMqttCredentialProvisioning().revoke({
      mqttServerId: enrollment.mqttServerId,
      identity: enrollment.identity,
      username: enrollment.identity,
      vhost: '/',
    });
    if (manual)
      throw new ConflictException(`Manual credential revocation is required: ${manual.instructions.join(' ')}`);
    const consumedAt = enrollment.consumedAt;
    enrollment.consumedAt = new Date().toISOString();
    try {
      await this.enrollments.save(enrollment);
    } catch (error) {
      enrollment.consumedAt = consumedAt;
      throw error;
    }
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
