import { EntityManager } from 'typeorm';
import { MeteringReadingsCompleteOperation } from './metering-readings.metering-readings-complete-operation';

export class MeteringReadings extends MeteringReadingsCompleteOperation {
  constructor(manager: EntityManager, freshAfter: ReadonlyMap<string, Date>) {
    super(manager, freshAfter);
  }
}

export { MeteringOperationError } from './metering-reading.constants';
