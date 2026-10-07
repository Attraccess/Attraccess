import type { WagoConfigurationSnapshot } from './configuration';
import { WagoFlowServiceCategoriesOperation } from './wago-flow.wago-flow-service-categories-operation';


export abstract class WagoFlowServiceReadCategoriesOperation extends WagoFlowServiceCategoriesOperation {
  protected readCategories(channel?: WagoConfigurationSnapshot['logicalChannels'][number]): string[] {
    return [
      ...(channel?.capabilities.some((capability) => capability === 'input' || capability === 'output')
        ? ['state']
        : []),
      ...(channel?.capabilities.includes('measurement') ? ['measurement'] : []),
    ];
  }
}
