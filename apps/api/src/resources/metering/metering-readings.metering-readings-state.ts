import { EntityManager } from 'typeorm';
import { MeteringReadingsAssertMeterStillOwnedContract } from './metering-readings.metering-readings-assert-meter-still-owned-contract';
export abstract class MeteringReadingsState extends MeteringReadingsAssertMeterStillOwnedContract {
  constructor(
    protected readonly manager: EntityManager,
    protected readonly freshAfter: ReadonlyMap<string, Date>,
  ) {
    super();
  }
}
