import { mkdtemp, rm, writeFile } from 'node:fs/promises';

import { tmpdir } from 'node:os';

import { join } from 'node:path';

import { commissioningCommandTimeout } from './progress';

import { runtimeBundleStreamReceiver } from '../../runtime/install';

import { SSH_TIMEOUT_MS } from '../model';

import { BOOTSTRAP_SSH_OPTIONS } from '../model';

import { TemporarySshCredential } from '../model';

import { shellQuote } from '../model';

import { pinnedHostKey } from './host-identity';

import { uploadFile } from './upload';

import { MANAGEMENT_INSPECTION_COMMAND } from '../../management/inspection';

import { ManagementPeerVersion } from '../../management/peer-version';

import { ConflictException } from '@nestjs/common';

import { WagoRecoveryError } from '../../runtime/recovery-error';

import { SshRunLimits } from '../model';

import { runProcess } from './process';

import { wagoFw31IdentityRead } from '../../host/firmware-identity';

import { parseWagoCodesysClassification, wagoCodesysClassificationShell } from '../../host/codesys-classification';

import { WagoCommissioningOwnership } from '../sessions/ownership';

export abstract class WagoCommissioningTransport extends WagoCommissioningOwnership {
  protected async copyTo(
    host: string,
    fingerprint: string,
    credential: TemporarySshCredential,
    source: string,
    script: string,
    onProgress: (percent: number) => void,
  ): Promise<void> {
    const guard = this.operationContext.getStore();
    await guard?.assertOwned();
    commissioningCommandTimeout(SSH_TIMEOUT_MS, guard?.deadline);
    const dir = await mkdtemp(join(tmpdir(), 'attraccess-cc100-'));
    const knownHosts = join(dir, 'known_hosts');
    const askPass = join(dir, 'askpass');
    try {
      await writeFile(knownHosts, await pinnedHostKey(host, fingerprint), { mode: 0o600 });
      await writeFile(askPass, '#!/bin/sh\nprintf \'%s\\n\' "$ATTRACCESS_SSH_PASSWORD"\n', { mode: 0o700 });
      // Keep the credential-bearing script off the API host's process arguments.
      // read consumes one line; the installer receives the remaining binary stream.
      const receiver = runtimeBundleStreamReceiver;
      await this.remoteOperation(() =>
        uploadFile(
          source,
          [
            ...BOOTSTRAP_SSH_OPTIONS,
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
            credential.username === 'root' ? `sh -c ${shellQuote(receiver)}` : `sudo -S sh -c ${shellQuote(receiver)}`,
          ],
          {
            SSH_ASKPASS: askPass,
            SSH_ASKPASS_REQUIRE: 'force',
            DISPLAY: 'attraccess',
            ATTRACCESS_SSH_PASSWORD: credential.password,
          },
          onProgress,
          `${credential.username === 'root' ? '' : `${credential.password}\n`}${Buffer.from(script).toString('base64')}\n`,
          guard?.signal,
          commissioningCommandTimeout(SSH_TIMEOUT_MS, guard?.deadline),
        ),
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

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

  protected async remoteOperation<T>(operation: () => Promise<T>): Promise<T> {
    await this.operationContext.getStore()?.assertOwned();
    return operation();
  }

  protected sudoRunScript(
    host: string,
    fingerprint: string,
    credential: TemporarySshCredential,
    script: string,
    limits?: SshRunLimits,
  ): Promise<string> {
    return this.sudoRun(
      host,
      fingerprint,
      credential,
      'base64 -d | sh',
      Buffer.from(script).toString('base64'),
      limits,
    );
  }

  protected sudoRun(
    host: string,
    fingerprint: string,
    credential: TemporarySshCredential,
    command: string,
    input?: string,
    limits?: SshRunLimits,
  ): Promise<string> {
    if (credential.username === 'root') return this.run(host, fingerprint, credential, command, input, limits);
    return this.run(
      host,
      fingerprint,
      credential,
      `sudo -S sh -c ${shellQuote(command)}`,
      `${credential.password}\n${input ?? ''}`,
      limits,
    );
  }

  protected async inspect(
    host: string,
    fingerprint: string,
    credential: TemporarySshCredential,
  ): Promise<{ firmware: string; codesys: string }> {
    const output = await this.sudoRunScript(
      host,
      fingerprint,
      credential,
      `${wagoFw31IdentityRead()}; root=''; ${wagoCodesysClassificationShell()}\nprintf '\\nCODESYS='; wago_codesys_classify`,
    );
    const marker = '\nCODESYS=';
    const markerIndex = output.indexOf(marker);
    const firmware = markerIndex >= 0 ? output.slice(0, markerIndex) : output;
    const processes = markerIndex >= 0 ? output.slice(markerIndex + marker.length) : '';
    return {
      firmware,
      codesys: markerIndex < 0 ? 'unknown' : parseWagoCodesysClassification(processes),
    };
  }
}
