import { forwardRef, Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ResourceMeter,
  ResourceFlowEdge,
  ResourceFlowNode,
  ResourceMeteringOperation,
  ResourceMeteringSession,
} from '@attraccess/database-entities';
import { ResourceFlowsExecutorService } from '../flows/resource-flows-executor.service';
import { AuditService } from '../../audit/audit.service';
import { LiveNotificationsService } from '../../billing/liveNotificationsService';
import { MeteringOperationError } from './metering-readings';
import { ResourceMeteringServiceReasonOperation } from './resource-metering.service.resource-metering-service-reason-operation';

export type { MeterProblem } from './metering-definition';
export type { FinalCollection } from './metering-settlement';
export { MeteringOperationError } from './metering-readings';

export class MeteringTimeoutError extends MeteringOperationError {
  constructor(seconds: number) {
    super(`The metering flow did not reply within ${seconds}s`);
  }
}

@Injectable()
export class ResourceMeteringService extends ResourceMeteringServiceReasonOperation implements OnModuleInit {
  constructor(
    @InjectRepository(ResourceMeter) meters: Repository<ResourceMeter>,
    @InjectRepository(ResourceMeteringSession) sessions: Repository<ResourceMeteringSession>,
    @InjectRepository(ResourceMeteringOperation) operations: Repository<ResourceMeteringOperation>,
    @InjectRepository(ResourceFlowNode) nodes: Repository<ResourceFlowNode>,
    @InjectRepository(ResourceFlowEdge) edges: Repository<ResourceFlowEdge>,
    @Inject(forwardRef(() => ResourceFlowsExecutorService)) flows: ResourceFlowsExecutorService,
    audit: AuditService,
    liveNotifications: LiveNotificationsService,
  ) {
    super(meters, sessions, operations, nodes, edges, flows, audit, liveNotifications);
  }
}
