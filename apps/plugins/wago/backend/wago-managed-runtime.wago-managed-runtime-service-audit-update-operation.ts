import type { RuntimeUpdateRecord } from './wago-runtime-update';
import { randomUUID } from 'node:crypto';
import type { PluginAuditPrincipal } from '@attraccess/plugins-backend-sdk';
import { RuntimeUpdateError } from './wago-runtime-update';
import { WagoManagedRuntimeServiceUpdateHostOperation } from './wago-managed-runtime.service.wago-managed-runtime-service-update-host-operation';


export abstract class WagoManagedRuntimeServiceAuditUpdateOperation extends WagoManagedRuntimeServiceUpdateHostOperation {
  protected async auditUpdate(record: RuntimeUpdateRecord) {
    const access = await this.required(record.controllerId);
    const session = await this.sessions.findOneByOrFail({ id: access.sessionId });
    const principal = JSON.parse(session.initiatingPrincipal ?? 'null') as PluginAuditPrincipal | null;
    if (!principal || !Number.isSafeInteger(principal.userId) || principal.userId <= 0)
      throw new RuntimeUpdateError('audit');
    const receipt = await this.context.audit.record({
      action: 'wago.runtime_update',
      operationId: randomUUID(),
      principal,
      outcome: record.phase === 'current' ? 'succeeded' : record.failure ? 'failed' : 'attempted',
      subject: { type: 'wago.controller', id: record.controllerId },
      details: {
        phase: record.phase,
        imageId: record.desiredImageId,
        buildId: record.buildId,
        ...(record.installerSha256 ? { installerSha256: record.installerSha256 } : {}),
        ...(record.failure ? { failure: record.failure } : {}),
      },
    });
    if (receipt.status !== 'recorded') throw new RuntimeUpdateError('audit');
  }
}
