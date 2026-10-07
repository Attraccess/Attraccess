import { ResourceFlowsExecutorServiceState } from './resource-flows-executor.service.resource-flows-executor-service-state';
export abstract class ResourceFlowsExecutorServiceOnModuleInitOperation extends ResourceFlowsExecutorServiceState {
  async onModuleInit() {
    await this.triggers.subscribeToMqttTopics();
  }
}
