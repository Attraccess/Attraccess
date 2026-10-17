import {
  compatibilityError,
  parseHeartbeat,
  type WagoHeartbeat,
  DISCOVERY_ROOT,
  parseAnnouncement,
  type WagoAnnouncement,
  acknowledgementHardwareId,
  acknowledgementWildcardTopic,
  configurationReportedHardwareId,
  configurationReportedWildcardTopic,
  heartbeatTopic,
} from '../protocol/index';

import { freshness } from '../diagnostics/store';

import { canonicalEnvelope, sourceTime, validEnvelope } from '../diagnostics/envelope';

import { hash, isValidHardwareId } from './model';

import { type PluginContext, type PluginMqttSubscription } from '@attraccess/plugins-backend-sdk';

import { MqttSubscriptionError } from './model';

import { WagoControllerEnrollment } from './enrollment';

export abstract class WagoSubscriptions extends WagoControllerEnrollment {
  protected async onHeartbeat(hardwareId: string, payload: Buffer): Promise<void> {
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
    if (
      canonical &&
      (admitted || !canTrackDiagnostics) &&
      typeof rawHeartbeat.streamId === 'string' &&
      typeof rawHeartbeat.timestamp === 'string'
    ) {
      this.runtimeStatusHandler?.(controller.id, {
        imageId: heartbeat.runtimeImageId ?? '',
        runtimeVersion: heartbeat.runtimeVersion,
        streamId: rawHeartbeat.streamId,
        timestamp: Date.parse(rawHeartbeat.timestamp),
        receivedAt: Date.now(),
        sequence: rawHeartbeat.sequence as number,
        ...(heartbeat.runtimePolicyToken ? { runtimePolicyToken: heartbeat.runtimePolicyToken } : {}),
      });
    }
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
    // A heartbeat may have loaded this entity before a concurrent SSH network
    // change commits. Persist telemetry fields only; never overwrite that
    // operation's broker, credential or enrollment bindings with an old snapshot.
    await this.controllers.save({
      id: controller.id,
      protocolVersion: controller.protocolVersion,
      runtimeVersion: controller.runtimeVersion,
      capabilities: controller.capabilities,
      lastSequence: controller.lastSequence,
      lastHeartbeatAt: controller.lastHeartbeatAt,
      lastSeenAt: controller.lastSeenAt,
      compatibilityError: controller.compatibilityError,
      updatedAt: controller.updatedAt,
    });
  }

  protected async onDiscovery(serverId: number, topic: string, payload: Buffer): Promise<void> {
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

  protected isActiveSubscriptionGeneration(generation: number): boolean {
    return !this.destroyed && generation === this.activeSubscriptionGeneration;
  }

  protected async subscribeMqtt(
    ...args: Parameters<PluginContext['mqtt']['subscribe']>
  ): Promise<PluginMqttSubscription> {
    try {
      return await this.context.mqtt.subscribe(...args);
    } catch (error) {
      throw new MqttSubscriptionError(error);
    }
  }

  protected unsubscribe(): void {
    this.subscriptions.splice(0).forEach((subscription) => subscription.unsubscribe());
  }

  protected async rebuildSubscriptions(): Promise<void> {
    if (this.destroyed) return;
    const networkRevision = this.networkSubscriptionRevision;
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
              if (controller && !this.networkSubscriptions.has(controller.id)) {
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
            if (controller && !this.networkSubscriptions.has(controller.id)) {
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
                  if (this.isActiveSubscriptionGeneration(generation) && !this.networkSubscriptions.has(controller.id))
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
                if (!this.isActiveSubscriptionGeneration(generation) || this.networkSubscriptions.has(controller.id))
                  return;
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
      if (error instanceof MqttSubscriptionError) {
        // One disconnected broker must not prevent an already enrolled device
        // on another broker from reconnecting after an API restart. Establish
        // controller subscriptions independently while the full generation is
        // retried; an existing independent set stays active until a full swap.
        await Promise.allSettled(
          controllers
            .filter(
              (controller) => controller.trustState === 'claimed' && !this.networkSubscriptions.has(controller.id),
            )
            .map((controller) => this.refreshNetworkConnection(controller.id)),
        );
      }
      throw error;
    }
    if (this.destroyed) {
      replacements.forEach((subscription) => subscription.unsubscribe());
      return;
    }
    // A migration may have installed its direct subscriptions after this
    // rebuild captured the old controller/broker associations. Never let that
    // stale generation discard the successfully migrated connection.
    if (networkRevision !== this.networkSubscriptionRevision) {
      replacements.forEach((subscription) => subscription.unsubscribe());
      this.scheduleSubscriptionRetry();
      return;
    }
    // New handlers are inert until this synchronous generation swap disables the old set.
    this.activeSubscriptionGeneration = generation;
    this.networkSubscriptions.forEach((subscriptions) =>
      subscriptions.forEach((subscription) => subscription.unsubscribe()),
    );
    this.networkSubscriptions.clear();
    retainedStates.forEach((payload, controllerId) => this.diagnostics.ingest(controllerId, 'state', payload));
    this.unsubscribe();
    this.subscriptions.push(...replacements);
  }

  protected async subscribeConfiguredServers(): Promise<void> {
    if (this.destroyed) return;
    const rebuild = this.subscriptionRebuild.then(() => this.rebuildSubscriptions());
    this.subscriptionRebuild = rebuild.catch(() => undefined);
    return rebuild;
  }
}
