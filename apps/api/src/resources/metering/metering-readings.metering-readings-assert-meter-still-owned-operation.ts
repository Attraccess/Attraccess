import { MoreThan } from 'typeorm';
import { ResourceMeteringSession } from '@attraccess/database-entities';
import { MeteringReadingsState } from './metering-readings.metering-readings-state';
import { MeteringOperationError } from './metering-reading.constants';

export abstract class MeteringReadingsAssertMeterStillOwnedOperation extends MeteringReadingsState {
  async assertMeterStillOwned(session: ResourceMeteringSession, manager = this.manager): Promise<void> {
    if (session.compromisedReason) throw new MeteringOperationError(session.compromisedReason);
    const newer = await manager.count(ResourceMeteringSession, {
      where: { resourceId: session.resourceId, meterId: session.meterId, usageId: MoreThan(session.usageId) },
    });
    if (newer > 0) throw new MeteringOperationError('A later session already uses the meter');
  }
}
