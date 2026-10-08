import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { WagoRuntimeUploadError } from './model';
import { SSH_TIMEOUT_MS } from './model';
export async function uploadFile(
  source: string,
  args: string[],
  environment: Record<string, string>,
  onProgress: (percent: number) => void,
  prefix?: string,
  signal?: AbortSignal,
  timeoutMs = SSH_TIMEOUT_MS,
): Promise<void> {
  const size = (await stat(source)).size;
  return new Promise((resolve, reject) => {
    const child = spawn('ssh', args, { env: { ...process.env, ...environment }, stdio: ['pipe', 'ignore', 'pipe'] });
    const stream = createReadStream(source);
    let transferred = 0;
    let lastPercent = -1;
    let settled = false;
    const started = Date.now();
    let stderr = '';
    let termination: 'remote-exit' | 'local-timeout' | 'operation-aborted' = 'remote-exit';
    const timer = setTimeout(() => {
      termination = 'local-timeout';
      child.kill();
      setTimeout(() => {
        if (child.exitCode === null) child.kill('SIGKILL');
      }, 1000).unref();
      finish(new WagoRuntimeUploadError(null, Date.now() - started, stderr, termination));
    }, timeoutMs);
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      stream.destroy();
      if (error)
        reject(
          error instanceof WagoRuntimeUploadError
            ? error
            : new WagoRuntimeUploadError(null, Date.now() - started, stderr, termination),
        );
      else resolve();
    };
    const abort = () => {
      termination = 'operation-aborted';
      child.kill();
      finish(new Error('Commissioning upload interrupted.'));
    };
    child.stdin.on('error', () => undefined);
    child.stderr.on('data', (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-4096);
    });
    child.on('error', finish);
    child.on('close', (code) =>
      finish(code === 0 ? undefined : new WagoRuntimeUploadError(code, Date.now() - started, stderr, termination)),
    );
    stream.on('error', (error) => {
      child.kill();
      finish(error);
    });
    stream.on('data', (chunk: Buffer) => {
      if (settled) return;
      transferred += chunk.length;
      const percent = size ? Math.floor((transferred * 100) / size) : 100;
      if (percent === 100 || percent - lastPercent >= 5) {
        lastPercent = percent;
        onProgress(percent);
      }
    });
    onProgress(0);
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) {
      abort();
      return;
    }
    if (prefix) child.stdin.write(prefix);
    stream.pipe(child.stdin);
  });
}
