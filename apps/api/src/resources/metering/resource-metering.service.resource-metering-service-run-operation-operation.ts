import { randomUUID } from 'node:crypto';
import {
  ResourceFlowNodeType,
  ResourceMeteringOperation,
  ResourceMeteringOperationKind,
} from '@attraccess/database-entities';
import { MeteringOperationError } from './metering-readings';
import { ResourceMeteringServiceEnqueueOperation } from './resource-metering.service.resource-metering-service-enqueue-operation';
import { MeteringTimeoutError } from './resource-metering.service';

export abstract class ResourceMeteringServiceRunOperationOperation extends ResourceMeteringServiceEnqueueOperation {
  protected runOperation(
    session: { id: string | null; meterId: number; resourceId: number; usageId: number | null },
    kind: ResourceMeteringOperationKind,
    options: { trigger: ResourceFlowNodeType; timeoutSeconds: number; freshAfter?: Date },
  ): Promise<ResourceMeteringOperation> {
    return this.enqueue(session.resourceId, async () => {
      const requestedAt = new Date();
      const operation = await this.operations.save({
        id: randomUUID(),
        sessionId: session.id,
        meterId: session.meterId,
        resourceId: session.resourceId,
        kind,
        status: 'pending',
        requestedAt,
      } as ResourceMeteringOperation);
      if (options.freshAfter) this.freshAfter.set(operation.id, options.freshAfter);
      let timer: NodeJS.Timeout | undefined;
      try {
        await Promise.race([
          this.flows.runFlow(
            session.resourceId,
            options.trigger,
            {
              metering: {
                sessionId: session.id,
                meterId: session.meterId,
                operationId: operation.id,
                resourceId: session.resourceId,
                usageId: session.usageId,
                kind,
                requestedAt: requestedAt.toISOString(),
              },
            },
            undefined,
            {
              metering: {
                meterId: session.meterId,
                operationId: operation.id,
                kind,
                complete: (report) => this.readings.complete(operation.id, report),
              },
            },
          ),
          new Promise<never>((_, reject) => {
            timer = setTimeout(
              () => reject(new MeteringTimeoutError(options.timeoutSeconds)),
              options.timeoutSeconds * 1000,
            );
          }),
        ]);
      } catch (error) {
        await this.close(
          operation.id,
          error instanceof MeteringTimeoutError ? 'expired' : 'failed',
          this.reason(error),
        );
        throw error;
      } finally {
        clearTimeout(timer);
        this.freshAfter.delete(operation.id);
      }
      const done = await this.operations.findOneByOrFail({ id: operation.id });
      if (done.status !== 'completed') {
        const message = `The ${kind === 'start' ? 'start' : 'collection'} branch finished without ${kind === 'start' ? 'acknowledging' : 'reporting'}`;
        await this.close(operation.id, 'failed', message);
        throw new MeteringOperationError(message);
      }
      return done;
    });
  }
}
