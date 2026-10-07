import {
  ResourceFlowEdge,
  ResourceFlowNode,
  ResourceMeteringOperation,
  ResourceMeteringSession,
} from '@attraccess/database-entities';
import { forwardRef, Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditService } from '../../audit/audit.service';
import { LiveNotificationsService } from '../../billing/liveNotificationsService';
import { ResourceFlowsExecutorService } from '../flows/resource-flows-executor.service';
import { MeteringOperationQueueImplementation } from './metering-operation-queue';

@Injectable()
export class ResourceMeteringService extends MeteringOperationQueueImplementation implements OnModuleInit {
  protected readonly logger = new Logger(ResourceMeteringService.name);
  protected readonly queues = new Map<number, Promise<unknown>>();
  /** Freshness bound per pending operation. Pending operations never survive a restart, so memory is enough. */
  protected readonly freshAfter = new Map<string, Date>();
  // ponytail: in-memory; after a restart the cadence falls back to the last successful reading
  protected readonly interimAttempts = new Map<string, { at: number; running: boolean }>();

  constructor(
    @InjectRepository(ResourceMeteringSession) protected readonly sessions: Repository<ResourceMeteringSession>,
    @InjectRepository(ResourceMeteringOperation) protected readonly operations: Repository<ResourceMeteringOperation>,
    @InjectRepository(ResourceFlowNode) protected readonly nodes: Repository<ResourceFlowNode>,
    @InjectRepository(ResourceFlowEdge) protected readonly edges: Repository<ResourceFlowEdge>,
    @Inject(forwardRef(() => ResourceFlowsExecutorService)) protected readonly flows: ResourceFlowsExecutorService,
    protected readonly audit: AuditService,
    protected readonly liveNotifications: LiveNotificationsService,
  ) {
    super();
  }

  // ---- meter definition -------------------------------------------------------------------------
  // ---- lifecycle --------------------------------------------------------------------------------
  // ---- reconciliation ---------------------------------------------------------------------------
  // ---- interim readings -------------------------------------------------------------------------
  // ---- operations -------------------------------------------------------------------------------
}

export { FinalCollection, MeteringOperationError, MeterProblem } from './resource-metering.service.route-context';
