import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  ResourceFlowNodeType,
  ResourceMeteringSession,
  ResourceMeteringSessionStatus,
  ResourceUsage,
} from '@attraccess/database-entities';
import { ResourceMeteringServiceDiscardCandidateOperation } from './resource-metering.service.resource-metering-service-discard-candidate-operation';
export abstract class ResourceMeteringServiceRetrySettlementOperation extends ResourceMeteringServiceDiscardCandidateOperation {
  // ---- reconciliation ---------------------------------------------------------------------------

  /** Retries the final collection of a usage that already ended and bills the meter consumption as a separate correction. */
  async retrySettlement(resourceId: number, sessionId: string, initiatorId: number): Promise<ResourceMeteringSession> {
    const session = await this.sessions.findOne({ where: { id: sessionId, resourceId } });
    if (!session) throw new BadRequestException('METER_SESSION_NOT_FOUND');
    if (session.status !== ResourceMeteringSessionStatus.Pending) {
      throw new ConflictException('METER_SESSION_NOT_PENDING');
    }
    const usage = await this.sessions.manager.findOneOrFail(ResourceUsage, { where: { id: session.usageId } });
    if (!usage.endTime) throw new ConflictException('METER_SESSION_NOT_PENDING');
    const { collect } = await this.getDefinition(resourceId, session.meterId);
    try {
      await this.readings.assertMeterStillOwned(session);
      const operation = await this.runOperation(session, 'final', {
        trigger: ResourceFlowNodeType.INPUT_METERING_COLLECT,
        timeoutSeconds: collect.timeoutSeconds,
        freshAfter: usage.endTime,
      });
      await this.settlement.settleLate(session.id, operation.id, initiatorId);
    } catch (error) {
      const reason = this.reason(error);
      await this.sessions.update({ id: session.id }, { failureReason: reason });
      throw new BadRequestException(`METER_SETTLEMENT_FAILED: ${reason}`);
    }
    return this.sessions.findOneByOrFail({ id: session.id });
  }
}
