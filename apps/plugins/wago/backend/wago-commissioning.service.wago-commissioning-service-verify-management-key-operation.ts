import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ManagementTarget } from './wago-management.types';
import { restoreManagementKey } from './wago-management-key';
import {
  commissioningCommandTimeout
} from './wago-commissioning-progress';
import { shellQuote } from "./wago-commissioning.service.shell-quote";
import { WagoCommissioningServiceManageSecurityWhileAuditedOperation } from "./wago-commissioning.service.wago-commissioning-service-manage-security-while-audited-operation";
import { pinnedHostKey } from "./wago-commissioning-host-identity";
import { runProcess } from "./wago-commissioning-process";

export abstract class WagoCommissioningServiceVerifyManagementKeyOperation extends WagoCommissioningServiceManageSecurityWhileAuditedOperation {


  protected async verifyManagementKey(
    target: ManagementTarget,
    username: string,
    privateKey: string,
    nonce: string,
    limits: { timeoutMs: number; maxOutputBytes: number },
  ) {
    const guard = this.operationContext.getStore();
    await guard?.assertOwned();
    commissioningCommandTimeout(limits.timeoutMs, guard?.deadline);
    if (!/^[a-f0-9]{32}$/.test(nonce) || !/^[a-z_][a-z0-9_-]{0,31}$/.test(username))
      throw new Error('Invalid management proof');
    const directory = await mkdtemp(join(tmpdir(), 'attraccess-management-key-'));
    try {
      const knownHosts = join(directory, 'known_hosts'),
        key = join(directory, 'identity.pub');
      const identity = restoreManagementKey(privateKey);
      await writeFile(knownHosts, await pinnedHostKey(target.host, target.hostKeyFingerprint), { mode: 0o600 });
      await writeFile(key, identity.publicKey, { mode: 0o600 });
      const keyFingerprint = identity.fingerprint;
      const socket = join(directory, 'agent.sock');
      const sshArguments = [
        '-F',
        '/dev/null',
        '-i',
        key,
        '-o',
        `IdentityAgent=${socket}`,
        '-o',
        'IdentitiesOnly=yes',
        '-o',
        'PreferredAuthentications=publickey',
        '-o',
        'PasswordAuthentication=no',
        '-o',
        'KbdInteractiveAuthentication=no',
        '-o',
        'BatchMode=yes',
        '-o',
        'ControlPath=none',
        '-o',
        'GlobalKnownHostsFile=/dev/null',
        '-o',
        `UserKnownHostsFile=${knownHosts}`,
        '-o',
        'StrictHostKeyChecking=yes',
        '-o',
        'HostKeyAlgorithms=ssh-ed25519',
        '-o',
        'ConnectTimeout=15',
        `${username}@${target.host}`,
        `printf '%s\\n' ${shellQuote(nonce)}; id -u`,
      ];
      // A dedicated short-lived agent holds only this generated identity. The key
      // enters via stdin, never argv or a disk file; the agent exits with SSH and
      // its 30-second key TTL also bounds credentials after a client crash.
      const output = await this.remoteOperation(() =>
        runProcess(
          'ssh-agent',
          [
            '-t',
            '30',
            '-a',
            socket,
            'sh',
            '-c',
            `ssh-add -t 30 - >/dev/null 2>&1 && exec ssh ${sshArguments.map(shellQuote).join(' ')}`,
          ],
          privateKey,
          {},
          {
            ...limits,
            timeoutMs: commissioningCommandTimeout(limits.timeoutMs, guard?.deadline),
            signal: guard?.signal,
          },
        ),
      );
      const match = output.match(new RegExp(`^${nonce}\\n([0-9]+)\\n$`));
      if (!match) throw new Error('Management key proof failed');
      return {
        nonce,
        hostKeyFingerprint: target.hostKeyFingerprint,
        keyFingerprint,
        keyOnly: true,
        uid: Number(match[1]),
        managementOperationSucceeded: true,
      };
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
}
