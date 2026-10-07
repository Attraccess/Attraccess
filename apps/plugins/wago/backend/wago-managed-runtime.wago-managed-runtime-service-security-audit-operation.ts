import { ConflictException } from '@nestjs/common';
import type { PluginAuditPrincipal } from '@attraccess/plugins-backend-sdk';
import { WagoManagedRuntimeServiceFinishSessionOperation } from './wago-managed-runtime.wago-managed-runtime-service-finish-session-operation';


export abstract class WagoManagedRuntimeServiceSecurityAuditOperation extends WagoManagedRuntimeServiceFinishSessionOperation {
  protected async securityAudit(
    id: number,
    action: 'root_recovery' | 'security_apply' | 'security_recover',
    principal: PluginAuditPrincipal,
    operationId: string,
    outcome: 'attempted' | 'succeeded' | 'failed',
  ) {
    const receipt = await this.context.audit.record({
      action: `wago.commissioning.${action}`,
      operationId,
      principal,
      outcome,
      subject: { type: 'wago.commissioning', id },
      details: {},
    });
    if (receipt.status !== 'recorded')
      throw new ConflictException('Durable audit is required for managed SSH recovery and transitions');
  }
}
