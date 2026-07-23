import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { DataSource, DataSourceOptions } from 'typeorm';

jest.setTimeout(600_000);

// Legacy boolean permission keys → expected RBAC role keys after UP migration
const OLD_MAPPINGS = {
  canManageResources: ['cn=resource-admins', 'cn=managers'],
  canManageUsers: ['cn=user-admins'],
  canManageSystemConfiguration: ['cn=sysadmins'],
  canManageBilling: ['cn=billing-admins'],
};
const EXPECTED_NEW_MAPPINGS = {
  'resource-manager': ['cn=resource-admins', 'cn=managers'],
  'user-manager': ['cn=user-admins'],
  'system-admin': ['cn=sysadmins'],
  'billing-manager': ['cn=billing-admins'],
};

describe('DropBooleanPermissions migration (e2e)', () => {
  let dataSource: DataSource;
  let tmpRoot: string;

  // IDs set after test data insertion (pre-migration)
  let oidcConfigId: number;
  let samlConfigId: number;
  let nullOidcConfigId: number;

  // ── helpers ──────────────────────────────────────────────────────────────

  const getUserColumns = async () => {
    const cols: { name: string }[] = await dataSource.manager.query('PRAGMA table_info("user")');
    return cols.map((c) => c.name);
  };

  const lastInsertId = async () => {
    const rows = await dataSource.manager.query('SELECT last_insert_rowid() as id');
    return rows[0].id as number;
  };

  const createSsoProvider = async (name: string, type: 'OIDC' | 'SAML') => {
    await dataSource.manager.query('INSERT INTO "sso_provider" (name, type) VALUES (?, ?)', [name, type]);
    return lastInsertId();
  };

  const createOidcConfig = async (
    providerId: number,
    permissionMappings: Record<string, string[]> | null,
  ) => {
    await dataSource.manager.query(
      `INSERT INTO "sso_provider_oidc_configuration"
       (ssoProviderId, issuer, authorizationURL, tokenURL, userInfoURL, clientId, clientSecret, permissionMappings)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        providerId,
        'https://issuer.example.com',
        'https://issuer.example.com/auth',
        'https://issuer.example.com/token',
        'https://issuer.example.com/userinfo',
        'client-id',
        'client-secret',
        permissionMappings ? JSON.stringify(permissionMappings) : null,
      ],
    );
    return lastInsertId();
  };

  const createSamlConfig = async (
    providerId: number,
    permissionMappings: Record<string, string[]> | null,
  ) => {
    await dataSource.manager.query(
      `INSERT INTO "sso_provider_saml_configuration"
       (ssoProviderId, entryPoint, issuer, certificate, signRequest, wantAssertionsSigned, wantAuthnResponseSigned, forceAuthn, permissionMappings)
       VALUES (?, ?, ?, ?, 0, 0, 1, 0, ?)`,
      [
        providerId,
        'https://saml.example.com/sso',
        'https://app.example.com',
        'test-cert',
        permissionMappings ? JSON.stringify(permissionMappings) : null,
      ],
    );
    return lastInsertId();
  };

  const getOidcMappings = async (id: number): Promise<Record<string, string[]> | null> => {
    const rows: { permissionMappings: string | null }[] = await dataSource.manager.query(
      'SELECT permissionMappings FROM "sso_provider_oidc_configuration" WHERE id = ?',
      [id],
    );
    const raw = rows[0]?.permissionMappings;
    return raw ? JSON.parse(raw) : null;
  };

  const getSamlMappings = async (id: number): Promise<Record<string, string[]> | null> => {
    const rows: { permissionMappings: string | null }[] = await dataSource.manager.query(
      'SELECT permissionMappings FROM "sso_provider_saml_configuration" WHERE id = ?',
      [id],
    );
    const raw = rows[0]?.permissionMappings;
    return raw ? JSON.parse(raw) : null;
  };

  // ── setup ─────────────────────────────────────────────────────────────────

  beforeAll(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'attraccess-drop-bool-perms-'));
    process.env.STORAGE_ROOT = tmpRoot;
    process.env.AUTH_SESSION_SECRET = process.env.AUTH_SESSION_SECRET || 'migration-test-secret';

    // Import the shared config (computed from STORAGE_ROOT set above) but create a dedicated
    // DataSource with migrationsRun: false so initialize() does NOT auto-run migrations.
    // The shared datasource has migrationsRun: true which leaves internal TypeORM connection
    // state that can prevent subsequently inserted rows from being visible inside runMigrations().
    const { DataSource } = await import('typeorm');
    const { dataSourceConfig } = await import('../database/datasource');
    dataSource = new DataSource({ ...(dataSourceConfig as DataSourceOptions), migrationsRun: false });
    await dataSource.initialize();

    // Apply every migration, then step back one — landing in the
    // pre-DropBooleanPermissions state where boolean columns still exist.
    await dataSource.runMigrations();
    await dataSource.undoLastMigration();
  });

  // Insert test data while the schema still has old-format permissionMappings
  beforeAll(async () => {
    const oidcProviderId = await createSsoProvider('Test OIDC', 'OIDC');
    const samlProviderId = await createSsoProvider('Test SAML', 'SAML');
    const nullProviderId = await createSsoProvider('Test OIDC null mappings', 'OIDC');

    oidcConfigId = await createOidcConfig(oidcProviderId, OLD_MAPPINGS);
    samlConfigId = await createSamlConfig(samlProviderId, OLD_MAPPINGS);
    nullOidcConfigId = await createOidcConfig(nullProviderId, null);
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
    await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  // ── UP migration ──────────────────────────────────────────────────────────

  describe('after UP migration', () => {
    beforeAll(async () => {
      await dataSource.runMigrations();
    });

    it('removes boolean permission columns from user table', async () => {
      const cols = await getUserColumns();
      expect(cols).not.toContain('canManageResources');
      expect(cols).not.toContain('canManageSystemConfiguration');
      expect(cols).not.toContain('canManageUsers');
      expect(cols).not.toContain('canManageBilling');
    });

    it('retains all other user columns', async () => {
      const cols = await getUserColumns();
      expect(cols).toContain('id');
      expect(cols).toContain('username');
      expect(cols).toContain('email');
      expect(cols).toContain('creditBalance');
    });

    it('converts OIDC permissionMappings keys to RBAC role keys', async () => {
      expect(await getOidcMappings(oidcConfigId)).toEqual(EXPECTED_NEW_MAPPINGS);
    });

    it('converts SAML permissionMappings keys to RBAC role keys', async () => {
      expect(await getSamlMappings(samlConfigId)).toEqual(EXPECTED_NEW_MAPPINGS);
    });

    it('leaves null permissionMappings untouched', async () => {
      expect(await getOidcMappings(nullOidcConfigId)).toBeNull();
    });
  });

  // ── DOWN migration ────────────────────────────────────────────────────────

  describe('after DOWN migration', () => {
    beforeAll(async () => {
      await dataSource.undoLastMigration();
    });

    it('restores boolean permission columns on user table', async () => {
      const cols = await getUserColumns();
      expect(cols).toContain('canManageResources');
      expect(cols).toContain('canManageSystemConfiguration');
      expect(cols).toContain('canManageUsers');
      expect(cols).toContain('canManageBilling');
    });

    it('reverts OIDC permissionMappings keys to legacy boolean names', async () => {
      expect(await getOidcMappings(oidcConfigId)).toEqual(OLD_MAPPINGS);
    });

    it('reverts SAML permissionMappings keys to legacy boolean names', async () => {
      expect(await getSamlMappings(samlConfigId)).toEqual(OLD_MAPPINGS);
    });

    it('leaves null permissionMappings untouched on down', async () => {
      expect(await getOidcMappings(nullOidcConfigId)).toBeNull();
    });
  });
});
