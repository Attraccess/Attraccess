const reasons = {
  busy: 'The runtime monitor or another operation did not release the controller lock within 310 seconds. Wait a few minutes and retry cleanup. Do not delete the lock file.',
  authentication:
    'SSH rejected the cleanup login. Use Other SSH login with a working root or sudo account, then retry cleanup.',
  identity: 'The SSH host key changed. Check the controller IP and saved SSH fingerprint before retrying cleanup.',
  ownership:
    'The retained installation belongs to another session or its ownership metadata is missing. Keep the journal and verify the commissioning session before retrying cleanup.',
  filesystem:
    'The retained installation has unsafe file ownership, permissions or conflicting journals. Keep the journals and inspect the controller paths before retrying cleanup.',
  runtime:
    'The controller could not confirm that the failed runtime was stopped and removed. Check the local Docker daemon, then retry cleanup. The recovery journal is retained.',
  timeout:
    'The cleanup SSH command exceeded its deadline. Check controller connectivity and load, then retry cleanup. The recovery journal is retained.',
  transport:
    'The cleanup SSH command failed without a recognized controller diagnostic. Check SSH connectivity and the local Docker daemon, then retry cleanup. The recovery journal is retained.',
} as const;

export class WagoRecoveryError extends Error {
  constructor(readonly stage: keyof typeof reasons) {
    super(`Installation cleanup failed (${stage}). ${reasons[stage]}`);
  }
}

/** Only known diagnostics may cross the credential-bearing subprocess boundary. */
export function recoveryError(stderr: string): WagoRecoveryError {
  const lines = stderr.split('\n');
  if (lines.includes('Another runtime transaction holds the controller lock')) return new WagoRecoveryError('busy');
  if (lines.some((line) => /Permission denied \(.*\)\.$/.test(line))) return new WagoRecoveryError('authentication');
  if (stderr.includes('REMOTE HOST IDENTIFICATION HAS CHANGED')) return new WagoRecoveryError('identity');
  if (
    lines.some((line) =>
      [
        'Runtime transaction belongs to another commissioning session',
        'Runtime transaction has no ownership token',
        'No preparation recovery ownership',
        'No runtime transaction to recover',
      ].includes(line),
    )
  )
    return new WagoRecoveryError('ownership');
  if (
    lines.some((line) =>
      [
        'Unsafe runtime journal ownership, permissions or file type',
        'Conflicting runtime journals require manual inspection',
        'Unsafe controller lock ownership, permissions or file type',
        'Unsafe runtime configuration ownership or permissions',
      ].includes(line),
    )
  )
    return new WagoRecoveryError('filesystem');
  if (lines.includes('Recovery incomplete; journal retained for another recovery attempt'))
    return new WagoRecoveryError('runtime');
  return new WagoRecoveryError('transport');
}
