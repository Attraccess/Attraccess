import { Injectable } from '@nestjs/common';
import { ResourceFlowsExecutorService } from '../../flows/execution/resource-flows-executor.service';
import { ResourceUsageService } from './resource-usage.service';

/**
 * Hands the usage service to flows, whose end-session and billing nodes call back into it. Flows cannot inject it:
 * usage already depends on flows, so the modules would import each other. Attaching at construction runs before any
 * lifecycle hook, so no flow can run without it.
 */
@Injectable()
export class ResourceUsageFlowsBridge {
  constructor(flows: ResourceFlowsExecutorService, usage: ResourceUsageService) {
    flows.attachUsage(usage);
  }
}
