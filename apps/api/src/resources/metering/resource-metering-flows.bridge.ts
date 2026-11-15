import { Injectable } from '@nestjs/common';
import { ResourceFlowsExecutorService } from '../flows/execution/resource-flows-executor.service';
import { ResourceMeteringService } from './resource-metering.service';

/**
 * Hands the metering service to flows, whose report node calls back into it. Flows cannot inject it: metering
 * already depends on flows, so the modules would import each other. Attaching at construction runs before any
 * lifecycle hook, so no flow can run without it.
 */
@Injectable()
export class ResourceMeteringFlowsBridge {
  constructor(flows: ResourceFlowsExecutorService, metering: ResourceMeteringService) {
    flows.attachMetering(metering);
  }
}
