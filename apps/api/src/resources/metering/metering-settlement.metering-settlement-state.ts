import { Logger } from '@nestjs/common';
import { Repository } from 'typeorm';
import { ResourceMeteringSession } from '@attraccess/database-entities';
import { AuditService } from '../../audit/audit.service';
import { LiveNotificationsService } from '../../billing/liveNotificationsService';
import { MeteringSettlementSettleInTransactionContract } from './metering-settlement.metering-settlement-settle-in-transaction-contract';
export abstract class MeteringSettlementState extends MeteringSettlementSettleInTransactionContract {
  constructor(
    protected readonly sessions: Repository<ResourceMeteringSession>,
    protected readonly audit: AuditService,
    protected readonly liveNotifications: LiveNotificationsService,
    protected readonly logger: Logger,
  ) {
    super();
  }
}
