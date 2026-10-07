import { MeteringCatalog } from './metering-catalog';
import { EntityManager } from 'typeorm';
import {
  ResourceFlowNodeType,
  ResourceMeteringOperation,
  ResourceMeteringOperationKind,
  ResourceMeteringSession,
} from '@attraccess/database-entities';
import { MeteringReport } from '../flows/node-executors';
import { type FinalCollection, type MeterFinal } from './metering-settlement';

export abstract class ResourceMeteringServiceOnModuleInitContract {
  abstract onModuleInit(): Promise<void>;
  abstract getDefinition(resourceId: number, meterId: number): ReturnType<MeteringCatalog['getDefinition']>;
  abstract initialize(input: { resourceId: number; usageId: number; supersedes?: number }): Promise<void>;
  abstract collectFinal(usageId: number, freshAfter: Date): Promise<FinalCollection>;
  protected abstract collectSessionFinal(session: ResourceMeteringSession, freshAfter: Date): Promise<MeterFinal>;
  abstract settleInTransaction(manager: EntityManager, usageId: number, final: FinalCollection): Promise<void>;
  abstract discardCandidate(manager: EntityManager, usageId: number): Promise<void>;
  abstract retrySettlement(
    resourceId: number,
    sessionId: string,
    initiatorId: number,
  ): Promise<ResourceMeteringSession>;
  abstract waive(resourceId: number, sessionId: string, initiatorId: number): Promise<ResourceMeteringSession>;
  abstract listMeters(resourceId: number): ReturnType<MeteringCatalog['listMeters']>;
  abstract createMeter(resourceId: number, name: string): ReturnType<MeteringCatalog['createMeter']>;
  abstract updateMeter(resourceId: number, meterId: number, name: string): ReturnType<MeteringCatalog['updateMeter']>;
  abstract setRate(resourceId: number, meterId: number, creditsPerUnit: number): ReturnType<MeteringCatalog['setRate']>;
  abstract getLive(resourceId: number): ReturnType<MeteringCatalog['getLive']>;
  abstract getStatus(resourceId: number): ReturnType<MeteringCatalog['getStatus']>;
  abstract collectInterimReadings(): Promise<void>;
  protected abstract enqueue<T>(resourceId: number, work: () => Promise<T>): Promise<T>;
  protected abstract runOperation(
    session: { id: string | null; meterId: number; resourceId: number; usageId: number | null },
    kind: ResourceMeteringOperationKind,
    options: { trigger: ResourceFlowNodeType; timeoutSeconds: number; freshAfter?: Date },
  ): Promise<ResourceMeteringOperation>;
  protected abstract close(operationId: string, status: 'failed' | 'expired', error: string): Promise<void>;
  abstract report(
    resourceId: number,
    meterId: number,
    report: Extract<MeteringReport, { kind: 'reading' }>,
    transactionManager?: EntityManager,
    lifecycleAttemptId?: string,
    reportId?: string,
  ): Promise<void>;
  protected abstract reason(error: unknown): string;
}
