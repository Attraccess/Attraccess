import type { DataSource } from 'typeorm';
import { closeTestDataSource, createTestDataSource } from '../../../test-utils/test-database';
import { PostgresBaseline1760000000000 } from './1760000000000-baseline';
import { AttractapNfcCapability1795800000000 } from './1795800000000-attractap-nfc-capability';
import { AttractapDropBridgeResourceLinks1795800000001 } from './1795800000001-attractap-drop-bridge-resource-links';

jest.setTimeout(120_000);

describe('AttractapDropBridgeResourceLinks1795800000001 (persistence)', () => {
  let source: DataSource;

  beforeEach(async () => {
    source = await createTestDataSource({
      migrations: [PostgresBaseline1760000000000, AttractapNfcCapability1795800000000],
      migrationsRun: true,
    });
  });
  afterEach(() => closeTestDataSource(source));

  it('drops the resource links of readers without NFC and keeps the others', async () => {
    await source.query(`INSERT INTO "resource" (id, name, type) VALUES (1, 'Laser', 'machine'), (2, 'Door', 'door')`);
    await source.query(
      `INSERT INTO "attractap" (id, name, "firmwareCapabilitiesNfc") VALUES (1, 'Touch', true), (2, 'Bridge', false)`,
    );
    await source.query(
      `INSERT INTO "attractap_resources_resource" ("attractapId", "resourceId") VALUES (1, 1), (1, 2), (2, 1), (2, 2)`,
    );

    const runner = source.createQueryRunner();
    try {
      await new AttractapDropBridgeResourceLinks1795800000001().up(runner);
    } finally {
      await runner.release();
    }

    expect(
      await source.query(
        `SELECT "attractapId", "resourceId" FROM "attractap_resources_resource" ORDER BY "attractapId", "resourceId"`,
      ),
    ).toEqual([
      { attractapId: 1, resourceId: 1 },
      { attractapId: 1, resourceId: 2 },
    ]);
  });
});
