import { ResourceMeteringSession } from '@attraccess/database-entities';
import { ResourceMeteringServiceRetrySettlementOperation } from './resource-metering.service.resource-metering-service-retry-settlement-operation';
export abstract class ResourceMeteringServiceWaiveOperation extends ResourceMeteringServiceRetrySettlementOperation {
  waive(resourceId: number, sessionId: string, initiatorId: number): Promise<ResourceMeteringSession> {
    return this.settlement.waive(resourceId, sessionId, initiatorId);
  }
}
