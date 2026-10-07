import { ResourceMeteringServiceRunOperationOperation } from './resource-metering.service.resource-metering-service-run-operation-operation';
export abstract class ResourceMeteringServiceCloseOperation extends ResourceMeteringServiceRunOperationOperation {
  protected async close(operationId: string, status: 'failed' | 'expired', error: string): Promise<void> {
    await this.operations.update({ id: operationId, status: 'pending' }, { status, error, completedAt: new Date() });
  }
}
