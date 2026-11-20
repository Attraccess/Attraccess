import { RESERVATIONS_LEGACY_DDL } from '../testing/legacy-ddl.fixture';
import { compareBaselineWithLegacy } from '../testing/legacy-layout.test-utils';
import { RESERVATIONS_LEGACY_MIGRATIONS, reservationsStorage } from './index';

describe('reservations storage baseline', () => {
  it('declares exactly the table layout the 1.x migrations produced', () => {
    const { legacy, declared } = compareBaselineWithLegacy(reservationsStorage, RESERVATIONS_LEGACY_DDL);
    expect(Object.keys(declared)).toHaveLength(5);
    expect(declared).toEqual(legacy);
  });

  it('keeps every legacy table name as the physical name', () => {
    const physical = Object.values(reservationsStorage.tables).map((definition) => definition.physicalName);
    expect(physical.sort()).toEqual([
      'reservations_global_settings',
      'reservations_ical_feed',
      'reservations_notice',
      'reservations_reservation',
      'reservations_resource_settings',
    ]);
  });

  it('adopts databases where both legacy migrations ran, and lists them in order', () => {
    expect(reservationsStorage.adoption?.legacyMigrations).toEqual([
      'CreateReservations1790000000000',
      'AddReservationStatusIndexes1790000000001',
    ]);
    expect(RESERVATIONS_LEGACY_MIGRATIONS).toHaveLength(2);
  });

  it('creates every declared table in the version 1 baseline and nothing else', () => {
    const [baseline, ...later] = reservationsStorage.migrations;
    expect(baseline.version).toBe(1);
    expect(later).toEqual([]);
    expect(baseline.steps?.map((s) => (s.op === 'createTable' ? s.table : s.op)).sort()).toEqual(
      Object.keys(reservationsStorage.tables).sort(),
    );
  });
});
