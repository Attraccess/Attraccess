import { MAX_TIMEOUT_MS } from './wago-flow.state';
import { NodeKind } from './wago-flow.contracts';
import { WagoFlowServiceCachedOperation } from './wago-flow.wago-flow-service-cached-operation';


export abstract class WagoFlowServiceValidateConfigOperation extends WagoFlowServiceCachedOperation {
  async validateConfig(config: Record<string, unknown>, kind: NodeKind, context = new Map<string, unknown>()) {
    const schema = await this.resolveConfigSchema(config, kind, context);
    const properties = schema.properties as Record<string, { oneOf?: Array<{ const: unknown }> }>;
    const errors: Array<{ field: string; message: string }> = [];
    for (const [field, message] of [
      ['controllerId', 'Select a claimed WAGO controller.'],
      ['channelId', 'Select a channel from the applied controller configuration.'],
      ['category', 'Select a category supported by this channel.'],
    ]) {
      if (!properties[field]?.oneOf?.some((choice) => choice.const === config[field])) errors.push({ field, message });
    }
    const numericFields =
      kind === 'event' ? ['minimumIntervalMs', 'minimumChange'] : kind === 'wait' ? ['timeoutMs'] : [];
    for (const field of numericFields) {
      const value = config[field];
      if (
        value !== undefined &&
        (typeof value !== 'number' ||
          !Number.isFinite(value) ||
          value < (field === 'timeoutMs' ? 1 : 0) ||
          (field === 'timeoutMs' && value > MAX_TIMEOUT_MS))
      )
        errors.push({
          field,
          message: field === 'timeoutMs' ? 'Enter a valid positive timeout.' : 'Enter a non-negative number.',
        });
    }
    if (
      kind === 'wait' &&
      (config.category === 'measurement'
        ? typeof config.equals !== 'number' || !Number.isFinite(config.equals)
        : typeof config.equals !== 'boolean')
    )
      errors.push({ field: 'equals', message: 'Enter a matching value for the selected state category.' });
    return errors;
  }
}
