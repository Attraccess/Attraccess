import { NetworkRestrictedAction } from '@attraccess/application-models';
import { Role, RoleNetworkAction, User, UserRole } from '@attraccess/database-entities';
import type { DataSource } from 'typeorm';
import { closeTestDataSource, createTestDataSource } from '../../../test-utils/test-database';
import { TypeOrmNetworkRestrictionStore } from './typeorm-network-restriction.store';

describe('role network actions on real PostgreSQL', () => {
  let source: DataSource;
  let store: TypeOrmNetworkRestrictionStore;
  let counter = 0;

  const createRole = async () => {
    counter += 1;
    return source.getRepository(Role).save({ key: `net-role-${counter}`, name: `Net ${counter}`, description: '' });
  };
  const createUser = async (...roles: Role[]) => {
    counter += 1;
    const user = await source
      .getRepository(User)
      .save({ username: `net-user-${counter}`, email: `net-${counter}@example.invalid`, isEmailVerified: true });
    for (const role of roles) await source.getRepository(UserRole).save({ userId: user.id, roleId: role.id });
    return user;
  };
  const rowsOf = (roleId: number) => source.getRepository(RoleNetworkAction).findBy({ roleId });

  beforeAll(async () => {
    source = await createTestDataSource();
    store = new TypeOrmNetworkRestrictionStore(
      source.getRepository(RoleNetworkAction),
      source.getRepository(Role),
      source.getRepository(UserRole),
      source,
    );
  }, 120_000);
  afterAll(() => closeTestDataSource(source));

  it('lets existing roles allow nothing from outside after the migration', async () => {
    const roles = await store.listRoleActions();
    expect(roles.length).toBeGreaterThanOrEqual(6);
    expect(roles.every((role) => role.actions.length === 0)).toBe(true);
  });

  it('starts a new role with no allowed actions', async () => {
    const role = await createRole();
    expect((await store.listRoleActions()).find((entry) => entry.roleId === role.id)?.actions).toEqual([]);
  });

  it('replaces the action set of the listed roles only', async () => {
    const [first, second] = [await createRole(), await createRole()];
    await store.replaceRoleActions([
      { roleId: first.id, actions: [NetworkRestrictedAction.UsageStart, NetworkRestrictedAction.DoorOpen] },
      { roleId: second.id, actions: [NetworkRestrictedAction.UsageEnd] },
    ]);
    await store.replaceRoleActions([{ roleId: first.id, actions: [NetworkRestrictedAction.DoorLock] }]);
    expect((await rowsOf(first.id)).map((row) => row.action)).toEqual([NetworkRestrictedAction.DoorLock]);
    expect((await rowsOf(second.id)).map((row) => row.action)).toEqual([NetworkRestrictedAction.UsageEnd]);
    await store.replaceRoleActions([{ roleId: first.id, actions: [] }]);
    expect(await rowsOf(first.id)).toEqual([]);
  });

  it('allows an action when any of the user roles allows it, and not otherwise', async () => {
    const [allowing, other, silent] = [await createRole(), await createRole(), await createRole()];
    await store.replaceRoleActions([
      { roleId: allowing.id, actions: [NetworkRestrictedAction.UsageStart, NetworkRestrictedAction.DoorOpen] },
      { roleId: other.id, actions: [NetworkRestrictedAction.DoorOpen, NetworkRestrictedAction.UsageEnd] },
    ]);
    const twoRoles = await createUser(allowing, silent);
    const bothAllowing = await createUser(allowing, other);
    const nobody = await createUser(silent);
    expect((await store.actionsAllowedForUser(twoRoles.id)).sort()).toEqual(
      [NetworkRestrictedAction.DoorOpen, NetworkRestrictedAction.UsageStart].sort(),
    );
    expect(await store.actionsAllowedForUser(bothAllowing.id)).toHaveLength(3);
    expect(await store.actionsAllowedForUser(nobody.id)).toEqual([]);
  });

  it('removes the entries of a deleted role', async () => {
    const role = await createRole();
    await store.replaceRoleActions([{ roleId: role.id, actions: [NetworkRestrictedAction.UsageTakeover] }]);
    await source.getRepository(Role).delete(role.id);
    expect(await rowsOf(role.id)).toEqual([]);
  });

  it('rejects entries for a role that does not exist', async () => {
    await expect(
      store.replaceRoleActions([{ roleId: 987654, actions: [NetworkRestrictedAction.UsageStart] }]),
    ).rejects.toThrow();
    expect(await store.existingRoleIds([987654])).toEqual([]);
  });

  it('ignores stored action keys it does not know (for example after a downgrade)', async () => {
    const role = await createRole();
    await source.getRepository(RoleNetworkAction).insert({ roleId: role.id, action: 'usage.fly' });
    const user = await createUser(role);
    expect(await store.actionsAllowedForUser(user.id)).toEqual([]);
    expect((await store.listRoleActions()).find((entry) => entry.roleId === role.id)?.actions).toEqual([]);
  });
});
