import type { PluginAuditPrincipal } from '@attraccess/plugins-backend-sdk';
import { WagoCommissioningSession } from './wago-commissioning-session.entity';
import { WagoManagedRuntimeServiceOnModuleDestroyOperation } from './wago-managed-runtime.wago-managed-runtime-service-on-module-destroy-operation';
import { managedSetupFailure, type ManagedSetupStage } from './wago-managed-setup-error';
import { RuntimeUpdateError } from './wago-runtime-update';
export abstract class WagoManagedEnrolmentFailure extends WagoManagedRuntimeServiceOnModuleDestroyOperation {
  protected async failEnrolment(
    session: WagoCommissioningSession,
    error: unknown,
    stage: ManagedSetupStage,
    attempted: boolean,
    principal: PluginAuditPrincipal | null,
    operationId: string,
    operation: AbortController,
  ): Promise<boolean> {
    if (attempted && principal)
      await this.securityAudit(session.id, 'security_apply', principal, operationId, 'failed').catch(() => undefined);
    await this.access
      .createQueryBuilder()
      .update()
      .set({ state: 'recovery_required' })
      .where('session_id = :sessionId AND state NOT IN (:...retired)', {
        sessionId: session.id,
        retired: ['retiring', 'retired'],
      })
      .execute();
    // Keep the last audited attempt's diagnosis through transient offline
    // probes while the controller reboots or its rollback is still running.
    const transientOfflineProbe =
      stage === 'status' && error instanceof RuntimeUpdateError && error.failure === 'offline';
    if (attempted || !session.failureReason || !transientOfflineProbe)
      await this.sessions.update(session.id, {
        failureReason: managedSetupFailure(stage, error, operation.signal.aborted),
        updatedAt: new Date().toISOString(),
      });
    return false;
  }
}
