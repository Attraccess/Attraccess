import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  commissioningCommandTimeout
} from './wago-commissioning-progress';
import {
  runtimeBundleStreamReceiver,
} from './wago-runtime-install';
import { SSH_TIMEOUT_MS } from "./wago-commissioning.service.ssh-timeout-ms";
import { BOOTSTRAP_SSH_OPTIONS } from "./wago-commissioning.service.bootstrap-ssh-options";
import { TemporarySshCredential } from "./wago-commissioning.service.temporary-ssh-credential";
import { shellQuote } from "./wago-commissioning.service.shell-quote";
import { WagoCommissioningServiceRunOperation } from "./wago-commissioning.service.wago-commissioning-service-run-operation";
import { pinnedHostKey } from "./wago-commissioning-host-identity";
import { uploadFile } from "./wago-commissioning-upload";

export abstract class WagoCommissioningServiceCopyToOperation extends WagoCommissioningServiceRunOperation {


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
}
