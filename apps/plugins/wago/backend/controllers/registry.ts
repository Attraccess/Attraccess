import { WagoSettings } from './settings.entity';

import { ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';

import {
  normalizeOperationalPrefix,
  CONFIGURATION_PROTOCOL_VERSION,
  configurationDesiredTopic,
} from '../protocol/index';

import { WagoService } from './service';

import { WagoController } from './entity';

import { WagoControllerSummary } from './model';

import { WagoCommandError } from '../commands/handler';

import { WagoAudit, type WagoManualCommandAuditResult } from '../audit/index';

import { randomUUID } from 'node:crypto';

import { type PluginAuditPrincipal, type PluginMqttSubscription } from '@attraccess/plugins-backend-sdk';

import { WagoEnrollment } from './enrollment.entity';

import { WagoConfigurationDraft } from '../configuration/draft.entity';

import { WagoConfigurationRevision } from '../configuration/revision.entity';

import { MqttSubscriptionError } from './model';

import { WagoServiceState } from './state';

export abstract class WagoRegistry extends WagoServiceState {
  async setDefaultMqttServer(serverId: number | null): Promise<WagoSettings> {
    return this.setSettings(serverId);
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

  async setRuntimePolicy(
    controllerId: number,
    desired: string,
    observed: string,
    runtimePolicyToken?: string,
  ): Promise<void> {
    const previous = this.runtimePolicies.get(controllerId);
    if (
      !this.runtimeUpdateBlocks.has(controllerId) &&
      previous?.desired === desired &&
      previous.observed === observed &&
      previous.runtimePolicyToken === runtimePolicyToken
    )
      return;
    this.runtimeUpdateBlocks.add(controllerId);
    const controller = await this.claimedController(controllerId);
    if (!controller.mqttServerId) return;
    const settings = await this.getSettings();
    const topic = configurationDesiredTopic(settings.operationalPrefix, controller.hardwareId);
    await this.context.mqtt.publish(
      controller.mqttServerId,
      topic,
      JSON.stringify({ runtimeImageId: desired, runtimePolicyToken }),
      { qos: 1, retain: false },
    );
    // Replay configuration skipped by the boot-time runtime gate, without creating a revision.
    const [revision] = await this.revisions.find({ where: { controllerId }, order: { revision: 'DESC' }, take: 1 });
    if (revision && (revision.state === 'published' || revision.state === 'applied'))
      await this.context.mqtt.publish(
        controller.mqttServerId,
        topic,
        JSON.stringify({
          protocolVersion: CONFIGURATION_PROTOCOL_VERSION,
          runtimeImageId: desired,
          runtimePolicyToken,
          revision: revision.revision,
          contentHash: revision.contentHash,
          snapshot: JSON.parse(revision.snapshot),
        }),
        { qos: 1, retain: true },
      );
    this.runtimePolicies.set(controllerId, { desired, observed, runtimePolicyToken });
    this.runtimeUpdateBlocks.delete(controllerId);
  }

  blockRuntime(controllerId: number): void {
    this.runtimeUpdateBlocks.add(controllerId);
  }

  isRuntimeUpdateRequired(controllerId: number): boolean {
    const policy = this.runtimePolicies.get(controllerId);
    return (
      this.runtimeUpdateBlocks.has(controllerId) ||
      (!!this.runtimeStatusHandler && (!policy || policy.desired !== policy.observed))
    );
  }

  registerRuntimeStatusHandler(handler: NonNullable<WagoService['runtimeStatusHandler']>): void {
    this.runtimeStatusHandler = handler;
  }

  registerCommissioningDiscoveryHandler(handler: (controller: WagoController) => Promise<void>): void {
    this.commissioningDiscoveryHandler = handler;
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

  commandFailureKind(error: unknown) {
    return error instanceof WagoCommandError ? error.kind : 'node-failure';
  }

  commandFailureBehavior(config: Record<string, unknown>) {
    return ['fail-flow', 'failure-output', 'log-and-continue'].includes(config.failureBehavior as string)
      ? (config.failureBehavior as 'fail-flow' | 'failure-output' | 'log-and-continue')
      : 'fail-flow';
  }

  async manualCommand(
    controllerId: number,
    input: Record<string, unknown>,
    principal: PluginAuditPrincipal,
  ): Promise<WagoManualCommandAuditResult> {
    const keys = ['channelId', 'action', 'value', 'expectedConfigurationRevision', 'acknowledgementTimeoutSeconds'];
    if (
      !input ||
      typeof input !== 'object' ||
      Array.isArray(input) ||
      Object.keys(input).some((key) => !keys.includes(key))
    )
      throw new BadRequestException('Invalid manual command');
    if (typeof input.channelId !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(input.channelId))
      throw new BadRequestException('Invalid Logical Channel');
    const config = { ...input, controllerId, completionBehavior: 'acknowledged' };
    const errors = await this.commands.validate(config, new Map(), true);
    if (errors.length) throw new BadRequestException('Manual command does not match the applied configuration');
    const commandId = randomUUID();
    const details = { commandId, channelId: input.channelId, operation: input.action as 'set' | 'pulse' | 'release' };
    const lifecycle = new WagoAudit(this.context).begin(principal, controllerId, 'manual_command', details);
    await lifecycle.attempt();
    let result: WagoManualCommandAuditResult['result'];
    try {
      await this.commands.execute(config, commandId, 'manual');
      result = 'acknowledged';
    } catch (error) {
      result =
        error instanceof WagoCommandError
          ? error.kind === 'controller-rejection'
            ? 'rejected'
            : error.kind === 'acknowledgement-timeout'
              ? 'timeout'
              : 'transport_failure'
          : 'transport_failure';
    }
    await lifecycle.finish(result === 'acknowledged' ? 'succeeded' : 'failed', { result });
    return { ...details, result };
  }

  async executeCommand(config: Record<string, unknown>): Promise<void> {
    return this.commands.execute(config);
  }

  async validateCommandConfig(config: Record<string, unknown>, validationContext = new Map<string, unknown>()) {
    return this.commands.validate(config, validationContext);
  }

  async commandSchema(
    config: Record<string, unknown>,
    resourceId: number,
    previewOnly = false,
  ): Promise<Record<string, unknown>> {
    return this.commands.schema(config, resourceId, previewOnly);
  }

  onModuleDestroy(): void {
    this.destroyed = true;
    this.networkSubscriptions.forEach((subscriptions) =>
      subscriptions.forEach((subscription) => subscription.unsubscribe()),
    );
    this.networkSubscriptions.clear();
    this.unsubscribe();
    this.claimAcknowledgementSubscriptions.forEach((subscription) => subscription.unsubscribe());
    this.claimAcknowledgementSubscriptions.clear();
    this.enrollmentExpiryTimers.forEach((timer) => clearTimeout(timer));
    this.enrollmentExpiryTimers.clear();
    if (this.subscriptionRetryTimer) clearTimeout(this.subscriptionRetryTimer);
    this.commands.destroy();
  }

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

  /** Establish the migrated controller's subscriptions without rebuilding or
   * contacting any previous broker. Retained state is replayed only after the
   * complete new set is installed; old captured broker maps become inert.
   */
  async refreshNetworkConnection(controllerId: number): Promise<void> {
    const controller = await this.claimedController(controllerId),
      settings = await this.getSettings();
    const serverId = controller.mqttServerId;
    if (!serverId) throw new ConflictException('Controller MQTT server is unavailable');
    const subscriptions: PluginMqttSubscription[] = [];
    let retained: Buffer | undefined;
    const active = () => !this.destroyed && this.networkSubscriptions.get(controllerId) === subscriptions;
    try {
      const root = `${settings.operationalPrefix}/v1/controllers/${controller.hardwareId}`;
      for (const suffix of [
        'state',
        'measurements',
        'faults',
        'configuration/reported',
        'acknowledgements',
        'heartbeat',
      ]) {
        subscriptions.push(
          await this.subscribeMqtt(serverId, `${root}/${suffix}`, async (message) => {
            if (message.serverId !== controller.mqttServerId || message.topic !== `${root}/${suffix}`) return;
            if (!active()) {
              if (!this.destroyed && suffix === 'state' && message.payload.length <= 65_536)
                retained = Buffer.from(message.payload);
              return;
            }
            if (suffix === 'heartbeat') await this.onHeartbeat(controller.hardwareId, message.payload);
            else {
              this.diagnostics.ingest(controllerId, suffix, message.payload);
              if (suffix === 'configuration/reported') this.enqueueConfigurationReport(controllerId, message.payload);
              if (suffix === 'acknowledgements') this.onCommandAcknowledgement(controllerId, message.payload);
            }
          }),
        );
      }
      if (this.destroyed) throw new Error('Controller subscriptions stopped');
      this.networkSubscriptions.get(controllerId)?.forEach((subscription) => subscription.unsubscribe());
      this.networkSubscriptions.set(controllerId, subscriptions);
      this.networkSubscriptionRevision++;
      if (retained) this.diagnostics.ingest(controllerId, 'state', retained);
    } catch (error) {
      subscriptions.forEach((subscription) => subscription.unsubscribe());
      throw error;
    }
  }
}
