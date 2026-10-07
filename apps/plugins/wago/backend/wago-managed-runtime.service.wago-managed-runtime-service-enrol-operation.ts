import { randomBytes } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import { generateManagementKey, restoreManagementKey } from './wago-management-key';
import { managedHostHelper } from './wago-managed-helper';
import { generateInstallerAuthority, installerPublicKey } from './wago-managed-installer';
import { managedProvisionScript } from './wago-managed-provision';
import { WagoManagedProvisioningError, type ManagedProvisioningStage } from './wago-managed-provisioning-error';
import { WagoCommissioningSession } from './wago-commissioning-session.entity';
import { Credentials } from './wago-managed-runtime.contracts';
import { WagoManagedRuntimeServiceBindOperation } from './wago-managed-runtime.wago-managed-runtime-service-bind-operation';
export abstract class WagoManagedRuntimeServiceEnrolOperation extends WagoManagedRuntimeServiceBindOperation {
  /** Called inside the commissioning device lease, with fresh bootstrap credentials.
   * DB encryption/storage completes before account/password mutation. The generated
   * root password is independently authenticated before SSH policy can change.
   */
  async enrol(
    session: WagoCommissioningSession,
    execute: (script: string) => Promise<string>,
    signal: AbortSignal,
  ): Promise<void> {
    const desired = await this.desired();
    let access = await this.loadSession(session.id);
    if (
      access &&
      (access.fingerprint !== session.hostKeyFingerprint ||
        access.host !== session.targetHost ||
        ['retiring', 'retired'].includes(access.state))
    )
      throw new ConflictException('Managed identity changed; create a fresh enrolment session.');
    if (!access) {
      const key = generateManagementKey();
      const credentials: Credentials = {
        sessionId: session.id,
        host: session.targetHost,
        hardwareId: session.hardwareId,
        fingerprint: session.hostKeyFingerprint,
        token: randomBytes(16).toString('hex'),
        privateKey: key.privateKey,
        recoveryPassword: randomBytes(32).toString('base64url'),
        installerPrivateKey: generateInstallerAuthority().privateKey,
      };
      const plaintext = JSON.stringify(credentials);
      const encryptedCredentials = this.context.secrets.encrypt(plaintext);
      if (
        !encryptedCredentials ||
        encryptedCredentials === plaintext ||
        this.context.secrets.decrypt(encryptedCredentials) !== plaintext
      )
        throw new ConflictException('Managed credential encryption failed.');
      access = await this.access.save(
        this.access.create({
          sessionId: session.id,
          controllerId: null,
          host: session.targetHost,
          fingerprint: session.hostKeyFingerprint,
          token: credentials.token,
          state: 'pending',
          encryptedCredentials,
          keyFingerprint: key.fingerprint,
        }),
      );
      key.privateKey = '';
      // Verify the persisted envelope, rather than the ORM save result, before
      // replacing any remote password or key. Storage failures leave SSH intact.
      access = await this.loadSession(session.id);
      if (!access) throw new ConflictException('Managed credential storage verification failed.');
    }
    const credentials = this.credentials(access);
    if (credentials.hardwareId !== session.hardwareId)
      throw new ConflictException('Managed credentials belong to another controller identity');
    let stage: ManagedProvisioningStage = 'filesystem';
    try {
      if (access.state !== 'verified' && access.state !== 'managed') {
        const key = restoreManagementKey(credentials.privateKey, access.keyFingerprint);
        if (
          (await execute(
            managedProvisionScript(
              access.token,
              key.publicKey,
              credentials.recoveryPassword,
              managedHostHelper(desired),
              '',
              installerPublicKey(credentials.installerPrivateKey),
            ),
          )) !== 'OK\n'
        )
          throw new Error();
      }
      stage = 'proof';
      await this.prove(access, signal);
      stage = 'root';
      if (!this.rootProbe || !(await this.rootProbe(access.host, access.fingerprint, credentials.recoveryPassword)))
        throw new Error();
      await this.setActiveState(access.sessionId, 'verified');
      stage = 'commit';
      if ((await this.connection(access, `access-key-commit ${access.token}`, signal)) !== 'OK\n') throw new Error();
      await this.prove(access, signal);
    } catch (error) {
      await this.setActiveState(access.sessionId, 'recovery_required');
      throw error instanceof WagoManagedProvisioningError ? error : new WagoManagedProvisioningError(stage);
    }
  }
}
