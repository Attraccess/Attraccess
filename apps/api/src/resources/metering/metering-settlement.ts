import { Logger } from '@nestjs/common';
import { Repository } from 'typeorm';
import { ResourceMeteringSession } from '@attraccess/database-entities';
import { AuditService } from '../../audit/audit.service';
import { LiveNotificationsService } from '../../billing/liveNotificationsService';
import { MeteringSettlementWaiveOperation } from './metering-settlement.metering-settlement-waive-operation';

export type MeterFinal = { status: 'ready'; operationId: string } | { status: 'unavailable'; reason: string };
export type FinalCollection = { status: 'not-metered' } | { status: 'collected'; meters: Record<string, MeterFinal> };

export class MeteringSettlement extends MeteringSettlementWaiveOperation {
  constructor(
    sessions: Repository<ResourceMeteringSession>,
    audit: AuditService,
    liveNotifications: LiveNotificationsService,
    logger: Logger,
  ) {
    super(sessions, audit, liveNotifications, logger);
  }
}
