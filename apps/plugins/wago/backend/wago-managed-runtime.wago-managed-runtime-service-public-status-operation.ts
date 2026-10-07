import { WagoManagedAccess } from './wago-managed-access.entity';
import type { RuntimeUpdateRecord } from './wago-runtime-update';
import { WagoManagedRuntimeServiceSessionStatusOperation } from './wago-managed-runtime.wago-managed-runtime-service-session-status-operation';


export abstract class WagoManagedRuntimeServicePublicStatusOperation extends WagoManagedRuntimeServiceSessionStatusOperation {
  protected async publicStatus(access: WagoManagedAccess | null, requestedControllerId?: number) {
    if (access && !['retiring', 'retired'].includes(access.state)) {
      try {
        const stored = await this.loadSession(access.sessionId);
        if (!stored) throw new Error();
        this.credentials(stored);
      } catch {
        await this.setActiveState(access.sessionId, 'recovery_required').catch(() => undefined);
        access = await this.access.findOneBy({ sessionId: access.sessionId });
      }
    }
    const row = access?.controllerId ? await this.updates.findOneBy({ controllerId: access.controllerId }) : null;
    const controllerId = requestedControllerId ?? access?.controllerId;
    const controller = controllerId ? await this.controllers.findOneBy({ id: controllerId }) : null;
    const desired = controller ? await this.artifacts.current().catch(() => null) : null;
    const managementSetup =
      access?.state === 'verified'
        ? (this.enrolmentProgress.get(controllerId ?? 0) ?? {
            state: 'waiting' as const,
            reason: controller
              ? ((await this.enrolmentWaitReason(
                  controller,
                  await this.sessions.findOneBy({ id: access.sessionId }),
                )) ?? 'scheduled')
              : 'connection',
          })
        : undefined;
    const managementFailure =
      access && ['verified', 'recovery_required'].includes(access.state)
        ? (await this.sessions.findOneBy({ id: access.sessionId }))?.failureReason
        : null;
    return {
      ...(managementFailure ? { managementFailure } : {}),
      sessionId: access?.sessionId ?? null,
      management: access?.state ?? 'reenrol_required',
      keyFingerprint: access?.keyFingerprint ?? null,
      update: row?.metadata ? (JSON.parse(row.metadata) as RuntimeUpdateRecord) : null,
      ...(managementSetup ? { managementSetup } : {}),
      ...(controller
        ? {
            runtime: {
              runningVersion: controller.runtimeVersion,
              runningImageId: this.heartbeats.get(controller.id)?.imageId || null,
              desiredVersion: desired?.manifest.runtimeVersion ?? null,
              desiredImageId: desired && 'imageId' in desired ? desired.imageId : null,
            },
          }
        : {}),
      ...(access?.controllerId && this.wago.isRuntimeUpdateRequired
        ? { runtimeUpdateRequired: this.wago.isRuntimeUpdateRequired(access.controllerId) }
        : {}),
      ...(access?.controllerId && this.reconciliationFailures.has(access.controllerId)
        ? { blocker: this.reconciliationFailures.get(access.controllerId) }
        : {}),
      physicalQualification: 'unverified' as const,
    };
  }
}
