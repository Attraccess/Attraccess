import { DEFAULT_COMMAND_TIMEOUT_SECONDS } from './wago-command-handler.state';
import { MAX_COMMAND_TIMEOUT_SECONDS } from './wago-command-handler.state';
import { WagoCommandConfig } from './wago-command-handler.contracts';
import { positiveInteger } from './wago-command-handler.helpers';
import { WagoCommandHandlerReferencesOperation } from './wago-command-handler.wago-command-handler-references-operation';
export abstract class WagoCommandHandlerParseOperation extends WagoCommandHandlerReferencesOperation {
  protected parse(
    config: WagoCommandConfig,
    manual = false,
  ):
    | {
        value: {
          controllerId: number;
          channelId: string;
          action: 'set' | 'pulse' | 'release';
          value?: boolean;
          expectedConfigurationRevision: number;
          completionBehavior: 'dispatch' | 'acknowledged';
          acknowledgementTimeoutSeconds: number;
        };
      }
    | { errors: Array<{ field: string; message: string; value?: unknown }> } {
    const errors: Array<{ field: string; message: string; value?: unknown }> = [];
    const controllerId = positiveInteger(config.controllerId);
    const expectedConfigurationRevision = positiveInteger(config.expectedConfigurationRevision);
    const channelId = typeof config.channelId === 'string' && config.channelId.trim() ? config.channelId : undefined;
    const action =
      config.action === 'set' || config.action === 'pulse' || (manual && config.action === 'release')
        ? config.action
        : undefined;
    const completionBehavior = config.completionBehavior === 'dispatch' ? 'dispatch' : 'acknowledged';
    const parsedTimeout = positiveInteger(config.acknowledgementTimeoutSeconds);
    const acknowledgementTimeoutSeconds = parsedTimeout ?? DEFAULT_COMMAND_TIMEOUT_SECONDS;
    if (!controllerId)
      errors.push({ field: 'controllerId', message: 'A WAGO controller is required.', value: config.controllerId });
    if (!channelId)
      errors.push({ field: 'channelId', message: 'A Logical Channel is required.', value: config.channelId });
    if (!action) errors.push({ field: 'action', message: 'A supported operation is required.', value: config.action });
    if (action === 'set' && typeof config.value !== 'boolean')
      errors.push({ field: 'value', message: 'Set state requires a boolean value.', value: config.value });
    if (!expectedConfigurationRevision)
      errors.push({
        field: 'expectedConfigurationRevision',
        message: 'A configuration revision is required.',
        value: config.expectedConfigurationRevision,
      });
    if (
      config.completionBehavior !== undefined &&
      config.completionBehavior !== 'dispatch' &&
      config.completionBehavior !== 'acknowledged'
    )
      errors.push({
        field: 'completionBehavior',
        message: 'Completion must be publish only or wait for acknowledgement.',
        value: config.completionBehavior,
      });
    if (!positiveInteger(config.acknowledgementTimeoutSeconds) && config.acknowledgementTimeoutSeconds !== undefined)
      errors.push({
        field: 'acknowledgementTimeoutSeconds',
        message: 'Acknowledgement timeout must be a positive number of seconds.',
        value: config.acknowledgementTimeoutSeconds,
      });
    if (parsedTimeout !== undefined && parsedTimeout > MAX_COMMAND_TIMEOUT_SECONDS)
      errors.push({
        field: 'acknowledgementTimeoutSeconds',
        message: `Acknowledgement timeout must not exceed ${MAX_COMMAND_TIMEOUT_SECONDS} seconds.`,
        value: config.acknowledgementTimeoutSeconds,
      });
    if (
      config.failureBehavior !== undefined &&
      !['fail-flow', 'failure-output', 'log-and-continue'].includes(config.failureBehavior as string)
    )
      errors.push({
        field: 'failureBehavior',
        message: 'Select a supported failure policy.',
        value: config.failureBehavior,
      });
    if (errors.length) return { errors };
    return {
      value: {
        controllerId: controllerId as number,
        channelId: channelId as string,
        action: action as 'set' | 'pulse',
        ...(action === 'set' ? { value: config.value as boolean } : {}),
        expectedConfigurationRevision: expectedConfigurationRevision as number,
        completionBehavior,
        acknowledgementTimeoutSeconds,
      },
    };
  }
}
