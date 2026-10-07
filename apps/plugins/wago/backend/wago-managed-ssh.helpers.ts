import type { RuntimeUpdateFailure } from './wago-runtime-update';
import type { RuntimeStorageDiagnostic } from './wago-runtime-update';
import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import { RuntimeUpdateError } from './wago-runtime-update';

/** Only fixed classifications and validated capacity figures leave the transport.
 * Raw stderr is bounded, inspected in memory, and never returned or logged.
 */
export function managedSshFailure(stderr: string, fallback: RuntimeUpdateFailure): RuntimeUpdateFailure {
  if (/REMOTE HOST IDENTIFICATION HAS CHANGED|Host key verification failed/.test(stderr)) return 'host_identity';
  if (/Permission denied \(publickey\)|Authentication failed/.test(stderr)) return 'authentication';
  if (/Could not open a connection to your authentication agent|Error connecting to agent/.test(stderr))
    return 'ssh_agent';
  if (/flock: (?:invalid|unrecognized) option.*['"]w['"]/.test(stderr)) return 'lock_tools';
  if (/codesys-active/.test(stderr)) return 'codesys_active';
  if (/codesys-boot-enabled/.test(stderr)) return 'codesys_boot_enabled';
  if (/runtime-identity-conflict|output-host-process-conflict/.test(stderr)) return 'writer_conflict';
  if (/io-ownership|io-permission|missing-register|serial device/.test(stderr)) return 'io_unavailable';
  if (/Insufficient .*storage|Invalid .*storage capacity|Insufficient checkpoint/.test(stderr)) return 'storage';
  if (/Incomplete or oversized runtime transfer/.test(stderr)) return 'transfer_size';
  if (/Runtime checksum mismatch/.test(stderr)) return 'transfer_checksum';
  if (/Runtime transfer receiver timed out/.test(stderr)) return 'transfer_timeout';
  if (/Runtime transfer receiver failed|head:.*(?:invalid|unrecognized) option/.test(stderr)) return 'receiver_tools';
  if (/Incompatible runtime platform|Unsupported.*firmware|Unsupported.*model/.test(stderr)) return 'incompatible';
  if (
    /Runtime load failed|Loaded image identity mismatch|Expected one runtime image|Runtime reference mismatch/.test(
      stderr,
    )
  )
    return 'load';
  if (
    /codesys-(active|boot-enabled)|Cannot verify CODESYS|io-ownership|io-permission|missing-register|Unsafe |hardware|host-io|serial device|output.writer/.test(
      stderr,
    )
  )
    return 'host_gate';
  return fallback;
}

/** Extract only our numeric capacity protocol. Surrounding stderr may hold secrets. */
export function managedSshStorageDiagnostics(stderr: string): RuntimeStorageDiagnostic[] {
  const diagnostics: RuntimeStorageDiagnostic[] = [];
  for (const line of stderr.split('\n')) {
    const match =
      /^Insufficient runtime storage: (\/[A-Za-z0-9_./-]{1,255}) requires ([0-9]{1,12}) KiB, available ([0-9]{1,12}) KiB$/.exec(
        line,
      );
    if (!match || match[1].split('/').includes('..')) continue;
    const requiredKiB = Number(match[2]),
      availableKiB = Number(match[3]);
    if (requiredKiB <= availableKiB) continue;
    diagnostics.push({ path: match[1], requiredKiB, availableKiB });
    if (diagnostics.length === 4) break;
  }
  return diagnostics;
}

export /** Bounded process transport; never include subprocess output in errors/logs. */
async function processOutput(
  command: string,
  args: string[],
  input: string,
  signal: AbortSignal,
  environment = {},
  file?: string | Buffer,
): Promise<string> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: { ...process.env, ...environment },
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: true,
    });
    const chunks: Buffer[] = [];
    const errors: Buffer[] = [];
    let errorBytes = 0;
    let bytes = 0;
    let failed = false;
    const stop = () => {
      failed = true;
      try {
        if (child.pid) process.kill(-child.pid, 'SIGKILL');
      } catch {
        /* already exited */
      }
    };
    const timer = setTimeout(stop, 25 * 60_000).unref();
    signal.addEventListener('abort', stop, { once: true });
    child.stdout.on('data', (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > 65_536) stop();
      else chunks.push(chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      errorBytes += chunk.length;
      if (errorBytes > 16_384) stop();
      else errors.push(chunk);
    });
    child.stdin.on('error', () => stop());
    let stream: Readable | undefined;
    child.stdin.write(input, () => {
      if (file && !failed) {
        stream = typeof file === 'string' ? createReadStream(file) : Readable.from([file]);
        stream.on('error', stop);
        stream.pipe(child.stdin);
      } else child.stdin.end();
    });
    const done = (code: number | null) => {
      clearTimeout(timer);
      signal.removeEventListener('abort', stop);
      stream?.destroy();
      if (failed || code !== 0)
        reject(
          new RuntimeUpdateError(
            managedSshFailure(Buffer.concat(errors).toString('utf8'), file ? 'transfer' : 'offline'),
            managedSshStorageDiagnostics(Buffer.concat(errors).toString('utf8')),
          ),
        );
      else resolve(Buffer.concat(chunks).toString('utf8'));
    };
    child.once('error', () => done(null));
    child.once('close', done);
  });
}
