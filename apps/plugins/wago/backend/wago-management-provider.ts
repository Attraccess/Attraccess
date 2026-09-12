import { MANAGEMENT_INSPECTION_COMMAND, parseManagementInspection } from './wago-management-inspection';
import { managementKeyCommand } from './wago-management-shell';
import type {
  ManagementAdapter,
  ManagementInspection,
  ManagementMode,
  ManagementQualification,
  ManagementTarget,
  ManagementTransaction,
  PinnedManagementSsh,
  SessionCredential,
} from './wago-management.types';

const limits = Object.freeze({ timeoutMs: 15000, maxOutputBytes: 16384 });

/** Built-in provider: executable inspection and reversible additive OpenSSH/Dropbear key enrollment.
 * It does not expose an arbitrary privileged executor, use sudo, change passwords, configure WBM,
 * install users or reload daemons. Firmware-specific baseline methods fail closed.
 */
export class WagoManagementProvider implements ManagementAdapter {
  constructor(private readonly ssh: PinnedManagementSsh) {}

  async inspect(target: ManagementTarget, credential: SessionCredential): Promise<ManagementInspection> {
    return parseManagementInspection(await this.ssh.execute(target, credential, MANAGEMENT_INSPECTION_COMMAND, limits));
  }

  qualify(inspection: ManagementInspection, mode: ManagementMode): ManagementQualification {
    if (inspection.firmware !== '31' || inspection.model !== 'cc100')
      return {
        support: 'UNSUPPORTED',
        evidence: 'missing-fw31-command-evidence',
        minimumPrivileges: false,
        rebootSafeWatchdog: false,
      };
    if (
      mode === 'key_only' &&
      inspection.model === 'cc100' &&
      inspection.firmware === '31' &&
      (inspection.ssh === 'openssh' || (inspection.ssh === 'dropbear' && inspection.dropbearVersion === '2025.88')) &&
      inspection.uid !== null &&
      inspection.uid > 0
    ) {
      return {
        support: 'supported',
        evidence: inspection.ssh === 'openssh' ? 'openssh-authorized-keys' : 'dropbear-2025.88-authorized-keys',
        minimumPrivileges: false,
        rebootSafeWatchdog: false,
      };
    }
    return {
      support: 'UNSUPPORTED',
      evidence: mode === 'baseline' ? 'fw31-baseline-not-implemented' : 'supported-ssh-nonroot-account-required',
      minimumPrivileges: false,
      rebootSafeWatchdog: false,
    };
  }

  async prepare(tx: ManagementTransaction, credential: SessionCredential): Promise<void> {
    await this.action('prepare', tx, credential);
  }
  async armWatchdog(
    tx: ManagementTransaction,
    credential: SessionCredential,
  ): Promise<{ armed: boolean; rebootSafe: boolean }> {
    await this.action('arm', tx, credential);
    return { armed: true, rebootSafe: false };
  }
  async installKey(tx: ManagementTransaction, credential: SessionCredential, publicKey: string): Promise<void> {
    await this.action('install', tx, credential, publicKey);
  }
  verifyKey(tx: ManagementTransaction, privateKey: string, nonce: string) {
    return this.ssh.verifyNewKeyConnection(tx.target, tx.username, privateKey, nonce, limits);
  }
  async restrictAccess(): Promise<never> {
    throw new Error('fw31-baseline-not-implemented');
  }
  async verifyBaseline(): Promise<never> {
    throw new Error('fw31-baseline-not-implemented');
  }
  async commit(tx: ManagementTransaction, credential: SessionCredential): Promise<void> {
    await this.action('commit', tx, credential);
  }
  async rollback(tx: ManagementTransaction, credential: SessionCredential): Promise<void> {
    await this.action('rollback', tx, credential);
  }

  private async action(
    action: 'prepare' | 'arm' | 'install' | 'commit' | 'rollback',
    tx: ManagementTransaction,
    credential: SessionCredential,
    publicKey?: string,
  ): Promise<void> {
    if (credential.username !== tx.username) throw new Error('credential_required');
    // Remote relative timer avoids assuming that the controller clock matches the host clock.
    const output = await this.ssh.execute(
      tx.target,
      credential,
      managementKeyCommand(action, tx.id, 180, publicKey),
      limits,
    );
    if (output !== 'OK\n') throw new Error('transition_failed');
  }
}
