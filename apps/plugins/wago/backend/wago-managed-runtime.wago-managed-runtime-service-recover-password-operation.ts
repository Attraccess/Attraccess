import { randomUUID } from 'node:crypto';
import { NotFoundException } from '@nestjs/common';
import type { PluginAuditPrincipal } from '@attraccess/plugins-backend-sdk';
import { WagoManagedRuntimeServicePublicStatusOperation } from './wago-managed-runtime.wago-managed-runtime-service-public-status-operation';


export abstract class WagoManagedRuntimeServiceRecoverPasswordOperation extends WagoManagedRuntimeServicePublicStatusOperation {
  async recoverPassword(sessionId: number, principal: PluginAuditPrincipal): Promise<{ password: string }> {
    const access = await this.loadSession(sessionId);
    if (!access) throw new NotFoundException('Managed recovery credential not found');
    // Fail closed on missing/unavailable durable audit. Never put secret material in event details.
    const operationId = randomUUID();
    await this.securityAudit(sessionId, 'root_recovery', principal, operationId, 'attempted');
    try {
      const password = this.credentials(access).recoveryPassword;
      await this.securityAudit(sessionId, 'root_recovery', principal, operationId, 'succeeded');
      return { password };
    } catch (error) {
      await this.securityAudit(sessionId, 'root_recovery', principal, operationId, 'failed').catch(() => undefined);
      throw error;
    }
  }
}
