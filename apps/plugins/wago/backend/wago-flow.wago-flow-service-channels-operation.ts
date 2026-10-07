import type { WagoConfigurationSnapshot } from './configuration';
import { WagoFlowServiceStoreOperation } from './wago-flow.wago-flow-service-store-operation';


export abstract class WagoFlowServiceChannelsOperation extends WagoFlowServiceStoreOperation {
  protected async channels(controllerId: number): Promise<WagoConfigurationSnapshot['logicalChannels']> {
    const cached = this.channelCache.get(controllerId);
    if (cached) return cached;
    const [revision] = await this.revisions.find({
      where: { controllerId, state: 'applied' },
      order: { revision: 'DESC' },
      take: 1,
    });
    if (!revision) {
      this.channelCache.set(controllerId, []);
      return [];
    }
    return this.cacheChannels(revision);
  }
}
