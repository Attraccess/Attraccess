import { PROTOCOL_VERSION } from './configuration.protocol-version';
import { validateSnapshot } from './configuration.validate-snapshot';
import { type ValidationError } from './runtime-types';

export function validateDesired(value: unknown): ValidationError[] {
  if (!value || typeof value !== 'object') {
    return [{ path: '$', code: 'invalid_snapshot', message: 'desired configuration must be an object' }];
  }
  const desired = value as Record<string, unknown>;
  const errors: ValidationError[] = [];
  if (desired.protocolVersion !== PROTOCOL_VERSION) {
    errors.push({ path: 'protocolVersion', code: 'unsupported_version', message: 'protocolVersion must be 1' });
  }
  if (!Number.isSafeInteger(desired.revision) || (desired.revision as number) < 1) {
    errors.push({ path: 'revision', code: 'invalid_revision', message: 'revision must be a positive integer' });
  }
  if (typeof desired.contentHash !== 'string') {
    errors.push({ path: 'contentHash', code: 'invalid_hash', message: 'contentHash is required' });
  }
  errors.push(...validateSnapshot(desired.snapshot));
  return errors;
}
