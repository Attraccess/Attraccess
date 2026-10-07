import { ResourceFlowsExecutorService } from './resource-flows-executor.service';
import { ResourceFlowsService } from './resource-flows.service';

export abstract class ResourceFlowsControllerRouteContext {
  protected abstract readonly resourceFlowsService: ResourceFlowsService;
  protected abstract readonly resourceFlowsExecutorService: ResourceFlowsExecutorService;
}
