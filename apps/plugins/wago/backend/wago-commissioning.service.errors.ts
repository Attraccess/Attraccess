import { ConflictException } from '@nestjs/common';
export class WagoStorageCapacityError extends Error {
  constructor() {
    super('Not enough free storage on the CC100 for this runtime. Free space and retry.');
  }
}

export class WagoControllerLockError extends Error {
  constructor() {
    super('The CC100 is busy with a runtime operation. Retry installation shortly; no preparation was started.');
  }
}

export class RuntimeReleaseChangedError extends ConflictException {
  constructor() {
    super(
      'The runtime release changed during delivery. Recover any retained installation and retry with the current release.',
    );
  }
}

export class WagoRuntimeUploadError extends Error {
  constructor(
    code: number | null,
    elapsedMs: number,
    stderr: string,
    termination: 'remote-exit' | 'local-timeout' | 'operation-aborted' = 'remote-exit',
  ) {
    const known = [
      'Runtime image load failed or exceeded 300 seconds',
      'Runtime supervisor launch unverified: prerequisites',
      'Runtime supervisor launch unverified: readiness',
      'Runtime supervisor launch unverified: owner-verification',
      'Runtime supervisor handoff lock unverified; recovery required',
      'Runtime supervisor launch unverified',
      'Cleanup incomplete; recovery journal retained',
    ];
    const lines = stderr.slice(-4096).split('\n');
    const reason = known.find((line) => lines.includes(line)) ?? 'No recognized remote diagnostic';
    super(
      `Runtime delivery failed: ${termination}, SSH exit ${code ?? 'unknown'}, ${Math.round(elapsedMs / 1000)}s elapsed. ${reason}. Use reviewed recovery before retrying.`,
    );
  }
}
