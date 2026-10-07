import { ResourceMeteringServiceState } from './resource-metering.service.resource-metering-service-state';
export abstract class ResourceMeteringServiceOnModuleInitOperation extends ResourceMeteringServiceState {
  async onModuleInit(): Promise<void> {
    await this.operations.update({ status: 'pending' }, { status: 'expired', error: 'Interrupted by a restart' });
  }
}
