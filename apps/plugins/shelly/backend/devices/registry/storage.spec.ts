import { SHELLY_LEGACY_MIGRATIONS, shellyStorage } from './storage';
import { SHELLY_LEGACY_DDL } from '../../testing/legacy-ddl.fixture';
import { compareBaselineWithLegacy } from '../../testing/legacy-layout.test-utils';

describe('shelly storage baseline', () => {
  it('declares exactly the table layout the 1.x migration produced', () => {
    const { legacy, declared } = compareBaselineWithLegacy(shellyStorage, SHELLY_LEGACY_DDL);
    expect(declared).toEqual(legacy);
  });

  it('adopts databases that ran the only legacy migration', () => {
    expect(shellyStorage.adoption?.legacyMigrations).toEqual(['CreateShellyDevices1749470400000']);
    expect(SHELLY_LEGACY_MIGRATIONS).toHaveLength(1);
  });

  it('starts the neutral migrations with the baseline at version 1', () => {
    expect(shellyStorage.migrations.map((migration) => migration.version)).toEqual([1]);
  });
});
