import type { WagoConfigurationSnapshot } from './configuration';
import { WagoFlowServiceCacheKeyOperation } from './wago-flow.wago-flow-service-cache-key-operation';


export abstract class WagoFlowServiceCategoriesOperation extends WagoFlowServiceCacheKeyOperation {
  protected categories(channel?: WagoConfigurationSnapshot['logicalChannels'][number]): string[] {
    return [
      ...(channel?.capabilities.some((capability) => capability === 'input' || capability === 'output')
        ? ['state']
        : []),
      ...(channel?.capabilities.includes('measurement') ? ['measurement'] : []),
      'fault',
    ];
  }
}
