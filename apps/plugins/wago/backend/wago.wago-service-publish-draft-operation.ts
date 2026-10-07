import { WagoConfigurationRevision } from './wago-configuration-revision.entity';
import type { PluginAuditPrincipal } from '@attraccess/plugins-backend-sdk';
import { WagoServiceReviewDraftOperation } from './wago.wago-service-review-draft-operation';


export abstract class WagoServicePublishDraftOperation extends WagoServiceReviewDraftOperation {
  async publishDraft(
    controllerId: number,
    force = false,
    reviewedHash?: string,
    principal?: PluginAuditPrincipal,
  ): Promise<WagoConfigurationRevision> {
    return this.withConfigurationLock(controllerId, () =>
      this.publishDraftWhileLocked(controllerId, force, reviewedHash, principal),
    );
  }
}
