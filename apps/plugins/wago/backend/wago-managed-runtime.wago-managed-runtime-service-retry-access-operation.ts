import { randomBytes } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import { WagoManagedRuntimeServiceRestoreAccessOperation } from './wago-managed-runtime.wago-managed-runtime-service-restore-access-operation';


export abstract class WagoManagedRuntimeServiceRetryAccessOperation extends WagoManagedRuntimeServiceRestoreAccessOperation {
  async retryAccess(sessionId: number): Promise<void> {
    let access = await this.loadSession(sessionId);
    if (!access || ['retiring', 'retired'].includes(access.state))
      throw new ConflictException('Managed access cannot be retried');
    const fingerprint = access.fingerprint;
    const owner = randomBytes(16).toString('hex');
    if (!(await this.operations.acquire(access.fingerprint, owner, Date.now(), Date.now() + 60_000)))
      throw new ConflictException('Controller is busy');
    const operation = new AbortController();
    const timer = setTimeout(() => operation.abort(), 50_000).unref();
    try {
      access = await this.loadSession(sessionId);
      if (!access || ['retiring', 'retired'].includes(access.state))
        throw new ConflictException('Managed access cannot be retried');
      if (access.controllerId) await this.assertNetworkSettled(access.controllerId);
      await this.prove(access, operation.signal);
      const status = await this.connection(access, `access-status ${access.token}`, operation.signal);
      await this.operations.assertOwned(access.fingerprint, owner);
      if (status === 'committed\n') {
        if ((await this.connection(access, `access-policy ${access.token}`, operation.signal)) !== 'OK\n')
          throw new Error('Managed SSH policy is unverified');
        await this.setActiveState(sessionId, 'managed');
      } else if (
        status === 'open\n' &&
        this.rootProbe &&
        (await this.rootProbe(access.host, access.fingerprint, this.credentials(access).recoveryPassword))
      ) {
        await this.setActiveState(sessionId, 'verified');
        await this.connection(access, `access-key-commit ${access.token}`, operation.signal);
        await this.prove(access, operation.signal);
      } else throw new ConflictException('Wait for the SSH-policy watchdog to restore access before retrying');
    } finally {
      clearTimeout(timer);
      operation.abort();
      await this.operations.release(fingerprint, owner);
    }
    this.wake();
  }
}
