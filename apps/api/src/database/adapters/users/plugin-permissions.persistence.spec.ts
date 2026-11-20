import {
  ApiToken,
  Permission,
  Role,
  RolePermission,
  User,
  UserRole,
  UserRoleSource,
} from '@attraccess/database-entities';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { SYSTEM_PERMISSIONS } from '@attraccess/shared';
import { DataSource } from 'typeorm';
import { SYSTEM_AUDIT_ACTOR } from '../../../audit/recorder/audit-event';
import { TokenHashService } from '../../../encryption/token-hash.service';
import { DeclaredPluginPermission } from '../../../plugin-system/runtime/plugin-permissions';
import { ApiTokenService } from '../../../users-and-auth/auth/api-token/api-token.service';
import { PluginPermissionSyncService } from '../../../users-and-auth/rbac/plugin-permission-sync.service';
import { RbacService } from '../../../users-and-auth/rbac/rbac.service';
import { UserPermissionsChangedEvent } from '../../../users-and-auth/rbac/events/user-permissions-changed.event';
import { closeTestDataSource, createTestDataSource } from '../../../test-utils/test-database';
import { TypeOrmApiTokenStore } from '../auth/typeorm-api-token.store';
import { TypeOrmSessionUserDirectory } from '../sessions/typeorm-session-user-directory';
import { unitOfWorkFor } from '../shared-unit-of-work';
import { TransactionContextResolver } from '../transaction-context';
import { TypeOrmPluginPermissionCatalogStore } from './typeorm-plugin-permission-catalog.store';
import { TypeOrmRbacStore } from './typeorm-rbac.store';

const origin = { actor: SYSTEM_AUDIT_ACTOR };
const all = new Set<string>([...SYSTEM_PERMISSIONS, 'acme.widgets.read', 'acme.widgets.manage']);

const declared = (overrides: Partial<DeclaredPluginPermission> = {}): DeclaredPluginPermission => ({
  key: 'acme.widgets.read',
  pluginName: 'acme',
  label: { en: 'View widgets', de: 'Widgets ansehen' },
  description: { en: 'Lists widgets', de: 'Listet Widgets' },
  category: { en: 'Acme', de: 'Acme DE' },
  defaultRoles: ['resource-manager'],
  ...overrides,
});
const ACME = [declared(), declared({ key: 'acme.widgets.manage', defaultRoles: [] })];

// The services on the real adapters and a database at the current release.
describe('plugin-declared permissions on real PostgreSQL', () => {
  let source: DataSource;
  let rbac: RbacService;
  let sync: PluginPermissionSyncService;
  let tokens: ApiTokenService;
  let roleId: (key: string) => Promise<number>;
  let grantsOf: (key: string) => Promise<string[]>;
  let userCount = 0;

  const createUser = async (...roleKeys: string[]): Promise<number> => {
    userCount++;
    const user = await source.getRepository(User).save(
      source.getRepository(User).create({
        username: `user${userCount}`,
        email: `user${userCount}@example.com`,
        isEmailVerified: true,
      }),
    );
    for (const key of roleKeys) {
      await source
        .getRepository(UserRole)
        .save({ userId: user.id, roleId: await roleId(key), source: UserRoleSource.MANUAL });
    }
    return user.id;
  };

  beforeEach(async () => {
    source = await createTestDataSource();
    const uow = unitOfWorkFor(source);
    const resolver = new TransactionContextResolver(source, uow);
    rbac = new RbacService(new TypeOrmRbacStore(source, resolver), uow, new EventEmitter2(), null, {
      record: jest.fn().mockResolvedValue({ status: 'recorded' }),
    } as never);
    sync = new PluginPermissionSyncService(new TypeOrmPluginPermissionCatalogStore(resolver), uow, rbac);
    tokens = new ApiTokenService(
      new TypeOrmApiTokenStore(source.getRepository(ApiToken), uow),
      new TypeOrmSessionUserDirectory(source.getRepository(User)),
      new TokenHashService({ get: () => ({ AUTH_SESSION_SECRET: 'plugin-permissions-secret' }) } as never),
      rbac,
    );
    roleId = async (key) => (await source.getRepository(Role).findOneByOrFail({ key })).id;
    grantsOf = async (key) =>
      (await source.getRepository(RolePermission).find({ where: { roleId: await roleId(key) } }))
        .map((grant) => grant.permissionKey)
        .filter((permission) => permission.startsWith('acme.'))
        .sort();
  });

  afterEach(async () => {
    await closeTestDataSource(source);
  });

  it('keeps core rows unchanged: no owner, available', async () => {
    const rows = await source.getRepository(Permission).find();
    expect(rows.map((row) => row.key).sort()).toEqual([...SYSTEM_PERMISSIONS].sort());
    expect(rows.every((row) => row.pluginName === null && row.available === true && row.labelDe === null)).toBe(true);
  });

  it('registers keys with owner and translations, granting default roles and administrator', async () => {
    const result = await sync.sync(ACME);

    expect(result.registered).toEqual(['acme.widgets.read', 'acme.widgets.manage']);
    expect(await source.getRepository(Permission).findOneByOrFail({ key: 'acme.widgets.read' })).toMatchObject({
      pluginName: 'acme',
      label: 'View widgets',
      labelDe: 'Widgets ansehen',
      descriptionDe: 'Listet Widgets',
      category: 'plugin:acme',
      categoryLabel: 'Acme',
      categoryLabelDe: 'Acme DE',
      available: true,
    });
    expect(await grantsOf('administrator')).toEqual(['acme.widgets.manage', 'acme.widgets.read']);
    expect(await grantsOf('resource-manager')).toEqual(['acme.widgets.read']);
    expect(await grantsOf('system-admin')).toEqual([]);
    expect((await rbac.getPermissions()).map((permission) => permission.key)).toContain('acme.widgets.manage');
  });

  it('grants default roles only on first registration but re-grants administrator every boot', async () => {
    await sync.sync(ACME);
    await source.getRepository(RolePermission).delete({ permissionKey: 'acme.widgets.read' });

    const second = await sync.sync(ACME);

    expect(second.registered).toEqual([]);
    expect(await grantsOf('resource-manager')).toEqual([]);
    expect(await grantsOf('administrator')).toEqual(['acme.widgets.manage', 'acme.widgets.read']);
  });

  it('hides keys no loaded plugin declares, grants nothing, keeps grants and restores them on reload', async () => {
    await sync.sync(ACME);
    const admin = await createUser('administrator');
    const manager = await createUser('resource-manager');
    expect(await rbac.getEffectivePermissions(manager, true)).toContain('acme.widgets.read');

    // a newer version drops one key
    expect((await sync.sync([ACME[0]])).madeUnavailable).toEqual(['acme.widgets.manage']);
    expect(await rbac.getEffectivePermissions(admin, true)).not.toContain('acme.widgets.manage');

    // the plugin is uninstalled, quarantined or failed to load
    expect((await sync.sync([])).madeUnavailable).toEqual(['acme.widgets.read']);
    expect((await rbac.getPermissions()).some((permission) => permission.key.startsWith('acme.'))).toBe(false);
    expect(await rbac.getEffectivePermissions(manager, true)).not.toContain('acme.widgets.read');
    expect(await rbac.getUserIdsWithPermission('acme.widgets.read')).toEqual([]);
    const listed = (await rbac.getRolesWithUsage()).find((role) => role.key === 'resource-manager');
    expect(listed?.rolePermissions?.some((grant) => grant.permissionKey.startsWith('acme.'))).toBe(false);
    expect(await grantsOf('resource-manager')).toEqual(['acme.widgets.read']);
    expect(await source.getRepository(Permission).countBy({ pluginName: 'acme' })).toBe(2);

    const back = await sync.sync(ACME);
    expect(back.madeAvailable).toEqual(['acme.widgets.read', 'acme.widgets.manage']);
    expect(await rbac.getEffectivePermissions(manager, true)).toContain('acme.widgets.read');
    expect(await rbac.getEffectivePermissions(admin, true)).toContain('acme.widgets.manage');
  });

  it('invalidates cached permission sets when availability changes', async () => {
    await sync.sync(ACME);
    const manager = await createUser('resource-manager');
    expect(await rbac.getEffectivePermissions(manager)).toContain('acme.widgets.read');

    await sync.sync([]);

    expect(await rbac.getEffectivePermissions(manager)).not.toContain('acme.widgets.read');
  });

  it('drops cached permission sets when another instance reports a change', async () => {
    await sync.sync(ACME);
    const manager = await createUser('resource-manager');
    expect(await rbac.getEffectivePermissions(manager)).toContain('acme.widgets.read');
    // another instance marked the key unavailable; its invalidation arrives as a local event
    await source.getRepository(Permission).update({ key: 'acme.widgets.read' }, { available: false });
    expect(await rbac.getEffectivePermissions(manager)).toContain('acme.widgets.read');

    rbac.onPermissionsChanged(new UserPermissionsChangedEvent());

    expect(await rbac.getEffectivePermissions(manager)).not.toContain('acme.widgets.read');
  });

  it('keeps hidden grants when a role is updated from a client that cannot see them', async () => {
    await sync.sync(ACME);
    const role = await rbac.createRole(
      { name: 'Widgets', permissionKeys: ['resources.read', 'acme.widgets.manage'] },
      all,
      origin,
    );
    await sync.sync([]);

    const updated = await rbac.updateRole(role.id, { permissionKeys: ['resources.update'] }, all, origin);

    expect(updated.rolePermissions?.map((grant) => grant.permissionKey)).toEqual(['resources.update']);
    const stored = await source.getRepository(RolePermission).find({ where: { roleId: role.id } });
    expect(stored.map((grant) => grant.permissionKey).sort()).toEqual(['acme.widgets.manage', 'resources.update']);
    // echoing the hidden key back is harmless, but it cannot be granted while hidden
    await rbac.updateRole(role.id, { permissionKeys: ['resources.update', 'acme.widgets.manage'] }, all, origin);
    await expect(
      rbac.createRole({ name: 'Other', permissionKeys: ['acme.widgets.read'] }, all, origin),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('keeps the last-admin lockout guard working with plugin keys present and hidden', async () => {
    await sync.sync(ACME);
    const full = await rbac.createRole({ name: 'Full', permissionKeys: [...all] }, all, origin);
    await createUser(); // holds nothing
    const owner = await createUser();
    await source.getRepository(UserRole).save({ userId: owner, roleId: full.id, source: UserRoleSource.MANUAL });

    await expect(
      rbac.updateRole(full.id, { permissionKeys: [...all].filter((key) => key !== 'acme.widgets.read') }, all, origin),
    ).rejects.toBeInstanceOf(ForbiddenException);

    // hidden keys do not count: the full role stays administrator-equivalent and the guard still holds
    await sync.sync([]);
    await expect(
      rbac.updateRole(full.id, { permissionKeys: [...SYSTEM_PERMISSIONS].slice(1) }, all, origin),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('counts dormant grants of hidden keys when an actor assigns, revokes or deletes a role', async () => {
    await sync.sync(ACME);
    const operators = await rbac.createRole(
      { name: 'Widget operators', permissionKeys: ['users.read', 'acme.widgets.manage'] },
      all,
      origin,
    );
    const target = await createUser();
    const userManager = await createUser('user-manager');
    const admin = await createUser('administrator');
    await sync.sync([]);

    // the user-manager never held acme.widgets.manage, so it cannot hand out the dormant grant
    const managerCeiling = await rbac.getGrantCeiling({
      id: userManager,
      effectivePermissions: await rbac.getEffectivePermissions(userManager, true),
      authenticationMethod: 'session',
    });
    expect(managerCeiling.has('acme.widgets.manage')).toBe(false);
    await expect(rbac.assignRole(target, operators.id, managerCeiling)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(rbac.deleteRole(operators.id, managerCeiling, origin)).rejects.toBeInstanceOf(ForbiddenException);

    // an API token reaches a dormant key only when its own scope grants it, like its other grants
    const adminEffective = await rbac.getEffectivePermissions(admin, true);
    const token = (permissionScope: string[]) =>
      rbac.getGrantCeiling({
        id: admin,
        effectivePermissions: adminEffective,
        authenticationMethod: 'api-token',
        permissionScope,
      });
    await expect(rbac.assignRole(target, operators.id, await token(['users.read']))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect((await token([...all])).has('acme.widgets.manage')).toBe(true);

    // the administrator's session holds every key, dormant ones included
    const adminCeiling = await rbac.getGrantCeiling({ id: admin, effectivePermissions: adminEffective });
    expect(adminCeiling.has('acme.widgets.manage')).toBe(true);
    await rbac.assignRole(target, operators.id, adminCeiling);
    await rbac.revokeRole(target, operators.id, adminCeiling);
    await rbac.deleteRole(operators.id, adminCeiling, origin, await roleId('resource-manager'));
  });

  it('lets plugin keys reach SSO users through their roles', async () => {
    await sync.sync(ACME);
    const user = await createUser();

    await rbac.syncSsoRoles(user, [{ roleKey: 'resource-manager', externalValue: 'staff' }], 'oidc', 1);

    expect(await rbac.getEffectivePermissions(user, true)).toContain('acme.widgets.read');
  });

  it('scopes API tokens to plugin keys and keeps hidden token grants on update', async () => {
    await sync.sync(ACME);
    const admin = await createUser('administrator');
    const { apiToken } = await tokens.create(admin, { name: 'ci', permissionKeys: ['acme.widgets.read'] });
    await sync.sync([]);

    expect((await tokens.list(admin, 1, 10)).data[0].permissionKeys).toEqual([]);
    await expect(tokens.create(admin, { name: 'new', permissionKeys: ['acme.widgets.read'] })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    const updated = await tokens.update(admin, apiToken.id, { permissionKeys: ['resources.read'] });

    expect(updated.permissionKeys).toEqual(['resources.read']);
    const stored = await source.getRepository(ApiToken).findOneOrFail({
      where: { id: apiToken.id },
      relations: { apiTokenPermissions: true },
    });
    expect(stored.permissionKeys.sort()).toEqual(['acme.widgets.read', 'resources.read']);
  });

  it('skips a key another plugin or core owns instead of taking it over', async () => {
    await sync.sync(ACME);

    const result = await sync.sync([
      declared({ pluginName: 'intruder' }),
      declared({ key: 'resources.read', pluginName: 'intruder' }),
    ]);

    expect(result.registered).toEqual([]);
    expect(await source.getRepository(Permission).findOneByOrFail({ key: 'acme.widgets.read' })).toMatchObject({
      pluginName: 'acme',
      available: false,
    });
    expect(await source.getRepository(Permission).findOneByOrFail({ key: 'resources.read' })).toMatchObject({
      pluginName: null,
      label: 'Read Resources',
    });
  });
});
