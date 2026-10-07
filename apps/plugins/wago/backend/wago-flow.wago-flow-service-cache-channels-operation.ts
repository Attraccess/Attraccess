import type { WagoConfigurationSnapshot } from './configuration';
import { WagoConfigurationRevision } from './wago-configuration-revision.entity';
import { WagoFlowServiceLoadLatestAppliedRevisionsOperation } from './wago-flow.wago-flow-service-load-latest-applied-revisions-operation';


export abstract class WagoFlowServiceCacheChannelsOperation extends WagoFlowServiceLoadLatestAppliedRevisionsOperation {
  protected cacheChannels(revision: WagoConfigurationRevision): WagoConfigurationSnapshot['logicalChannels'] {
    try {
      const channels = (JSON.parse(revision.snapshot) as WagoConfigurationSnapshot).logicalChannels;
      const previous = this.appliedConfigurations.get(revision.controllerId);
      if (previous?.revision !== revision.revision || previous?.contentHash !== revision.contentHash) {
        this.unavailableConfiguration.add(revision.controllerId);
        for (const state of this.cache.values())
          if (state.controllerId === revision.controllerId) state.invalidated = true;
      }
      this.appliedConfigurations.set(revision.controllerId, {
        revision: revision.revision,
        contentHash: revision.contentHash,
      });
      this.channelCache.set(revision.controllerId, channels);
      return channels;
    } catch {
      this.channelCache.set(revision.controllerId, []);
      return [];
    }
  }
}
