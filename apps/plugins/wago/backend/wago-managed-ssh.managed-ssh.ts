import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { restoreManagementKey } from './wago-management-key';
import type { WagoManagedAccess } from './wago-managed-access.entity';
import { MANAGEMENT_USERNAME } from './wago-managed-provision';
import { RuntimeUpdateError } from './wago-runtime-update';
import { processOutput } from './wago-managed-ssh.helpers';

/** Dedicated key-only agent per connection. Neither private keys nor passwords are
 * written to disk, inherited from the user's SSH agent, or placed in argv.
 */
export async function managedSsh(
  access: WagoManagedAccess,
  privateKey: string,
  header: string,
  signal: AbortSignal,
  file?: string | Buffer,
): Promise<string> {
  if (!/^[a-z-]+ [a-f0-9]{32}(?: [A-Za-z0-9:/@_.+=-]+){0,5}$/.test(header) || header.length > 1024)
    throw new Error('Invalid managed operation');
  const address = access.host.split('.').map(Number);
  if (
    address.length !== 4 ||
    address.some((value) => !Number.isInteger(value) || value < 0 || value > 255) ||
    !(
      address[0] === 10 ||
      (address[0] === 172 && address[1] >= 16 && address[1] <= 31) ||
      (address[0] === 192 && address[1] === 168)
    )
  )
    throw new Error('Invalid managed target');
  const identity = restoreManagementKey(privateKey, access.keyFingerprint);
  const directory = await mkdtemp(join(tmpdir(), 'attraccess-managed-ssh-'));
  let agent: ReturnType<typeof spawn> | undefined;
  try {
    const scanned = await processOutput('ssh-keyscan', ['-T', '15', '-t', 'ed25519', access.host], '', signal);
    const line = scanned.split('\n').find((entry) => {
      const fields = entry.trim().split(/\s+/);
      return (
        fields.length === 3 &&
        fields[1] === 'ssh-ed25519' &&
        `SHA256:${createHash('sha256').update(Buffer.from(fields[2], 'base64')).digest('base64').replace(/=+$/, '')}` ===
          access.fingerprint
      );
    });
    if (!line) throw new RuntimeUpdateError('host_identity');
    const knownHosts = join(directory, 'known_hosts'),
      publicKey = join(directory, 'identity.pub'),
      socket = join(directory, 'agent.sock');
    await writeFile(knownHosts, line + '\n', { mode: 0o600 });
    await writeFile(publicKey, identity.publicKey, { mode: 0o600 });
    // COMMAND mode makes the agent monitor its owner. The bounded watcher also
    // exits if the server is killed, so a crash cannot leave a permanent agent.
    agent = spawn(
      'ssh-agent',
      [
        '-a',
        socket,
        '-t',
        '1800',
        'sh',
        '-c',
        `n=0; while kill -0 ${process.pid} 2>/dev/null && test "$n" -lt 1500; do sleep 1; n=$((n + 1)); done`,
      ],
      { stdio: 'ignore', detached: true },
    );
    let agentFailed = false;
    agent.on('error', () => {
      agentFailed = true;
    });
    agent.on('exit', () => {
      agentFailed = true;
    });
    for (let attempt = 0; ; attempt++) {
      signal.throwIfAborted();
      if (agentFailed || attempt > 100) throw new RuntimeUpdateError('ssh_agent');
      if (
        await stat(socket)
          .then((value) => value.isSocket())
          .catch(() => false)
      )
        break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    await processOutput('ssh-add', ['-t', '1800', '-'], privateKey, signal, { SSH_AUTH_SOCK: socket });
    return await processOutput(
      'ssh',
      [
        '-F',
        '/dev/null',
        '-i',
        publicKey,
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
        '-o',
        'ServerAliveInterval=15',
        '-o',
        'ServerAliveCountMax=3',
        `${MANAGEMENT_USERNAME}@${access.host}`,
        'true',
      ],
      header + '\n',
      signal,
      {},
      file,
    );
  } finally {
    const ownedAgent = agent;
    if (ownedAgent?.pid) {
      try {
        process.kill(-ownedAgent.pid, 'SIGKILL');
      } catch {
        /* already exited */
      }
      await new Promise<void>((resolve) => {
        if (ownedAgent.exitCode !== null || ownedAgent.signalCode !== null) resolve();
        else ownedAgent.once('close', () => resolve());
      });
    }
    await rm(directory, { recursive: true, force: true });
  }
}
