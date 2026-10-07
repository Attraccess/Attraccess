import { randomUUID } from 'node:crypto';
import { ResourceFlowNodeType, ResourceMeteringSession } from '@attraccess/database-entities';
import { type MeterFinal } from './metering-settlement';
import { ResourceMeteringServiceCollectFinalOperation } from './resource-metering.service.resource-metering-service-collect-final-operation';
export abstract class ResourceMeteringServiceCollectSessionFinalOperation extends ResourceMeteringServiceCollectFinalOperation {
  protected async collectSessionFinal(session: ResourceMeteringSession, freshAfter: Date): Promise<MeterFinal> {
    const usageId = session.usageId;
    if (session.compromisedReason) return { status: 'unavailable', reason: session.compromisedReason };
    if (session.collectionMode === 'increment') {
      const operation = await this.operations.save({
        id: randomUUID(),
        sessionId: session.id,
        meterId: session.meterId,
        resourceId: session.resourceId,
        kind: 'final',
        status: 'completed',
        requestedAt: freshAfter,
        completedAt: new Date(),
        observedAt: freshAfter,
        totalValue: session.latestValue ?? '0',
      });
      return { status: 'ready', operationId: operation.id };
    }
    const { collect } = await this.getDefinition(session.resourceId, session.meterId);
    let reason = 'No attempt was made';
    for (let attempt = 1; attempt <= collect.finalAttempts; attempt++) {
      try {
        const operation = await this.runOperation(session, 'final', {
          trigger: ResourceFlowNodeType.INPUT_METERING_COLLECT,
          timeoutSeconds: collect.timeoutSeconds,
          freshAfter,
        });
        return { status: 'ready', operationId: operation.id };
      } catch (error) {
        reason = this.reason(error);
        this.logger.warn(
          `Final metering collection ${attempt}/${collect.finalAttempts} for usage ${usageId} failed: ${reason}`,
        );
        if (attempt < collect.finalAttempts && collect.finalRetryDelaySeconds > 0) {
          await new Promise((resolve) => setTimeout(resolve, collect.finalRetryDelaySeconds * 1000));
        }
      }
    }
    return { status: 'unavailable', reason };
  }
}
