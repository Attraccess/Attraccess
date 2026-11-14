import { DataSource } from 'typeorm';
import * as migrations from './migrations';
import { CreateMatterConnection1793900000000 } from './migrations/1793900000000-create-matter-connection';
import { CreateMatterDeviceModel1793900001000 } from './migrations/1793900001000-create-matter-device-model';
import { CreateMatterBackup1793900002000 } from './migrations/1793900002000-create-matter-backup';

const DEVICE_TABLES = [
  'plugin_matter_fabrics',
  'plugin_matter_nodes',
  'plugin_matter_endpoints',
  'plugin_matter_endpoint_clusters',
  'plugin_matter_endpoint_capabilities',
  'plugin_matter_endpoint_state',
  'plugin_matter_commands',
  'plugin_matter_reconciliation_status',
];
const BACKUP_TABLES = ['plugin_matter_recovery_keys', 'plugin_matter_backups'];
const TABLES = [...DEVICE_TABLES, ...BACKUP_TABLES];

const open = () =>
  new DataSource({ type: 'sqlite', database: ':memory:', migrations: Object.values(migrations) }).initialize();
const tables = async (db: DataSource): Promise<string[]> =>
  (
    await db.query(`SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'plugin_matter_%' ORDER BY name`)
  ).map((row: { name: string }) => row.name);

describe('Matter device model migrations', () => {
  it('create every table from an empty database and revert cleanly in reverse order', async () => {
    const db = await open();
    try {
      await db.runMigrations();
      expect(await tables(db)).toEqual(['plugin_matter_connection', ...TABLES].sort());
      await db.undoLastMigration();
      expect(await tables(db)).toEqual(['plugin_matter_connection', ...DEVICE_TABLES].sort());
      await db.undoLastMigration();
      expect(await tables(db)).toEqual(['plugin_matter_connection']);
      await db.undoLastMigration();
      expect(await tables(db)).toEqual([]);
      await db.runMigrations();
      expect(await tables(db)).toHaveLength(TABLES.length + 1);
    } finally {
      await db.destroy();
    }
  });

  it('upgrade a database that holds only the connection migration, keeping its data', async () => {
    const db = await new DataSource({
      type: 'sqlite',
      database: ':memory:',
      migrations: [CreateMatterConnection1793900000000],
    }).initialize();
    try {
      await db.runMigrations();
      await db.query(
        `INSERT INTO plugin_matter_connection (id, url, encrypted_credential, credential_updated_at, updated_at, updated_by)
         VALUES (1, 'http://sidecar', 'enc', 'then', 'then', 3)`,
      );
      // The upgrade: the new migration runs on top of the existing database.
      const pending = Object.values(migrations).filter(
        (migration) => migration !== CreateMatterConnection1793900000000,
      );
      expect(pending).toEqual([CreateMatterDeviceModel1793900001000, CreateMatterBackup1793900002000]);
      const queryRunner = db.createQueryRunner();
      for (const migration of pending) {
        await new (migration as new () => { up(runner: typeof queryRunner): Promise<void> })().up(queryRunner);
      }
      await queryRunner.release();
      expect(await db.query('SELECT url, updated_by FROM plugin_matter_connection')).toEqual([
        { url: 'http://sidecar', updated_by: 3 },
      ]);
      expect(await tables(db)).toEqual(['plugin_matter_connection', ...TABLES].sort());
    } finally {
      await db.destroy();
    }
  });

  it('add the recorded fabric identity to existing fabric rows, keeping them', async () => {
    const db = await new DataSource({
      type: 'sqlite',
      database: ':memory:',
      migrations: [CreateMatterConnection1793900000000, CreateMatterDeviceModel1793900001000],
    }).initialize();
    try {
      await db.runMigrations();
      await db.query(
        `INSERT INTO plugin_matter_fabrics (id, fabric_id, first_seen_at, last_seen_at, status) VALUES ('f1', '7', 't', 't', 'active')`,
      );
      const queryRunner = db.createQueryRunner();
      await new CreateMatterBackup1793900002000().up(queryRunner);
      expect(
        await db.query(
          'SELECT fabric_id, fabric_generation, storage_instance_id, root_cert_fingerprint, recorded_at FROM plugin_matter_fabrics',
        ),
      ).toEqual([
        {
          fabric_id: '7',
          fabric_generation: null,
          storage_instance_id: null,
          root_cert_fingerprint: null,
          recorded_at: null,
        },
      ]);
      await new CreateMatterBackup1793900002000().down(queryRunner);
      expect(await db.query('SELECT * FROM plugin_matter_fabrics')).toEqual([
        {
          id: 'f1',
          fabric_id: '7',
          label: null,
          first_seen_at: 't',
          last_seen_at: 't',
          status: 'active',
          retired_at: null,
        },
      ]);
      await queryRunner.release();
    } finally {
      await db.destroy();
    }
  });

  it('allow one current recovery key, keep retired ones, and keep key IDs unique', async () => {
    const db = await open();
    try {
      await db.runMigrations();
      const key = (id: string, keyId: string, retiredAt: string | null) =>
        db.query(
          `INSERT INTO plugin_matter_recovery_keys (id, key_id, encrypted_key, created_at, retired_at) VALUES (?, ?, 'enc', 't', ?)`,
          [id, keyId, retiredAt],
        );
      await key('k1', 'aaaaaaaaaaaaaaaa', null);
      await expect(key('k2', 'bbbbbbbbbbbbbbbb', null)).rejects.toThrow(/UNIQUE/);
      await db.query(`UPDATE plugin_matter_recovery_keys SET retired_at = 'now'`);
      await key('k2', 'bbbbbbbbbbbbbbbb', null);
      await expect(key('k3', 'bbbbbbbbbbbbbbbb', 'x')).rejects.toThrow(/UNIQUE/);
    } finally {
      await db.destroy();
    }
  });

  it('constrain backups to known triggers and outcomes and store the file as a blob', async () => {
    const db = await open();
    try {
      await db.runMigrations();
      const insert = (trigger: string, outcome: string) =>
        db.query(
          `INSERT INTO plugin_matter_backups (id, created_at, trigger, outcome, blob) VALUES (lower(hex(randomblob(8))), 't', ?, ?, x'0102')`,
          [trigger, outcome],
        );
      await insert('manual', 'succeeded');
      await insert('pre_restore', 'failed');
      await expect(insert('whenever', 'succeeded')).rejects.toThrow(/CHECK/);
      await expect(insert('manual', 'maybe')).rejects.toThrow(/CHECK/);
      expect((await db.query('SELECT blob FROM plugin_matter_backups LIMIT 1'))[0].blob).toBeInstanceOf(Buffer);
    } finally {
      await db.destroy();
    }
  });

  it('use no foreign keys and no resource relationship column', async () => {
    const db = await open();
    try {
      await db.runMigrations();
      for (const table of TABLES) {
        expect(await db.query(`PRAGMA foreign_key_list(${table})`)).toEqual([]);
        const columns = (await db.query(`PRAGMA table_info(${table})`)).map((column: { name: string }) => column.name);
        expect(columns.filter((name: string) => /resource|reservation|user_ref/.test(name))).toEqual([]);
      }
    } finally {
      await db.destroy();
    }
  });

  describe('partial unique indexes', () => {
    const fabric = (db: DataSource, id: string, fabricId: string, retiredAt: string | null = null) =>
      db.query(
        `INSERT INTO plugin_matter_fabrics (id, fabric_id, first_seen_at, last_seen_at, status, retired_at) VALUES (?, ?, 't', 't', 'active', ?)`,
        [id, fabricId, retiredAt],
      );
    const node = (db: DataSource, id: string, fabricRef: string, nodeId: string, removedAt: string | null = null) =>
      db.query(
        `INSERT INTO plugin_matter_nodes (id, fabric_ref, node_id, lifecycle_state, first_seen_at, last_seen_at, created_at, updated_at, removed_at)
         VALUES (?, ?, ?, 'unclaimed', 't', 't', 't', 't', ?)`,
        [id, fabricRef, nodeId, removedAt],
      );
    const endpoint = (
      db: DataSource,
      id: string,
      nodeRef: string,
      endpointId: number,
      removedAt: string | null = null,
    ) =>
      db.query(
        `INSERT INTO plugin_matter_endpoints (id, node_ref, endpoint_id, device_types, profile, first_seen_at, last_seen_at, removed_at)
         VALUES (?, ?, ?, '[]', 'generic', 't', 't', ?)`,
        [id, nodeRef, endpointId, removedAt],
      );
    const cluster = (db: DataSource, id: string, endpointRef: string, role: string, removedAt: string | null = null) =>
      db.query(
        `INSERT INTO plugin_matter_endpoint_clusters (id, endpoint_ref, cluster_id, role, attribute_ids, accepted_command_ids, removed_at)
         VALUES (?, ?, 6, ?, '[]', '[]', ?)`,
        [id, endpointRef, role, removedAt],
      );

    it('reject a second live fabric, node, endpoint or cluster, but allow one after removal', async () => {
      const db = await open();
      try {
        await db.runMigrations();
        await fabric(db, 'f1', '1');
        await expect(fabric(db, 'f2', '1')).rejects.toThrow(/UNIQUE/);
        await db.query(`UPDATE plugin_matter_fabrics SET retired_at = 'now' WHERE id = 'f1'`);
        await fabric(db, 'f2', '1');

        await node(db, 'n1', 'f2', '5');
        await expect(node(db, 'n2', 'f2', '5')).rejects.toThrow(/UNIQUE/);
        // The same node ID on another fabric is another node.
        await fabric(db, 'f3', '2');
        await node(db, 'n3', 'f3', '5');
        await db.query(`UPDATE plugin_matter_nodes SET removed_at = 'now' WHERE id = 'n1'`);
        await node(db, 'n4', 'f2', '5');
        expect(await db.query(`SELECT id FROM plugin_matter_nodes WHERE fabric_ref = 'f2' ORDER BY id`)).toEqual([
          { id: 'n1' },
          { id: 'n4' },
        ]);

        await endpoint(db, 'e1', 'n4', 1);
        await expect(endpoint(db, 'e2', 'n4', 1)).rejects.toThrow(/UNIQUE/);
        await db.query(`UPDATE plugin_matter_endpoints SET removed_at = 'now' WHERE id = 'e1'`);
        await endpoint(db, 'e2', 'n4', 1);
        await expect(endpoint(db, 'e3', 'n4', 70_000)).rejects.toThrow(/CHECK/);

        await cluster(db, 'c1', 'e2', 'server');
        await expect(cluster(db, 'c2', 'e2', 'server')).rejects.toThrow(/UNIQUE/);
        await cluster(db, 'c3', 'e2', 'client');
        await db.query(`UPDATE plugin_matter_endpoint_clusters SET removed_at = 'now' WHERE id = 'c1'`);
        await cluster(db, 'c4', 'e2', 'server');
      } finally {
        await db.destroy();
      }
    });

    it('keep one state row per endpoint and key, and one reconciliation status row', async () => {
      const db = await open();
      try {
        await db.runMigrations();
        const insert = () =>
          db.query(
            `INSERT INTO plugin_matter_endpoint_state (id, endpoint_ref, state_key, updated_at) VALUES (lower(hex(randomblob(8))), 'e', 'onOff.onOff', 't')`,
          );
        await insert();
        await expect(insert()).rejects.toThrow(/UNIQUE/);
        await db.query(`INSERT INTO plugin_matter_reconciliation_status (id) VALUES (1)`);
        await expect(db.query(`INSERT INTO plugin_matter_reconciliation_status (id) VALUES (2)`)).rejects.toThrow(
          /CHECK/,
        );
      } finally {
        await db.destroy();
      }
    });
  });
});
