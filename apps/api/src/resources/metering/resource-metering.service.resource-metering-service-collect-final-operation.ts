import { ResourceMeteringSessionStatus } from '@attraccess/database-entities';
import { type FinalCollection, type MeterFinal } from './metering-settlement';
import { ResourceMeteringServiceInitializeOperation } from './resource-metering.service.resource-metering-service-initialize-operation';
export abstract class ResourceMeteringServiceCollectFinalOperation extends ResourceMeteringServiceInitializeOperation {
  /** Never throws: a missing final total must not prevent the usage from ending. */
  async collectFinal(usageId: number, freshAfter: Date): Promise<FinalCollection> {
    const sessions = await this.sessions.find({ where: { usageId, status: ResourceMeteringSessionStatus.Active } });
    if (!sessions.length) return { status: 'not-metered' };
    const meters: Record<string, MeterFinal> = {};
    for (const session of sessions) {
      try {
        meters[session.id] = await this.collectSessionFinal(session, freshAfter);
      } catch (error) {
        meters[session.id] = { status: 'unavailable', reason: this.reason(error) };
      }
    }
    return { status: 'collected', meters };
  }
}
