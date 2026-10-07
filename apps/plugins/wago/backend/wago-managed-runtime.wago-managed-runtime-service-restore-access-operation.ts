import { randomBytes } from 'node:crypto';
import { randomUUID } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import { NotFoundException } from '@nestjs/common';
import type { PluginAuditPrincipal } from '@attraccess/plugins-backend-sdk';
import { WagoManagedRuntimeServiceCommissioningRecoveryPasswordOperation } from './wago-managed-runtime.service.wago-managed-runtime-service-commissioning-recovery-password-operation';


export abstract class WagoManagedRuntimeServiceRestoreAccessOperation extends WagoManagedRuntimeServiceCommissioningRecoveryPasswordOperation {
  async restoreAccess(sessionId: number, principal: PluginAuditPrincipal): Promise<void> {
    const access = await this.loadSession(sessionId);
    if (!access || !this.rootProbe || !this.retirementProbe)
      throw new NotFoundException('Managed recovery access not found');
    if (access.controllerId) await this.assertUpdateSettled(access.controllerId);
    const owner = randomBytes(16).toString('hex');
    if (!(await this.operations.acquire(access.fingerprint, owner, Date.now(), Date.now() + 60_000)))
      throw new ConflictException('Controller is busy');
    const operation = new AbortController();
    const timer = setTimeout(() => operation.abort(), 50_000).unref();
    const operationId = randomUUID();
    let attempted = false;
    try {
      if (access.controllerId) await this.assertUpdateSettled(access.controllerId);
      await this.securityAudit(sessionId, 'security_recover', principal, operationId, 'attempted');
      attempted = true;
      // Retire automatic access durably before restoring bootstrap policy. A
      // restarted reconciler must not immediately harden it again during recovery.
      await this.access.update(sessionId, { state: 'retiring' });
      const password = this.credentials(access).recoveryPassword;
      // An interrupted key removal may have succeeded. Verify its durable remote
      // result through restored pinned root access before trying the old key again.
      if (!(await this.retirementProbe(access.host, access.fingerprint, password))) {
        await this.connection(access, `access-restore ${access.token}`, operation.signal);
        await new Promise((resolve) => setTimeout(resolve, 3000));
        const deadline = Date.now() + 30_000;
        let restored = false;
        while (!operation.signal.aborted && Date.now() < deadline) {
          if (await this.rootProbe(access.host, access.fingerprint, password)) {
            restored = true;
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
        if (!restored)
          throw new ConflictException('Bootstrap SSH restoration is unverified; retry administrator recovery');
        await this.operations.assertOwned(access.fingerprint, owner);
        await this.connection(access, `access-retire ${access.token}`, operation.signal).catch(() => undefined);
      }
      if (!(await this.retirementProbe(access.host, access.fingerprint, password)))
        throw new ConflictException('Managed key retirement is unverified; retry administrator recovery');
      await this.operations.assertOwned(access.fingerprint, owner);
      await this.access.update(sessionId, { state: 'retired' });
      await this.securityAudit(sessionId, 'security_recover', principal, operationId, 'succeeded');
    } catch (error) {
      if (attempted)
        await this.securityAudit(sessionId, 'security_recover', principal, operationId, 'failed').catch(
          () => undefined,
        );
      throw error;
    } finally {
      clearTimeout(timer);
      operation.abort();
      await this.operations.release(access.fingerprint, owner);
    }
  }
}
