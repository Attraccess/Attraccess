import { ConflictException } from '@nestjs/common';
import { type Cc100HardwareProfile } from '../../shared/hardware-profile';
import { type CommissioningCheckpoint } from './delivery/progress';
import { WagoCommissioningSession } from './sessions/session.entity';
import { isCc100Fw31Identity } from '../host/firmware-identity';

export type RuntimeDeliveryBundle = {
  directory: string;
  path: string;
  bytes: number;
  digest: string;
  image: string;
  imageId?: string;
  hardwareProfile?: Cc100HardwareProfile;
};

export type CommissioningSessionResponse = Omit<
  WagoCommissioningSession,
  'pairingCode' | 'deliveryToken' | 'initiatingPrincipal' | 'dockerProvisionToken'
> & { runtimeRecoveryAvailable?: boolean; managedAccessAvailable?: boolean; operationDeadlineAt?: string | null };

export type TemporarySshCredential = { username: string; password: string };

export type DeliveryInput = { temporarySsh?: TemporarySshCredential; confirmInstall?: boolean };

export function requireDeliveryCredentials(input: DeliveryInput): TemporarySshCredential {
  if (input?.confirmInstall !== true)
    throw new ConflictException('explicit installation confirmation is required for every delivery attempt');
  const credential = input.temporarySsh;
  if (
    !credential ||
    typeof credential.username !== 'string' ||
    !/^[a-zA-Z_][a-zA-Z0-9_.-]{0,63}$/.test(credential.username) ||
    typeof credential.password !== 'string' ||
    !credential.password.trim() ||
    /[\r\n\0]/.test(credential.password)
  )
    throw new ConflictException('explicit valid SSH username and password are required for every delivery attempt');
  return credential;
}

export type SshRunLimits = {
  timeoutMs: number;
  maxOutputBytes: number;
  storageDiagnostic?: boolean;
  lockDiagnostic?: boolean;
  managementDiagnostic?: boolean;
  recoveryDiagnostic?: boolean;
  onProgress?: (checkpoint: CommissioningCheckpoint) => void;
};

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

export const VERIFIER_PREFIX = 'encrypted:v1:';

export // The initial supported CC100 commissioning baseline. Operators may pin a more
// specific vendor firmware identifier through configuration as it becomes available.
const configuredFirmwareBaseline = process.env.WAGO_CC100_FIRMWARE_BASELINE?.trim() || '31';

export const BOOTSTRAP_SSH_OPTIONS = [
  '-F',
  '/dev/null',
  '-o',
  'IdentityAgent=none',
  '-o',
  'PubkeyAuthentication=no',
  '-o',
  'PreferredAuthentications=password',
  '-o',
  'KbdInteractiveAuthentication=no',
  '-o',
  'ControlPath=none',
  '-o',
  'GlobalKnownHostsFile=/dev/null',
];

export function isPrivateAddress(host: string): boolean {
  const match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) return false;
  const octets = match.slice(1).map(Number);
  if (octets.some((octet) => octet > 255)) return false;
  return (
    octets[0] === 10 ||
    (octets[0] === 192 && octets[1] === 168) ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31)
  );
}

export const SSH_TIMEOUT_MS = 30 * 60_000;

export function isSupportedController(inspection: string, firmwareBaseline: string): boolean {
  return firmwareBaseline.trim() === '31' && isCc100Fw31Identity(inspection);
}

export function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}
