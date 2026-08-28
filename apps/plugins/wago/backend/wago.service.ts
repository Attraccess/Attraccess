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

@Injectable()
export class WagoService implements OnModuleInit, OnModuleDestroy {
  private readonly controllers: Repository<WagoController>;
  private readonly settings: Repository<WagoSettings>;
  private readonly enrollments: Repository<WagoEnrollment>;
  private readonly subscriptions: PluginMqttSubscription[] = [];

  constructor(@Inject(PLUGIN_CONTEXT) private readonly context: PluginContext) {
    this.controllers = context.getRepository(WagoController);
    this.settings = context.getRepository(WagoSettings);
    this.enrollments = context.getRepository(WagoEnrollment);
  }

  async onModuleInit(): Promise<void> {
    await this.subscribeConfiguredServers();
  }
  onModuleDestroy(): void {
    this.unsubscribe();
  }

  async list(): Promise<Array<WagoController & { connectivity: 'online' | 'stale' | 'untrusted' }>> {
    const controllers = await this.controllers.find({ order: { hardwareId: 'ASC' } });
    return controllers.map((controller) => ({ ...controller, connectivity: this.connectivity(controller) }));
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
    await this.enrollments.save(
      this.enrollments.create({
        mqttServerId: selectedServerId,
        hardwareId: normalizedHardwareId,
        secretHash: hash(claimSecret),
        identity,
        createdAt: new Date().toISOString(),
        expiresAt,
      }),
    );
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
    // The password only travels on the one-time claim response and is never persisted.
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
    if (controller.enrollmentId) {
      const enrollment = await this.enrollments.findOneBy({ id: controller.enrollmentId });
      if (enrollment) {
        enrollment.consumedAt = new Date().toISOString();
        await this.enrollments.save(enrollment);
        await this.context
          .getMqttCredentialProvisioning()
          .revoke({
            mqttServerId: enrollment.mqttServerId,
            identity: enrollment.identity,
            username: enrollment.identity,
            vhost: '/',
          });
      }
    }
    await this.subscribeConfiguredServers();
    return controller;
  }

  private async subscribeConfiguredServers(): Promise<void> {
    this.unsubscribe();
    const settings = await this.getSettings();
    const controllers = await this.controllers.find();
    const serverIds = new Set<number>();
    if (settings.defaultMqttServerId) serverIds.add(settings.defaultMqttServerId);
    controllers
      .filter((controller) => controller.trustState === 'claimed')
      .forEach((controller) => {
        const serverId = controller.mqttServerId ?? settings.defaultMqttServerId;
        if (serverId) serverIds.add(serverId);
      });
    for (const serverId of serverIds) {
      this.subscriptions.push(
        await this.context.mqtt.subscribe(serverId, `${DISCOVERY_ROOT}/+`, (message) =>
          this.onDiscovery(serverId, message.topic, message.payload),
        ),
      );
      for (const controller of controllers.filter(
        (item) => item.trustState === 'claimed' && (item.mqttServerId ?? settings.defaultMqttServerId) === serverId,
      )) {
        this.subscriptions.push(
          await this.context.mqtt.subscribe(serverId, heartbeatTopic(controller.hardwareId), (message) =>
            this.onHeartbeat(controller.hardwareId, message.payload),
          ),
        );
      }
    }
  }

  private unsubscribe(): void {
    this.subscriptions.splice(0).forEach((subscription) => subscription.unsubscribe());
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
    if (!controller || controller.trustState !== 'claimed' || (heartbeat.sequence ?? 0) < controller.lastSequence)
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
    return value === controller.fingerprint || safeEqual(hash(value), controller.pairingCodeHash);
  }
  private async validEnrollment(secret: string, serverId: number, hardwareId: string): Promise<WagoEnrollment | null> {
    const enrollment = await this.enrollments.findOneBy({
      secretHash: hash(secret),
      mqttServerId: serverId,
      hardwareId,
    });
    return enrollment && !enrollment.consumedAt && Date.parse(enrollment.expiresAt) > Date.now() ? enrollment : null;
  }
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
function safeEqual(left: string, right: string): boolean {
  return left.length === right.length && timingSafeEqual(Buffer.from(left), Buffer.from(right));
}
