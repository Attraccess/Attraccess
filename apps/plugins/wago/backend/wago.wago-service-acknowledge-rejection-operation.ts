import { WagoAudit } from './wago-audit';
import { ConflictException } from '@nestjs/common';
import { NotFoundException } from '@nestjs/common';
import type { PluginAuditPrincipal } from '@attraccess/plugins-backend-sdk';
import { WagoConfigurationRevision } from './wago-configuration-revision.entity';
import { WagoServiceRollbackOperation } from './wago.service.wago-service-rollback-operation';


export abstract class WagoServiceAcknowledgeRejectionOperation extends WagoServiceRollbackOperation {
  async acknowledgeRejection(
    controllerId: number,
    revision: number,
    expected: { contentHash?: string; reportedAt?: string },
    principal: PluginAuditPrincipal,
  ): Promise<WagoConfigurationRevision> {
    return this.withConfigurationLock(controllerId, async () => {
      await this.claimedController(controllerId);
      const rejected = await this.revisions.findOneBy({ controllerId, revision });
      if (!rejected) throw new NotFoundException(`WAGO configuration revision ${revision} not found`);
      if (
        rejected.state !== 'rejected' ||
        !rejected.reportedAt ||
        expected.contentHash !== rejected.contentHash ||
        expected.reportedAt !== rejected.reportedAt
      )
        throw new ConflictException('rejection changed; refresh and review it before acknowledging');
      if (rejected.rejectionAcknowledgedAt) return rejected;
      return new WagoAudit(this.context).run(
        principal,
        controllerId,
        'rejection_acknowledgement',
        { revision },
        async () => {
          return this.revisions.save({
            ...rejected,
            rejectionAcknowledgedAt: new Date().toISOString(),
            rejectionAcknowledgedBy: principal.userId,
          });
        },
      );
    });
  }
}
