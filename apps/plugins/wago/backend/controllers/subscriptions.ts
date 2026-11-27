import {
  compatibilityError,
  parseObject,
  heartbeatFromObject,
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

import { WagoController } from './entity';

import {
  PluginStorageUniqueViolation,
  type PluginContext,
  type PluginMqttSubscription,
} from '@attraccess/plugins-backend-sdk';

import { MqttSubscriptionError } from './model';

import { WagoControllerEnrollment } from './enrollment';
import type { WagoEnrollment } from './enrollment.entity';

export abstract class WagoSubscriptions extends WagoControllerEnrollment {
  protected async onHeartbeat(hardwareId: string, payload: Buffer): Promise<void> {
    const parsed = this.parseHeartbeatPayload(hardwareId, payload);
    if (!parsed) return;
    const { heartbeat, rawHeartbeat } = parsed;
    const canonical = canonicalEnvelope(rawHeartbeat, 'heartbeat');
    const controller = await this.controllers.findOne({ where: { hardwareId } });
    if (
      !controller ||
      controller.trustState !== 'claimed' ||
      (!canonical && heartbeat.sequence !== undefined && heartbeat.sequence < Number(controller.lastSequence))
    )
      return;
    const now = new Date().toISOString();
    const canTrackDiagnostics = this.diagnostics.canTrack(controller.id);
    const admitted = this.diagnostics.ingest(controller.id, 'heartbeat', payload);
    // Rejected legacy packets must not refresh checkpoints or overwrite runtime metadata either.
    if (canTrackDiagnostics && !admitted) return;
    const heartbeatAt = admitted
      ? this.diagnostics.heartbeatAt(controller.id)
      : typeof rawHeartbeat.timestamp === 'string'
        ? rawHeartbeat.timestamp
        : undefined;
    if (canonical && !acceptedCanonicalHeartbeat(rawHeartbeat, heartbeatAt, controller.lastHeartbeatAt)) return;
    // Connectivity is process-local between bounded persistence checkpoints.
    if (canonical && (admitted || !canTrackDiagnostics))
      this.reportRuntimeStatus(controller.id, heartbeat, rawHeartbeat);
    // Avoid a database write for every permanent heartbeat.
    if (
      controller.lastHeartbeatAt &&
      freshness(controller.lastSeenAt, Date.now(), 30_000) === 'fresh' &&
      !heartbeatMetadataChanged(controller, heartbeat)
    )
      return;
    await this.checkpointHeartbeat(controller, heartbeat, canonical, heartbeatAt, now);
  }

  /** Parse a heartbeat for the expected controller; malformed packets are ignored. */
  protected parseHeartbeatPayload(
    hardwareId: string,
    payload: Buffer,
  ): { heartbeat: WagoHeartbeat; rawHeartbeat: Record<string, unknown> } | undefined {
    let heartbeat: WagoHeartbeat, rawHeartbeat: Record<string, unknown>;
    try {
      // Decode once; the same bounded object feeds both the heartbeat and the raw envelope fields.
      rawHeartbeat = parseObject(payload, 'announcement');
      heartbeat = heartbeatFromObject(rawHeartbeat);
    } catch (error) {
      this.context.logger.warn(
        `Ignoring invalid WAGO heartbeat: ${error instanceof Error ? error.message : String(error)}`,
      );
      return undefined;
    }
    if (heartbeat.hardwareId !== hardwareId) return undefined;
    return { heartbeat, rawHeartbeat };
  }

  protected reportRuntimeStatus(
    controllerId: number,
    heartbeat: WagoHeartbeat,
    rawHeartbeat: Record<string, unknown>,
  ): void {
    if (typeof rawHeartbeat.streamId !== 'string' || typeof rawHeartbeat.timestamp !== 'string') return;
    this.runtimeStatusHandler?.(controllerId, {
      imageId: heartbeat.runtimeImageId ?? '',
      runtimeVersion: heartbeat.runtimeVersion,
      streamId: rawHeartbeat.streamId,
      timestamp: Date.parse(rawHeartbeat.timestamp),
      receivedAt: Date.now(),
      sequence: rawHeartbeat.sequence as number,
      ...(heartbeat.runtimePolicyToken ? { runtimePolicyToken: heartbeat.runtimePolicyToken } : {}),
    });
  }

  /** Persist a heartbeat checkpoint. Canonical heartbeats record their source
   * time; legacy heartbeats advance the sequence and use receipt time.
   */
  protected async checkpointHeartbeat(
    controller: WagoController,
    heartbeat: WagoHeartbeat,
    canonical: boolean,
    heartbeatAt: string | undefined,
    now: string,
  ): Promise<void> {
    controller.protocolVersion = heartbeat.protocolVersion;
    controller.runtimeVersion = heartbeat.runtimeVersion;
    controller.capabilities = JSON.stringify(heartbeat.capabilities);
    if (!canonical) {
      const legacySequence = this.diagnostics.read(controller.id).legacyHeartbeatSequence;
      if (legacySequence !== undefined && legacySequence !== null) controller.lastSequence = String(legacySequence);
      controller.lastHeartbeatAt = now;
    } else {
      controller.lastHeartbeatAt = heartbeatAt ?? controller.lastHeartbeatAt;
    }
    controller.lastSeenAt = now;
    controller.compatibilityError = compatibilityError(heartbeat);
    controller.updatedAt = now;
    // A heartbeat may have loaded this entity before a concurrent SSH network
    // change commits. Persist telemetry fields only; never overwrite that
    // operation's broker, credential or enrollment bindings with an old snapshot.
    await this.controllers.update(
      { id: controller.id },
      {
        protocolVersion: controller.protocolVersion,
        runtimeVersion: controller.runtimeVersion,
        capabilities: controller.capabilities,
        lastSequence: controller.lastSequence,
        lastHeartbeatAt: controller.lastHeartbeatAt,
        lastSeenAt: controller.lastSeenAt,
        compatibilityError: controller.compatibilityError,
        updatedAt: controller.updatedAt,
      },
    );
  }

  protected async onDiscovery(serverId: number, topic: string, payload: Buffer): Promise<void> {
    const hardwareId = topic.slice(`${DISCOVERY_ROOT}/`.length);
    if (!isValidHardwareId(hardwareId)) return;
    const announcement = this.readAnnouncement(topic, hardwareId, payload);
    if (!announcement) return;
    const enrollment = await this.announcedEnrollment(announcement, serverId, hardwareId, topic);
    if (!enrollment) return;
    const existing = await this.controllers.findOne({ where: { hardwareId } });
    if (existing?.trustState === 'claimed') return; // Discovery can never modify trusted identity or configuration.
    const stored = await this.storeDiscovered(existing, announcement, enrollment, serverId);
    if (stored === 'raced') return this.onDiscovery(serverId, topic, payload);
    if (stored) await this.offerDiscoveredController(stored);
  }

  /** The valid announcement of a discovery message, or null (with a warning) when it must be ignored. */
  private readAnnouncement(topic: string, hardwareId: string, payload: Buffer): WagoAnnouncement | null {
    let announcement: WagoAnnouncement;
    try {
      announcement = parseAnnouncement(payload);
    } catch (error) {
      this.context.logger.warn(
        `Ignoring invalid WAGO announcement: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
    if (announcement.hardwareId === hardwareId) return announcement;
    this.context.logger.warn(`Ignoring WAGO announcement with mismatched hardware ID on ${topic}`);
    return null;
  }

  private async announcedEnrollment(
    announcement: WagoAnnouncement,
    serverId: number,
    hardwareId: string,
    topic: string,
  ): Promise<WagoEnrollment | null> {
    const enrollment = announcement.enrollmentSecret
      ? await this.validEnrollment(announcement.enrollmentSecret, serverId, hardwareId)
      : null;
    if (!enrollment) {
      this.context.logger.warn(`Ignoring WAGO announcement without a valid enrollment secret on ${topic}`);
    }
    return enrollment;
  }

  /**
   * Records the announcement as an untrusted controller. Returns the stored controller, null when a concurrent claim
   * won the race, or 'raced' when a concurrent announcement inserted the controller first.
   */
  private async storeDiscovered(
    existing: WagoController | null,
    announcement: WagoAnnouncement,
    enrollment: WagoEnrollment,
    serverId: number,
  ): Promise<WagoController | 'raced' | null> {
    const now = new Date().toISOString();
    const discovered = {
      mqttServerId: serverId,
      enrollmentId: enrollment.id,
      pairingCodeHash: hash(announcement.pairingCode),
      fingerprint: announcement.fingerprint ?? null,
      protocolVersion: announcement.protocolVersion,
      runtimeVersion: announcement.runtimeVersion,
      capabilities: JSON.stringify(announcement.capabilities),
      lastSeenAt: now,
      compatibilityError: compatibilityError(announcement),
      updatedAt: now,
    };
    if (existing) {
      const lastSequence = announcement.sequence === undefined ? existing.lastSequence : String(announcement.sequence);
      // Compare-and-set on the untrusted state: a claim that won the race keeps its trusted identity.
      const updated = await this.controllers.update(
        { id: existing.id, trustState: 'untrusted' },
        { ...discovered, lastSequence },
      );
      return updated ? { ...existing, ...discovered, lastSequence } : null;
    }
    try {
      return await this.controllers.insert({
        ...discovered,
        hardwareId: announcement.hardwareId,
        trustState: 'untrusted',
        name: null,
        lastSequence: String(announcement.sequence ?? 0),
        lastHeartbeatAt: null,
        createdAt: now,
      });
    } catch (error) {
      if (error instanceof PluginStorageUniqueViolation) return 'raced';
      throw error;
    }
  }

  private async offerDiscoveredController(candidate: WagoController): Promise<void> {
    if (!this.commissioningDiscoveryHandler) return;
    try {
      await this.commissioningDiscoveryHandler(candidate);
    } catch (error) {
      this.context.logger.warn(
        `Could not automatically claim commissioned WAGO controller ${candidate.hardwareId}: ${String(error)}`,
      );
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

/** A full bounded diagnostic cache must not disable permanent heartbeat checkpoints.
 * Other canonical rejections remain invalid and never use receipt time as liveness.
 */
function acceptedCanonicalHeartbeat(
  rawHeartbeat: Record<string, unknown>,
  heartbeatAt: string | undefined,
  lastHeartbeatAt: string | null | undefined,
): boolean {
  if (!validEnvelope(rawHeartbeat, Date.now()) || !heartbeatAt) return false;
  const persistedHeartbeatAt = sourceTime(lastHeartbeatAt);
  return persistedHeartbeatAt === null || (sourceTime(heartbeatAt) ?? 0) >= persistedHeartbeatAt;
}

function heartbeatMetadataChanged(controller: WagoController, heartbeat: WagoHeartbeat): boolean {
  return (
    controller.protocolVersion !== heartbeat.protocolVersion ||
    controller.runtimeVersion !== heartbeat.runtimeVersion ||
    controller.capabilities !== JSON.stringify(heartbeat.capabilities) ||
    controller.compatibilityError !== compatibilityError(heartbeat)
  );
}
