import { MANAGEMENT_INSPECTION_COMMAND } from './wago-management-inspection';
import { ManagementPeerVersion } from './wago-management-peer-version';
import {
  ConflictException
} from '@nestjs/common';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WagoRecoveryError } from './wago-recovery-error';
import {
  commissioningCommandTimeout
} from './wago-commissioning-progress';
import { SSH_TIMEOUT_MS } from "./wago-commissioning.service.ssh-timeout-ms";
import { BOOTSTRAP_SSH_OPTIONS } from "./wago-commissioning.service.bootstrap-ssh-options";
import { TemporarySshCredential } from "./wago-commissioning.service.temporary-ssh-credential";
import { SshRunLimits } from "./wago-commissioning.service.ssh-run-limits";
import { shellQuote } from "./wago-commissioning.service.shell-quote";
import { WagoCommissioningServiceRemoteOperationOperation } from "./wago-commissioning.service.wago-commissioning-service-remote-operation-operation";
import { pinnedHostKey } from "./wago-commissioning-host-identity";
import { runProcess } from "./wago-commissioning-process";

export abstract class WagoCommissioningServiceRunOperation extends WagoCommissioningServiceRemoteOperationOperation {


  protected async run(
    host: string,
    fingerprint: string,
    credential: TemporarySshCredential,
    command: string,
    input?: string,
    limits?: SshRunLimits,
  ): Promise<string> {
    const guard = this.operationContext.getStore();
    await guard?.assertOwned();
    commissioningCommandTimeout(limits?.timeoutMs ?? SSH_TIMEOUT_MS, guard?.deadline);
    const dir = await mkdtemp(join(tmpdir(), 'attraccess-cc100-'));
    const knownHosts = join(dir, 'known_hosts');
    const askPass = join(dir, 'askpass');
    const peer = command === MANAGEMENT_INSPECTION_COMMAND ? new ManagementPeerVersion() : undefined;
    try {
      let pinnedKey: string;
      try {
        pinnedKey = await pinnedHostKey(host, fingerprint);
      } catch (error) {
        if (limits?.recoveryDiagnostic)
          throw new WagoRecoveryError(error instanceof ConflictException ? 'identity' : 'transport');
        throw error;
      }
      await writeFile(knownHosts, pinnedKey, { mode: 0o600 });
      await writeFile(askPass, '#!/bin/sh\nprintf \'%s\\n\' "$ATTRACCESS_SSH_PASSWORD"\n', { mode: 0o700 });
      const output = await this.remoteOperation(() =>
        runProcess(
          'ssh',
          [
            ...BOOTSTRAP_SSH_OPTIONS,
            ...(peer ? ['-v'] : []),
            '-o',
            'BatchMode=no',
            '-o',
            'NumberOfPasswordPrompts=1',
            '-o',
            'HostKeyAlgorithms=ssh-ed25519',
            '-o',
            'StrictHostKeyChecking=yes',
            '-o',
            `UserKnownHostsFile=${knownHosts}`,
            '-o',
            'ConnectTimeout=15',
            `${credential.username}@${host}`,
            `sh -c ${shellQuote(command)}`,
          ],
          input,
          {
            SSH_ASKPASS: askPass,
            SSH_ASKPASS_REQUIRE: 'force',
            DISPLAY: 'attraccess',
            ATTRACCESS_SSH_PASSWORD: credential.password,
          },
          {
            timeoutMs: commissioningCommandTimeout(limits?.timeoutMs ?? SSH_TIMEOUT_MS, guard?.deadline),
            maxOutputBytes: limits?.maxOutputBytes ?? 65_536,
            storageDiagnostic: limits?.storageDiagnostic,
            lockDiagnostic: limits?.lockDiagnostic,
            managementDiagnostic: limits?.managementDiagnostic,
            recoveryDiagnostic: limits?.recoveryDiagnostic,
            onProgress: limits?.onProgress,
            signal: guard?.signal,
            peerVersion: peer,
          },
        ),
      );
      // -v's identification belongs to this authenticated, pinned SSH session.
      // Root /proc executable access is unnecessary for a non-root account.
      return peer ? output.replace(/\nEND=1\n$/, `\nDROPBEAR=${peer.result()}\nEND=1\n`) : output;
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
}
