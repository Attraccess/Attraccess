import { BuildRuntimeArtifact } from './wago-build-runtime';
import { RuntimeUpdateError, runtimeTargetImageId } from './wago-runtime-update';
import { LiveHeartbeat } from './wago-managed-runtime.contracts';
import { WagoManagedRuntimeServiceWakeOperation } from './wago-managed-runtime.wago-managed-runtime-service-wake-operation';

export abstract class WagoManagedRuntimeServiceRefreshRuntimePolicyOperation extends WagoManagedRuntimeServiceWakeOperation {
  protected async refreshRuntimePolicy(id: number): Promise<LiveHeartbeat | undefined> {
    await this.assertNetworkSettled(id);
    let desired: BuildRuntimeArtifact;
    try {
      desired = await this.desired();
    } catch {
      throw new RuntimeUpdateError('runtime_assets');
    }
    const heartbeat = this.heartbeats.get(id);
    if (!heartbeat || this.destroyed) return;
    const access = await this.access.findOne({ where: { controllerId: id }, order: { sessionId: 'DESC' } });
    // Verified enrollment needs a ready runtime before management can be hardened.
    // Confirm its running image during bootstrap; the server still blocks commands
    // until management is complete and the bundled image policy can be enforced.
    const enrolling = access?.state === 'verified' || access?.state === 'recovery_required';
    const controller = await this.controllers.findOneBy({ id, trustState: 'claimed' });
    await this.wago.setRuntimePolicy?.(
      id,
      enrolling
        ? heartbeat.imageId
        : runtimeTargetImageId(desired, {
            imageId: heartbeat.imageId,
            runtimeVersion: heartbeat.runtimeVersion ?? controller?.runtimeVersion,
          }),
      heartbeat.imageId,
      heartbeat.runtimePolicyToken,
    );
    if (enrolling) this.wago.blockRuntime?.(id);
    this.reconciliationFailures.delete(id);
    return heartbeat;
  }
}
