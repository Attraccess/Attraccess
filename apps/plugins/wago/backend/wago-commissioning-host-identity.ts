import { ConflictException } from '@nestjs/common';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runProcess } from './wago-commissioning-process';

export async function scanHostKey(host: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'attraccess-cc100-'));
  const knownHosts = join(dir, 'known_hosts');
  try {
    await writeFile(knownHosts, await scanHostKeys(host), { mode: 0o600 });
    return await fingerprintFor(knownHosts);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
export function scanHostKeys(host: string): Promise<string> {
  return runProcess('ssh-keyscan', ['-T', '15', '-t', 'ed25519', host], undefined, undefined, {
    timeoutMs: 20_000,
    maxOutputBytes: 65_536,
  });
}
export async function pinnedHostKey(host: string, expectedFingerprint: string): Promise<string> {
  const key = (await scanHostKeys(host)).split('\n').find((line) => line.includes('ssh-ed25519'));
  if (!key) throw new ConflictException('the controller did not provide an Ed25519 SSH host key');
  const dir = await mkdtemp(join(tmpdir(), 'attraccess-cc100-'));
  const knownHosts = join(dir, 'known_hosts');
  try {
    await writeFile(knownHosts, `${key}\n`, { mode: 0o600 });
    if ((await fingerprintFor(knownHosts)) !== expectedFingerprint)
      throw new ConflictException('controller SSH host key changed after automatic identity verification');
    return `${key}\n`;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
export async function fingerprintFor(knownHosts: string): Promise<string> {
  const result = (
    await runProcess('ssh-keygen', ['-lf', knownHosts, '-E', 'sha256'], undefined, undefined, {
      timeoutMs: 5_000,
      maxOutputBytes: 1024,
    })
  ).match(/(SHA256:[A-Za-z0-9+/=]+)/)?.[1];
  if (!result) throw new ConflictException('the controller did not provide a supported SSH host key');
  return result;
}
