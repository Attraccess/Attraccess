import { WagoManagedAccess } from './access.entity';

import { randomBytes, createHash, randomUUID } from 'node:crypto';

import { RuntimeUpdateError } from '../update/coordinator';

import { managedSsh } from './ssh';

import { Credentials } from './contracts';

import { ConflictException, NotFoundException } from '@nestjs/common';

import { restoreManagementKey } from '../../management/key';

import { installerPublicKey } from './installer';

import { managedHostHelper } from './helper';

import { type BuildRuntimeArtifact } from '../artifacts/build';

import { type PluginAuditPrincipal } from '@attraccess/plugins-backend-sdk';

import { WagoCommissioningSession } from '../../commissioning/session.entity';

import { WagoManagedRuntimeEnrollment } from './enrollment';

export abstract class WagoManagedRuntimeAccess extends WagoManagedRuntimeEnrollment {
  protected async prove(access: WagoManagedAccess, signal?: AbortSignal) {
    const nonce = randomBytes(16).toString('hex');
    if ((await this.connection(access, `proof ${nonce}`, signal)) !== `OK ${nonce}\n`)
      throw new Error('Managed key proof failed');
  }

  protected async connection(
    access: WagoManagedAccess,
    header: string,
    signal?: AbortSignal,
    file?: string | Buffer,
    targetHost = access.host,
  ) {
    const operation = new AbortController();
    this.connections.add(operation);
    const abort = () => operation.abort();
    signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(abort, 25 * 60_000).unref();
    try {
      if (this.destroyed || signal?.aborted) operation.abort();
      let credentials: Credentials;
      try {
        credentials = this.credentials(access);
      } catch {
        throw new RuntimeUpdateError('management_required');
      }
      return await managedSsh({ ...access, host: targetHost }, credentials.privateKey, header, operation.signal, file);
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      operation.abort();
      this.connections.delete(operation);
    }
  }

  protected credentials(access: WagoManagedAccess): Credentials {
    try {
      const value = JSON.parse(this.context.secrets.decrypt(access.encryptedCredentials)) as Credentials;
      if (
        value.sessionId !== access.sessionId ||
        value.host !== access.host ||
        typeof value.hardwareId !== 'string' ||
        !value.hardwareId ||
        value.fingerprint !== access.fingerprint ||
        value.token !== access.token ||
        !/^[A-Za-z0-9_-]{43}$/.test(value.recoveryPassword)
      )
        throw new Error();
      restoreManagementKey(value.privateKey, access.keyFingerprint);
      installerPublicKey(value.installerPrivateKey);
      return value;
    } catch {
      throw new ConflictException('Managed credential envelope is unavailable or does not match this device');
    }
  }

  protected async required(controllerId: number): Promise<WagoManagedAccess> {
    const row = await this.access
      .createQueryBuilder('access')
      .addSelect('access.encryptedCredentials')
      .where('access.controllerId = :controllerId AND access.state = :state', { controllerId, state: 'managed' })
      .orderBy('access.sessionId', 'DESC')
      .getOne();
    if (!row) throw new RuntimeUpdateError('management_required');
    return row;
  }

  protected loadSession(sessionId: number): Promise<WagoManagedAccess | null> {
    return this.access
      .createQueryBuilder('access')
      .addSelect('access.encryptedCredentials')
      .where('access.sessionId = :sessionId', { sessionId })
      .getOne();
  }

  protected async desired(): Promise<BuildRuntimeArtifact> {
    const value = await this.artifacts.current();
    if (
      !value ||
      !('imageId' in value) ||
      !('buildId' in value) ||
      typeof value.imageId !== 'string' ||
      typeof value.buildId !== 'string'
    )
      throw new RuntimeUpdateError('runtime_assets');
    return {
      ...value,
      installerSha256: createHash('sha256')
        .update(managedHostHelper(value as BuildRuntimeArtifact))
        .digest('hex'),
    } as BuildRuntimeArtifact;
  }

  async retryRuntime(controllerId: number): Promise<void> {
    await this.required(controllerId);
    if ((await this.coordinator.reconcile(controllerId, true)) === 'busy')
      throw new ConflictException('Controller is busy; retry after its current operation finishes');
  }

  protected async setActiveState(
    sessionId: number,
    state: 'verified' | 'managed' | 'recovery_required',
  ): Promise<void> {
    const result = await this.access
      .createQueryBuilder()
      .update()
      .set({ state })
      .where('session_id = :sessionId AND state NOT IN (:...retired)', {
        sessionId,
        retired: ['retiring', 'retired'],
      })
      .execute();
    if (result.affected !== 1) throw new ConflictException('Managed access is being retired');
  }

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

  /** Used only inside an audited commissioning recovery and its device lock.
   * A failed FW31 preflight may leave the factory password unchanged, so prove
   * the encrypted recovery login before selecting it. Never disclose it to UI.
   */
  async commissioningRecoveryPassword(session: WagoCommissioningSession): Promise<string | null> {
    const access = await this.loadSession(session.id);
    if (!access || !this.rootProbe || !['pending', 'verified', 'recovery_required'].includes(access.state)) return null;
    const credentials = this.credentials(access);
    if (
      access.host !== session.targetHost ||
      access.fingerprint !== session.hostKeyFingerprint ||
      credentials.hardwareId !== session.hardwareId
    )
      throw new ConflictException('Managed recovery identity changed; check the saved controller identity.');
    return (await this.rootProbe(access.host, access.fingerprint, credentials.recoveryPassword))
      ? credentials.recoveryPassword
      : null;
  }

  async hasAccess(sessionId: number): Promise<boolean> {
    return !!(await this.access.findOneBy({ sessionId }));
  }
}
