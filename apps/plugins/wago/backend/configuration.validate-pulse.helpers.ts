import { pulseBehaviorError } from '../channel-behavior';
import type { ConfigurationValidationError } from './configuration.contracts';
import { record } from './configuration.preset-channel.helpers';
import { exactKeys } from './configuration.add-id.helpers';

export function validatePulse(
  value: unknown,
  path: string,
  capabilities: Set<string>,
  errors: ConfigurationValidationError[],
): void {
  const message = pulseBehaviorError([...capabilities], value);
  if (message) errors.push({ path, code: 'invalid_pulse', message });
  if (value === undefined) return;
  if (!record(value, path, errors)) return;
  exactKeys(value, path, ['durationMs'], errors);
}

export function validateRange(
  value: unknown,
  path: string,
  capabilities: Set<string>,
  errors: ConfigurationValidationError[],
): void {
  if (value === undefined) return;
  if (!record(value, path, errors)) return;
  exactKeys(value, path, ['minimum', 'maximum'], errors);
  if (
    !Number.isFinite(value.minimum) ||
    !Number.isFinite(value.maximum) ||
    (value.minimum as number) >= (value.maximum as number)
  )
    errors.push({
      path,
      code: 'invalid_range',
      message: 'minimum and maximum must be finite numbers where minimum is less than maximum',
    });
  if (!capabilities.has('input') && !capabilities.has('measurement'))
    errors.push({ path, code: 'unsupported_field', message: 'range requires input or measurement capability' });
}
