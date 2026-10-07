import { WagoFlowServiceCacheChannelsOperation } from './wago-flow.wago-flow-service-cache-channels-operation';


export abstract class WagoFlowServiceCacheKeyOperation extends WagoFlowServiceCacheChannelsOperation {
  protected cacheKey(controllerId: number, channelId: string, category: string): string {
    return `${controllerId}:${channelId}:${category}`;
  }
}
