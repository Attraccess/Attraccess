import { forwardRef, Inject, Logger } from '@nestjs/common';
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
import { MeteringCatalog } from './metering-catalog';
import { MeteringReadings } from './metering-readings';
import { MeteringSettlement } from './metering-settlement';
import { ResourceMeteringServiceOnModuleInitContract } from './resource-metering.service.resource-metering-service-on-module-init-contract';
export abstract class ResourceMeteringServiceState extends ResourceMeteringServiceOnModuleInitContract {
  protected readonly logger = new Logger('ResourceMeteringService');

  protected readonly catalog: MeteringCatalog;

  protected readonly readings: MeteringReadings;

  protected readonly settlement: MeteringSettlement;

  protected readonly queues = new Map<number, Promise<unknown>>();

  /** Freshness bound per pending operation. Pending operations never survive a restart, so memory is enough. */
  protected readonly freshAfter = new Map<string, Date>();

  // ponytail: in-memory; after a restart the cadence falls back to the last successful reading
  protected readonly interimAttempts = new Map<string, { at: number; running: boolean }>();

  constructor(
    @InjectRepository(ResourceMeter) protected readonly meters: Repository<ResourceMeter>,
    @InjectRepository(ResourceMeteringSession) protected readonly sessions: Repository<ResourceMeteringSession>,
    @InjectRepository(ResourceMeteringOperation) protected readonly operations: Repository<ResourceMeteringOperation>,
    @InjectRepository(ResourceFlowNode) nodes: Repository<ResourceFlowNode>,
    @InjectRepository(ResourceFlowEdge) edges: Repository<ResourceFlowEdge>,
    @Inject(forwardRef(() => ResourceFlowsExecutorService)) protected readonly flows: ResourceFlowsExecutorService,
    audit: AuditService,
    liveNotifications: LiveNotificationsService,
  ) {
    super();
    this.catalog = new MeteringCatalog(this.meters, this.sessions, nodes, edges);
    this.readings = new MeteringReadings(this.sessions.manager, this.freshAfter);
    this.settlement = new MeteringSettlement(this.sessions, audit, liveNotifications, this.logger);
  }
}
