import { ConflictException } from '@nestjs/common';
import { In } from 'typeorm';
import { ResourceMeteringSession, ResourceMeteringSessionStatus } from '@attraccess/database-entities';
import { meterCharge } from './quantity';
import { MeteringSettlementSettleLateOperation } from './metering-settlement.metering-settlement-settle-late-operation';
export abstract class MeteringSettlementWaiveOperation extends MeteringSettlementSettleLateOperation {
  async waive(resourceId: number, sessionId: string, initiatorId: number): Promise<ResourceMeteringSession> {
    const result = await this.sessions.update(
      {
        id: sessionId,
        resourceId,
        status: In([ResourceMeteringSessionStatus.Pending, ResourceMeteringSessionStatus.Failed]),
      },
      { status: ResourceMeteringSessionStatus.Waived, settledAt: new Date() },
    );
    if (!result.affected) throw new ConflictException('METER_SESSION_NOT_PENDING');
    const session = await this.sessions.findOneByOrFail({ id: sessionId });
    void this.audit.recordResource({
      action: 'meter_charge.waived',
      actorId: initiatorId,
      subjectId: resourceId,
      details: {
        usageId: session.usageId,
        meterId: session.meterId,
        ...(session.latestValue === null
          ? {}
          : { waivedCredits: meterCharge(BigInt(session.latestValue), session.creditsPerUnit) }),
      },
    });
    return session;
  }
}
