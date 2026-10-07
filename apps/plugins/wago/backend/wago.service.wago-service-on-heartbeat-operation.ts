import { compatibilityError, parseHeartbeat, type WagoHeartbeat } from './protocol';
import { freshness } from './diagnostics-store';
import { canonicalEnvelope, sourceTime, validEnvelope } from './diagnostics-envelope';
import { WagoServiceOnDiscoveryOperation } from './wago.wago-service-on-discovery-operation';
export abstract class WagoServiceOnHeartbeatOperation extends WagoServiceOnDiscoveryOperation {
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
}
