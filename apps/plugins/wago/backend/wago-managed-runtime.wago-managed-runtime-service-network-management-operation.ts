import { createHash } from 'node:crypto';
import { randomBytes } from 'node:crypto';
import { managedHostHelper } from './wago-managed-helper';
import { MANAGED_HELPER_PROTOCOL } from './wago-managed-installer';
import { signInstaller } from './wago-managed-installer';
import { RuntimeUpdateError } from './wago-runtime-update';
import { WagoManagedRuntimeServiceAssertNetworkSettledOperation } from './wago-managed-runtime.wago-managed-runtime-service-assert-network-settled-operation';


export abstract class WagoManagedRuntimeServiceNetworkManagementOperation extends WagoManagedRuntimeServiceAssertNetworkSettledOperation {
  /** Uses the replacement address on the FIRST SSH connection. The stored
   * credential binding is validated at its original address; only the transport
   * destination changes, with the same pinned host identity and managed key.
   */
  async networkManagement(controllerId: number, targetHost: string, signal: AbortSignal) {
    const access = await this.required(controllerId);
    const credentials = this.credentials(access);
    const session = await this.sessions.findOneBy({ id: access.sessionId });
    if (
      !session ||
      session.state !== 'completed' ||
      session.targetHost !== access.host ||
      session.hostKeyFingerprint !== access.fingerprint ||
      session.hardwareId !== credentials.hardwareId
    )
      throw new RuntimeUpdateError('management_required');
    const command = (header: string, payload?: Buffer) => this.connection(access, header, signal, payload, targetHost);
    const nonce = randomBytes(16).toString('hex');
    if ((await command(`proof ${nonce}`)) !== `OK ${nonce}\n`) throw new RuntimeUpdateError('authentication');
    const plaintext = JSON.stringify({ ...credentials, host: targetHost });
    const encryptedCredentials = this.context.secrets.encrypt(plaintext);
    if (
      !encryptedCredentials ||
      encryptedCredentials === plaintext ||
      this.context.secrets.decrypt(encryptedCredentials) !== plaintext
    )
      throw new RuntimeUpdateError('management_required');
    return {
      sessionId: access.sessionId,
      fingerprint: access.fingerprint,
      hardwareId: credentials.hardwareId,
      managementToken: access.token,
      encryptedCredentials,
      command,
      prepare: async () => {
        const desired = await this.desired();
        const helper = managedHostHelper(desired);
        const digest = createHash('sha256').update(helper).digest('hex');
        const inspect = () => command(`inspect ${access.token}`);
        const pattern = new RegExp(
          `^${MANAGED_HELPER_PROTOCOL}\\n([a-f0-9]{64})\\n(sha256:[a-f0-9]{64}) (true|false)\\n$`,
        );
        let match = pattern.exec(await inspect());
        if (!match) throw new RuntimeUpdateError('incompatible');
        if (match[1] !== digest) {
          const signature = signInstaller(credentials.installerPrivateKey, access.token, helper);
          if (
            (await command(
              `installer-publish ${access.token} ${digest} ${Buffer.byteLength(helper)} ${signature}`,
              Buffer.from(helper),
            )) !== 'OK\n'
          )
            throw new RuntimeUpdateError('incompatible');
          match = pattern.exec(await inspect());
        }
        if (match?.[1] !== digest) throw new RuntimeUpdateError('incompatible');
      },
    };
  }
}
