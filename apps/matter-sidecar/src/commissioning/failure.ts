import type { CommissioningFailure } from '@attraccess/matter-contract';
import { AlreadyCommissionedError } from './flow';

/** What the classifier needs to know about the attempt besides the error itself. */
export type FailureContext = {
  /** The session step when the error surfaced. */
  step: string | null;
  cancelRequested: boolean;
  deadlineExpired: boolean;
  /** The attestation callback rejected the device. */
  attestationFailed: boolean;
  attestationFindings: string[];
};

/** The errors an error is made of: its cause and, for an aggregate (matter.js discovery), every member. */
function parts(error: unknown): unknown[] {
  if (!(error instanceof Error)) return [];
  const members = (error as { errors?: unknown }).errors;
  return [error.cause, ...(Array.isArray(members) ? members : [])];
}

/** The class names of an error and everything it is made of. matter.js error classes are matched by name, not by import. */
export function errorNames(error: unknown): string[] {
  const names: string[] = [];
  const seen = new Set<unknown>();
  const visit = (current: unknown) => {
    if (!(current instanceof Error) || seen.has(current)) return;
    seen.add(current);
    for (let proto: object | null = current; proto && proto !== Error.prototype; proto = Object.getPrototypeOf(proto)) {
      names.push(proto.constructor.name);
    }
    parts(current).forEach(visit);
  };
  visit(error);
  return names;
}

const has = (names: string[], ...wanted: string[]) => wanted.some((name) => names.includes(name));

export function existingNodeIdOf(error: unknown): string | undefined {
  if (error instanceof AlreadyCommissionedError) return error.existingNodeId || undefined;
  for (const part of parts(error)) {
    const found = existingNodeIdOf(part);
    if (found) return found;
  }
  return undefined;
}

/** Maps whatever matter.js threw to one of the contract's failure codes. Never includes a message: errors may carry codes. */
export function classifyFailure(error: unknown, context: FailureContext): CommissioningFailure {
  const names = errorNames(error);
  if (has(names, 'AlreadyCommissionedError', 'DeviceAlreadyCommissionedToThisFabricError')) {
    const existing = existingNodeIdOf(error);
    return { code: 'already_commissioned', ...(existing ? { existingNodeId: existing } : {}) };
  }
  if (context.cancelRequested && has(names, 'CommissioningCancelledError', 'AbortedError', 'CanceledError')) {
    return { code: 'cancelled' };
  }
  if (context.attestationFailed || has(names, 'DeviceAttestationError')) {
    return { code: 'attestation_failed', attestationFindings: context.attestationFindings };
  }
  if (has(names, 'MaximumCommissionedFabricsReachedError')) return { code: 'fabric_full' };
  if (has(names, 'PasscodeMismatchError')) return { code: 'pase_failed' };
  if (context.deadlineExpired || has(names, 'CommissioningTimeoutError')) return { code: 'timeout' };
  if (has(names, 'AbortedError', 'CanceledError')) return { code: context.cancelRequested ? 'cancelled' : 'timeout' };
  if (context.step === null || context.step === 'discovering') {
    if (has(names, 'DiscoveryError', 'TimeoutError', 'PairRetransmissionLimitReachedError', 'NoResponseTimeoutError')) {
      return { code: 'device_not_found' };
    }
  }
  if (context.step === 'pase') return { code: 'pase_failed' };
  if (has(names, 'OperativeConnectionFailedError') || context.step === 'case') return { code: 'case_failed' };
  return { code: 'internal' };
}
