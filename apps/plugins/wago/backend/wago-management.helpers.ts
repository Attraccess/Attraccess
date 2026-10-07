import type { ManagementInspection } from './wago-management.types';
import { ManagementError } from './wago-management.management-error';
import type { ManagementPublicStatus } from './wago-management.types';
import type { ManagementRecord } from './wago-management.types';
import { transitionStates } from './wago-management.state';
import { exceptionNames } from './wago-management.state';
import type { SessionCredential } from './wago-management.types';
import type { ManagementTarget } from './wago-management.types';

export function pick<T extends string>(value: T, options: readonly T[]): T {
  if (!options.includes(value)) throw new ManagementError('operation_failed');
  return value;
}

export /** Structural allowlist: discard even unexpected extra adapter properties rather than spreading them. */
function cleanInspection(value: ManagementInspection): ManagementInspection {
  if (value.uid !== null && (!Number.isSafeInteger(value.uid) || value.uid < 0 || value.uid > 4294967294))
    throw new ManagementError('operation_failed');
  return {
    model: pick(value.model, ['cc100', 'unknown']),
    firmware: pick(value.firmware, ['31', 'unsupported', 'unknown']),
    ssh: pick(value.ssh, ['openssh', 'dropbear', 'mixed', 'unknown']),
    dropbearVersion: pick(value.dropbearVersion ?? 'unknown', ['2025.88', 'unknown']),
    serviceControl: pick(value.serviceControl, ['systemd', 'sysv', 'unknown']),
    uid: value.uid,
    wbm: pick(value.wbm, ['listening', 'not_observed', 'unknown']),
    otherManagement: pick(value.otherManagement, ['listening', 'not_observed', 'unknown']),
    networkScope: 'local_socket_observation',
    passwordAccess: 'unknown',
    defaultAccess: 'unknown',
  };
}

export function exactKeys(input: object, keys: string[]): void {
  if (
    !input ||
    typeof input !== 'object' ||
    Object.keys(input).length !== keys.length ||
    Object.keys(input).some((key) => !keys.includes(key))
  )
    throw new ManagementError('invalid_request');
}

export function publicStatus(record: ManagementRecord): ManagementPublicStatus {
  return {
    controllerId: record.target.controllerId,
    state: pick(record.state, [...transitionStates, 'inspected', 'reviewed', 'key_enrolled', 'hardened', 'recovered']),
    support: pick(record.support, ['supported', 'UNSUPPORTED', 'qualification_required']),
    inspection: record.inspection ? cleanInspection(record.inspection) : null,
    mode: record.mode === null ? null : pick(record.mode, ['baseline', 'key_only']),
    exceptions: record.exceptions.filter((value) => exceptionNames.includes(value)).slice(0, 3),
    keyFingerprint:
      record.keyFingerprint && /^SHA256:[A-Za-z0-9+/]{43}$/.test(record.keyFingerprint) ? record.keyFingerprint : null,
    reviewToken: record.reviewToken && /^[a-f0-9]{32}$/.test(record.reviewToken) ? record.reviewToken : null,
    failure:
      record.failure === null
        ? null
        : pick(record.failure, ['inspection_failed', 'transition_failed', 'rollback_failed']),
    recoveryRequired: transitionStates.includes(record.state),
    hardened: record.state === 'hardened' && record.support === 'supported' && record.exceptions.length === 0,
  };
}

export function validId(id: number): void {
  if (!Number.isSafeInteger(id) || id <= 0) throw new ManagementError('invalid_request');
}

export function validateCredential(credential: SessionCredential): void {
  if (
    !credential ||
    typeof credential.username !== 'string' ||
    !/^[a-z_][a-z0-9_-]{0,31}$/.test(credential.username) ||
    typeof credential.password !== 'string' ||
    credential.password.length < 1 ||
    credential.password.length > 4096 ||
    /[\0\r\n]/.test(credential.password)
  )
    throw new ManagementError('credentials_required');
  exactKeys(credential, ['username', 'password']);
}

export function validateTarget(target: ManagementTarget): void {
  validId(target.controllerId);
  const octets = typeof target.host === 'string' && target.host.split('.');
  if (
    !octets ||
    octets.length !== 4 ||
    octets.some((value) => !/^(0|[1-9]\d{0,2})$/.test(value) || Number(value) > 255)
  )
    throw new ManagementError('invalid_request');
  const [a, b] = octets.map(Number);
  if (
    !(a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) ||
    !/^SHA256:[A-Za-z0-9+/]{43}$/.test(target.hostKeyFingerprint)
  )
    throw new ManagementError('invalid_request');
}
