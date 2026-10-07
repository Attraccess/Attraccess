import { WagoConfigurationRevision } from './wago-configuration-revision.entity';
import type { WagoAuditLifecycle } from './wago-audit';
import { WagoServicePublishDraftWhileLockedOperation } from './wago.wago-service-publish-draft-while-locked-operation';


export abstract class WagoServiceAuditRevisionOperation extends WagoServicePublishDraftWhileLockedOperation {
  protected async auditRevision(
    lifecycle: WagoAuditLifecycle | undefined,
    operation: () => Promise<WagoConfigurationRevision>,
    allocated: () => number | undefined,
  ): Promise<WagoConfigurationRevision> {
    await lifecycle?.attempt();
    try {
      const result = await operation();
      await lifecycle?.finish('succeeded', { revision: result.revision });
      return result;
    } catch (error) {
      await lifecycle?.finish('failed', { revision: allocated() });
      throw error;
    }
  }
}
