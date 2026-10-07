import { EntityManager } from 'typeorm';
import { ResourceMeter, ResourceMeteringOperation, ResourceMeteringSession } from '@attraccess/database-entities';
import { MeteringReport } from '../flows/node-executors';

export abstract class MeteringReadingsAssertMeterStillOwnedContract {
  abstract assertMeterStillOwned(session: ResourceMeteringSession, manager?: EntityManager): Promise<void>;
  abstract report(
    resourceId: number,
    meterId: number,
    report: Extract<MeteringReport, { kind: 'reading' }>,
    transactionManager?: EntityManager,
    lifecycleAttemptId?: string,
    reportId?: string,
  ): Promise<void>;
  protected abstract matchesEvidence(
    operation: ResourceMeteringOperation,
    report: Extract<MeteringReport, { kind: 'reading' }>,
  ): boolean;
  protected abstract acceptReading(
    manager: EntityManager,
    meter: ResourceMeter,
    session: ResourceMeteringSession | null,
    report: Extract<MeteringReport, { kind: 'reading' }>,
    freshAfter?: Date,
  ): Promise<{ total: string; observedAt: Date }>;
  abstract complete(operationId: string, report: MeteringReport): Promise<void>;
}
