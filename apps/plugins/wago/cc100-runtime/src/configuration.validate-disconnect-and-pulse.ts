import { pulseBehaviorError } from '../../channel-behavior';
import { validateKeys } from './configuration.validate-keys';
import { type Snapshot, type ValidationError } from './runtime-types';

export function validateDisconnectAndPulse(
  channel: Snapshot['logicalChannels'][number],
  capabilities: Snapshot['logicalChannels'][number]['capabilities'],
  path: string,
  errors: ValidationError[],
): void {
  const policy = channel?.disconnectPolicy;
  if (
    !policy ||
    !['hold', 'immediate', 'watchdog'].includes(policy.mode) ||
    (policy.mode === 'watchdog' && (!Number.isSafeInteger(policy.timeoutMs) || (policy.timeoutMs ?? 0) <= 0))
  ) {
    errors.push({
      path: `${path}.disconnectPolicy`,
      code: 'invalid_disconnect_policy',
      message: 'every channel needs hold, immediate, or watchdog disconnect behavior',
    });
  }
  const pulseError = pulseBehaviorError(capabilities, channel.pulse);
  if (pulseError) errors.push({ path: `${path}.pulse`, code: 'invalid_pulse', message: pulseError });
  if (channel.pulse) {
    validateKeys(channel.pulse as Record<string, unknown>, `${path}.pulse`, ['durationMs'], errors);
  }
}
