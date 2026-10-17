export const commissioningCheckpoints = {
  'preparation-lock': [
    20,
    'Waiting for controller access',
    'Waiting for the runtime safety check to release the controller lock. This is bounded to 310 seconds.',
  ],
  'preparation-inspect': [
    22,
    'Checking controller hardware',
    'Checking firmware, Docker and exclusive access to the controller inputs and outputs. This can take several minutes.',
  ],
  'preparation-codesys': [
    26,
    'Disabling CODESYS',
    'Stopping CODESYS and verifying that it remains disabled after reboot.',
  ],
  'preparation-docker': [
    29,
    'Activating controller Docker',
    'Checking and activating the firmware-installed Docker service.',
  ],
  'preparation-io': [
    33,
    'Verifying exclusive output access',
    'Checking that no other process or container can write the controller outputs. This can take several minutes.',
  ],
  'preparation-permissions': [
    36,
    'Checking runtime IO permissions',
    'Applying narrow IO permissions and verifying access as the runtime account.',
  ],
  'preparation-final': [
    38,
    'Verifying controller preparation',
    'Running the final hardware and runtime prerequisites before publishing the boot hook.',
  ],
  'preparation-ready': [
    39,
    'Controller preparation complete',
    'The controller is prepared. Checking clock and enrollment prerequisites next.',
  ],
} as const;

export type CommissioningCheckpoint = keyof typeof commissioningCheckpoints;

export function commissioningCheckpoint(line: string): CommissioningCheckpoint | null {
  const value = /^WAGO_PROGRESS=([a-z-]+)$/.exec(line)?.[1];
  return value && Object.hasOwn(commissioningCheckpoints, value) ? (value as CommissioningCheckpoint) : null;
}

/** Accept fixed checkpoint IDs only, including when SSH splits a line between chunks. */
export class CommissioningProgressReader {
  private line = '';
  private overflow = false;
  constructor(private readonly report: (checkpoint: CommissioningCheckpoint) => void) {}
  write(chunk: string) {
    for (const character of chunk) {
      if (character === '\n') {
        const checkpoint = !this.overflow && commissioningCheckpoint(this.line);
        if (checkpoint) this.report(checkpoint);
        this.line = '';
        this.overflow = false;
      } else if (this.line.length < 128 && !this.overflow) this.line += character;
      else this.overflow = true;
    }
  }
}

export class WagoCommissioningTimeoutError extends Error {
  constructor() {
    super(
      'Controller operation timed out. Check SSH connectivity and controller load. Clean up any retained installation before retrying.',
    );
  }
}

/** Leave time to persist failure and revoke enrollment credentials while the lease is owned. */
export function commissioningCommandTimeout(requestedMs: number, deadline?: number, now = Date.now()): number {
  const remaining = deadline === undefined ? requestedMs : deadline - now - 60_000;
  if (remaining <= 0) throw new WagoCommissioningTimeoutError();
  return Math.min(requestedMs, remaining);
}
