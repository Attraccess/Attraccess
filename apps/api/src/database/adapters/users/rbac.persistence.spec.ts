import { EventEmitter2 } from '@nestjs/event-emitter';
import { ForbiddenException } from '@nestjs/common';
import { UserRoleSource } from '@attraccess/application-models';
import { DataSource } from 'typeorm';
import { RbacService } from '../../../users-and-auth/rbac/rbac.service';
import { TransactionContextResolver } from '../transaction-context';
import { unitOfWorkFor } from '../shared-unit-of-work';
import { PostgresDatabaseFixture } from '../postgres-database.test-fixture';
import { TypeOrmRbacStore } from './typeorm-rbac.store';

interface Stack {
  source: DataSource;
  uow: ReturnType<typeof unitOfWorkFor>;
  store: TypeOrmRbacStore;
  service: RbacService;
}

describe('RBAC persistence adapter on real PostgreSQL', () => {
  let fixture: PostgresDatabaseFixture;
  let stack: Stack;

  const open = async (): Promise<Stack> => {
    const source = await fixture.open();
    const uow = unitOfWorkFor(source);
    const store = new TypeOrmRbacStore(source, new TransactionContextResolver(source, uow));
    const service = new RbacService(store, uow, new EventEmitter2(), null, { record: jest.fn() } as never);
    return { source, uow, store, service };
  };

  const query = (sql: string, parameters?: unknown[]) => stack.source.query(sql, parameters);
  const roleKeys = async (userId: number) =>
    (
      await query(
        'SELECT r."key" AS "key" FROM "user_role" ur JOIN "role" r ON r."id" = ur."roleId" WHERE ur."userId" = $1 ORDER BY r."key"',
        [userId],
      )
    ).map((row: { key: string }) => row.key);

  /** A trigger that rejects the inserts matching `when` (a plpgsql condition on NEW). */
  const failInsert = async (name: string, table: string, when: string, message: string) => {
    await query(
      `CREATE FUNCTION "${name}_fn"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF ${when} THEN RAISE EXCEPTION '${message}'; END IF; RETURN NEW; END $$`,
    );
    await query(`CREATE TRIGGER "${name}" BEFORE INSERT ON "${table}" FOR EACH ROW EXECUTE FUNCTION "${name}_fn"()`);
  };
  const dropFailure = async (name: string, table: string) => {
    await query(`DROP TRIGGER "${name}" ON "${table}"`);
    await query(`DROP FUNCTION "${name}_fn"()`);
  };

  beforeAll(async () => {
    fixture = await PostgresDatabaseFixture.create();
    stack = await open();
    // the released track has this unique constraint (UQ_user_role)
    await stack.source.query(
      'ALTER TABLE "user_role" ADD CONSTRAINT "uq_user_role_assignment" UNIQUE ("userId", "roleId", "source")',
    );
  }, 60_000);

  afterAll(async () => {
    await fixture.close();
  });

  beforeEach(async () => {
    for (const table of ['user_role', 'role_permission', 'role', 'permission', 'user']) {
      await query(`DELETE FROM "${table}"`);
    }
    await query(
      `INSERT INTO "permission" ("key", "label", "description", "category") VALUES ('a.read','a','a','a'),('b.write','b','b','b')`,
    );
    await query(
      `INSERT INTO "role" ("id", "key", "name", "description", "isSystemManaged", "isDefault") VALUES (1,'administrator','Admin','',true,false),(2,'member','Member','',false,true),(3,'custom','Custom','',false,false),(4,'other','Other','',false,false)`,
    );
    await query(
      `INSERT INTO "role_permission" ("roleId", "permissionKey") VALUES (1,'a.read'),(1,'b.write'),(2,'a.read'),(3,'b.write')`,
    );
    await query(
      `INSERT INTO "user" ("id", "username", "email") VALUES (10,'a','a@example.test'),(11,'b','b@example.test'),(12,'c','c@example.test')`,
    );
    // rows with explicit ids do not advance the sequences
    await query(
      `SELECT setval(pg_get_serial_sequence('role', 'id'), 100), setval(pg_get_serial_sequence('user', 'id'), 100)`,
    );
  });

  describe('reads', () => {
    it('answers effective permissions and holders, ignoring soft-deleted users for holders', async () => {
      await query(
        'INSERT INTO "user_role" ("userId", "roleId", "source") VALUES (10, 2, $1), (10, 3, $2), (11, 3, $3)',
        ['manual', 'manual', 'manual'],
      );
      await query('UPDATE "user" SET "deletedAt" = CURRENT_TIMESTAMP WHERE id = 11');

      expect((await stack.store.permissionKeysOf(10)).sort()).toEqual(['a.read', 'b.write']);
      expect(await stack.store.userIdsWithPermission('b.write')).toEqual([10]);
    });

    it('maps roles with permissions and user roles with their role, without private fields', async () => {
      await query(`INSERT INTO "user_role" ("userId", "roleId", "source") VALUES (10, 2, 'manual')`);

      const [assignment] = await stack.store.findUserRoles(10);
      const role = await stack.store.findRoleByKey('member', undefined, { withPermissions: true });

      expect(assignment).toMatchObject({ userId: 10, roleId: 2, source: 'manual', role: { key: 'member' } });
      expect(role?.rolePermissions?.map((rp) => rp.permissionKey)).toEqual(['a.read']);
      // Without the option only the role row is read, as assigning a role by key needs.
      expect(await stack.store.findRoleByKey('member')).not.toHaveProperty('rolePermissions');
      expect(await stack.store.roleKeyOf(3)).toBe('custom');
      expect(await stack.store.roleKeyOf(99)).toBeNull();
      const withUsage = await stack.store.listRolesWithUserCounts();
      expect(withUsage.find((r) => r.key === 'member')?.userCount).toBe(1);
    });

    it('counts administrator-equivalent users and detects the last administrator', async () => {
      await query(`INSERT INTO "user_role" ("userId", "roleId", "source") VALUES (10, 1, 'manual'), (11, 2, 'manual')`);

      expect(await stack.store.countAdministratorEquivalentUsers()).toBe(1);
      expect(await stack.store.countAdministratorEquivalentUsers(1)).toBe(0);
      expect(await stack.store.isLastAdministrator(10)).toBe(true);
      expect(await stack.store.isLastAdministrator(11)).toBe(false);

      await query(`INSERT INTO "user_role" ("userId", "roleId", "source") VALUES (12, 1, 'manual')`);
      expect(await stack.store.isLastAdministrator(10)).toBe(false);
      await query('UPDATE "user" SET "deletedAt" = CURRENT_TIMESTAMP WHERE id = 12');
      expect(await stack.store.isLastAdministrator(10)).toBe(true);
    });
  });

  describe('syncSsoAssignments', () => {
    const sync = (targets: Array<{ roleKey: string; externalValue?: string }>, userId = 10, providerId = 5) =>
      stack.uow.run((scope) => stack.store.syncSsoAssignments(userId, targets, 'oidc', providerId, scope));
    const sso = (userId: number, roleId: number, providerId = 5, externalValue: string | null = null) =>
      query(
        'INSERT INTO "user_role" ("userId", "roleId", "source", "ssoProviderType", "ssoProviderId", "externalValue") VALUES ($1, $2, $3, $4, $5, $6)',
        [userId, roleId, UserRoleSource.SSO, 'oidc', providerId, externalValue],
      );

    it('adds missing, refreshes changed and removes dropped assignments of the provider', async () => {
      await sso(10, 2, 5, 'old');
      await sso(10, 3, 5);

      const changes = await sync([{ roleKey: 'member', externalValue: 'new' }, { roleKey: 'other' }]);

      expect(changes).toEqual({ added: ['other'], removed: ['custom'], updated: ['member'] });
      expect(await roleKeys(10)).toEqual(['member', 'other']);
    });

    it('skips removing the administrator role when it is the last administrator, and removes it otherwise', async () => {
      await sso(10, 1);

      expect(await sync([])).toEqual({ added: [], removed: [], updated: [] });
      expect(await roleKeys(10)).toEqual(['administrator']);

      await query(`INSERT INTO "user_role" ("userId", "roleId", "source") VALUES (11, 1, 'manual')`);
      expect(await sync([])).toEqual({ added: [], removed: ['administrator'], updated: [] });
    });

    it('ignores a role another provider already granted and roles that do not exist', async () => {
      await sso(10, 2, 9);

      const changes = await sync([{ roleKey: 'member' }, { roleKey: 'missing' }]);

      expect(changes).toEqual({ added: [], removed: [], updated: [] });
    });

    it('does not touch manual assignments or other providers', async () => {
      await query(`INSERT INTO "user_role" ("userId", "roleId", "source") VALUES (10, 2, 'manual')`);
      await sso(10, 3, 9);

      await sync([]);

      expect(await roleKeys(10)).toEqual(['custom', 'member']);
    });

    it('rolls the entire sync back when a later mutation fails', async () => {
      await sso(10, 3);
      await failInsert('fail_sso_insert', 'user_role', 'NEW."roleId" = 4', 'insert aborted');

      await expect(sync([{ roleKey: 'other' }])).rejects.toThrow('insert aborted');

      expect(await roleKeys(10)).toEqual(['custom']);
      await dropFailure('fail_sso_insert', 'user_role');
    });
  });

  describe('role writes', () => {
    it('creates a role and its permission grants atomically', async () => {
      const created = await stack.store.createRole({ key: 'lab', name: 'Lab', description: '' }, ['a.read']);
      expect(created.rolePermissions?.map((rp) => rp.permissionKey)).toEqual(['a.read']);

      await failInsert(
        'fail_grant',
        'role_permission',
        `NEW."permissionKey" = 'b.write' AND NEW."roleId" > 4`,
        'grant aborted',
      );
      await expect(
        stack.store.createRole({ key: 'lab2', name: 'Lab 2', description: '' }, ['a.read', 'b.write']),
      ).rejects.toThrow('grant aborted');
      expect(await stack.store.roleKeyTaken('lab2')).toBe(false);
      await dropFailure('fail_grant', 'role_permission');
    });

    it('rolls a permission change back when the lockout guard rejects it', async () => {
      await query(`INSERT INTO "user_role" ("userId", "roleId", "source") VALUES (10, 3, 'manual'), (10, 2, 'manual')`);
      const audit = { record: jest.fn() };
      const service = new RbacService(stack.store, stack.uow, new EventEmitter2(), null, audit as never);
      const actor = new Set(['a.read', 'b.write']);

      // user 10 holds a.read (member) + b.write (custom) = every permission: administrator-equivalent
      await expect(
        service.updateRole(3, { permissionKeys: [] }, actor, { actor: { id: 1, authenticationMethod: 'session' } }),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect((await stack.store.findRoleById(3))?.rolePermissions?.map((rp) => rp.permissionKey)).toEqual(['b.write']);
    });

    it('reassigns the holders and deletes the role in one unit of work', async () => {
      await query(
        `INSERT INTO "user_role" ("userId", "roleId", "source") VALUES (10, 3, 'manual'), (11, 3, 'manual'), (11, 4, 'manual')`,
      );

      await stack.uow.run(async (scope) => {
        await stack.store.reassignRoleHolders(3, 4, scope);
        await stack.store.deleteRole(3, scope);
      });

      expect(await roleKeys(10)).toEqual(['other']);
      expect(await roleKeys(11)).toEqual(['other']);
      expect(await stack.store.findRoleById(3)).toBeNull();
    });

    it('does not delete the role when the reassignment fails', async () => {
      await query(`INSERT INTO "user_role" ("userId", "roleId", "source") VALUES (10, 3, 'manual')`);
      await failInsert('fail_reassign', 'user_role', 'NEW."roleId" = 4', 'reassign aborted');

      await expect(
        stack.uow.run(async (scope) => {
          await stack.store.reassignRoleHolders(3, 4, scope);
          await stack.store.deleteRole(3, scope);
        }),
      ).rejects.toThrow('reassign aborted');

      expect(await stack.store.findRoleById(3)).not.toBeNull();
      await dropFailure('fail_reassign', 'user_role');
    });
  });

  describe('role assignment atomicity', () => {
    it('lets exactly one of two concurrent administrator revocations through, on independent connections', async () => {
      await query(`INSERT INTO "user_role" ("userId", "roleId", "source") VALUES (10, 1, 'manual'), (11, 1, 'manual')`);
      const second = await open();
      const actor = new Set(['a.read', 'b.write']);

      const results = await Promise.allSettled([
        stack.service.revokeRole(10, 1, actor),
        second.service.revokeRole(11, 1, actor),
      ]);

      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
      expect(rejected.reason).toBeInstanceOf(ForbiddenException);
      expect(await stack.store.countActiveRoleHolders(1)).toBe(1);
    });

    it('assigns a role by key inside a caller scope that rolls back', async () => {
      await expect(
        stack.uow.run(async (scope) => {
          await stack.service.assignRoleByKey(10, 'custom', scope);
          expect(await stack.store.findManualAssignment(10, 3, scope)).not.toBeNull();
          throw new Error('abort registration');
        }),
      ).rejects.toThrow('abort registration');

      expect(await roleKeys(10)).toEqual([]);
    });
  });
});
