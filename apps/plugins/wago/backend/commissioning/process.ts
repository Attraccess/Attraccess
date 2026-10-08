import { spawn } from 'node:child_process';
import { commissioningCheckpoint, CommissioningProgressReader, WagoCommissioningTimeoutError } from './progress';
import { WagoControllerLockError, WagoStorageCapacityError } from './model';
import { SshRunLimits } from './model';
import { SSH_TIMEOUT_MS } from './model';
import { managedProvisioningError } from '../runtime/managed/provisioning-error';
import { ManagementPeerVersion } from '../management/peer-version';
import { recoveryError, WagoRecoveryError } from '../runtime/recovery-error';
export function runProcess(
  command: string,
  args: string[],
  input?: string | Buffer,
  environment?: Record<string, string>,
  limits: SshRunLimits & { signal?: AbortSignal; peerVersion?: ManagementPeerVersion } = {
    timeoutMs: SSH_TIMEOUT_MS,
    maxOutputBytes: 65_536,
  },
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env: { ...process.env, ...environment }, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    const progressReader = limits.onProgress ? new CommissioningProgressReader(limits.onProgress) : undefined;
    let diagnosticStderr = '';
    let stopped = false;
    const stop = (error: Error = new Error('Commissioning subprocess failed.')) => {
      if (stopped) return;
      stopped = true;
      child.kill();
      setTimeout(() => {
        if (child.exitCode === null) child.kill('SIGKILL');
      }, 1000).unref();
      clearTimeout(timer);
      limits.signal?.removeEventListener('abort', abort);
      reject(error);
    };
    const abort = () => stop();
    const timer = setTimeout(
      () => stop(limits.recoveryDiagnostic ? new WagoRecoveryError('timeout') : new WagoCommissioningTimeoutError()),
      limits.timeoutMs,
    );
    limits.signal?.addEventListener('abort', abort, { once: true });
    if (limits.signal?.aborted) abort();
    // A constrained controller may reject stdin before SSH exits; handle it without exposing process output.
    child.stdin.on('error', () => undefined);
    child.stdout.on('data', (chunk) => {
      if (stopped) return;
      progressReader?.write(chunk.toString('utf8'));
      if (Buffer.byteLength(stdout) + chunk.length > limits.maxOutputBytes) {
        clearTimeout(timer);
        stop();
      } else stdout += chunk;
    });
    child.stderr.on('data', (chunk: Buffer) => {
      limits.peerVersion?.write(chunk);
      if (limits.storageDiagnostic || limits.lockDiagnostic || limits.recoveryDiagnostic)
        diagnosticStderr = (diagnosticStderr + chunk.toString('utf8')).slice(-4096);
    });
    child.on('error', () => {
      clearTimeout(timer);
      limits.signal?.removeEventListener('abort', abort);
      reject(
        limits.recoveryDiagnostic ? new WagoRecoveryError('transport') : new Error('Commissioning subprocess failed.'),
      );
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      limits.signal?.removeEventListener('abort', abort);
      if (stopped) return;
      if (code === 0)
        resolve(
          progressReader
            ? stdout
                .split('\n')
                .filter((line) => !commissioningCheckpoint(line))
                .join('\n')
            : stdout,
        );
      else if (limits.recoveryDiagnostic) reject(recoveryError(diagnosticStderr));
      else if (limits.managementDiagnostic && managedProvisioningError(stdout))
        reject(managedProvisioningError(stdout));
      else if (limits.storageDiagnostic && diagnosticStderr.includes('Insufficient runtime storage:'))
        reject(new WagoStorageCapacityError());
      else if (
        limits.lockDiagnostic &&
        diagnosticStderr.split('\n').includes('Another runtime transaction holds the controller lock')
      )
        reject(new WagoControllerLockError());
      else reject(new Error('Commissioning subprocess failed.'));
    });
    child.stdin.end(input);
  });
}
