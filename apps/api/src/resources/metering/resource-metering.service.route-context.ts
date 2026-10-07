import {
  BillingTransaction,
  ResourceFlowEdge,
  ResourceFlowNode,
  ResourceFlowNodeType,
  ResourceMeteringOperation,
  ResourceMeteringOperationKind,
  ResourceMeteringSession,
} from '@attraccess/database-entities';
import { Logger } from '@nestjs/common';
import { EntityManager, Repository } from 'typeorm';
import { AuditService } from '../../audit/audit.service';
import { LiveNotificationsService } from '../../billing/liveNotificationsService';
import { type MeteringReport } from '../flows/node-executors';
import { ResourceFlowsExecutorService } from '../flows/resource-flows-executor.service';

export const CLOCK_SKEW_MS = 5_000;

export const INTERIM_MAX_AGE_MS = 5 * 60_000;

export type MeterProblem =
  'start-trigger-missing' | 'ready-unreachable' | 'collect-trigger-missing' | 'report-unreachable';

export type FinalCollection =
  { status: 'not-metered' } | { status: 'ready'; operationId: string } | { status: 'unavailable'; reason: string };

export class MeteringOperationError extends Error {}

export class MeteringTimeoutError extends MeteringOperationError {
  constructor(seconds: number) {
    super(`The metering flow did not reply within ${seconds}s`);
  }
}

export abstract class ResourceMeteringServiceRouteContext {
  protected abstract readonly operations: Repository<ResourceMeteringOperation>;
  protected abstract readonly nodes: Repository<ResourceFlowNode>;
  protected abstract readonly edges: Repository<ResourceFlowEdge>;
  public abstract getDefinition(resourceId: number): Promise<{
    configured: boolean;
    problems: MeterProblem[];
    start: { timeoutSeconds: number };
    collect: {
      timeoutSeconds: number;
      interimIntervalMinutes: number;
      finalAttempts: number;
      finalRetryDelaySeconds: number;
    };
  }>;
  protected abstract readonly sessions: Repository<ResourceMeteringSession>;
  protected abstract runOperation(
    session: ResourceMeteringSession,
    kind: ResourceMeteringOperationKind,
    options: { trigger: ResourceFlowNodeType; timeoutSeconds: number; freshAfter?: Date },
  ): Promise<ResourceMeteringOperation>;
  protected abstract reason(error: unknown): string;
  protected abstract readonly logger: Logger;
  protected abstract addEnergyItem(
    manager: EntityManager,
    transaction: BillingTransaction,
    session: ResourceMeteringSession,
    operation: ResourceMeteringOperation,
  ): Promise<number>;
  protected abstract assertMeterStillOwned(session: ResourceMeteringSession): Promise<void>;
  protected abstract settleLate(sessionId: string, operationId: string, initiatorId: number): Promise<void>;
  protected abstract readonly audit: AuditService;
  protected abstract readonly liveNotifications: LiveNotificationsService;
  protected abstract findActiveSession(resourceId: number): Promise<ResourceMeteringSession>;
  protected abstract readonly interimAttempts: Map<string, { at: number; running: boolean }>;
  protected abstract readonly queues: Map<number, Promise<unknown>>;
  protected abstract enqueue<T>(resourceId: number, work: () => Promise<T>): Promise<T>;
  protected abstract readonly freshAfter: Map<string, Date>;
  protected abstract readonly flows: ResourceFlowsExecutorService;
  protected abstract complete(operationId: string, report: MeteringReport): Promise<void>;
  protected abstract close(operationId: string, status: 'failed' | 'expired', error: string): Promise<void>;
}
