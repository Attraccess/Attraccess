import { createMock } from '@golevelup/ts-jest';
import { entities, Role, User, UserRole } from '@attraccess/database-entities';
import { UserRoleSource } from '@attraccess/application-models';
import { DataSource } from 'typeorm';
import * as migrations from '../../database/migrations';
import { createDataSource } from '../../database/sqlite/sqlite-connection';
import { LicenseService } from '../../license/license.service';
import { MetricsService } from '../../metrics/metrics.service';
import { RbacService } from '../rbac/rbac.service';
import { UsersService } from './users.service';
import { composeUsersService } from './fixtures/compose.test-fixture';

describe('taking back invitations whose email failed', () => {
  let source: DataSource;
  let users: UsersService;

  beforeAll(async () => {
    source = await createDataSource({
      type: 'sqlite',
      database: ':memory:',
      entities: Object.values(entities),
      migrations: Object.values(migrations),
    }).initialize();
    await source.runMigrations();
    users = composeUsersService(
      source.getRepository(User),
      undefined,
      undefined,
      undefined,
      createMock<LicenseService>(),
      undefined,
      source,
      undefined,
      createMock<MetricsService>(),
      createMock<RbacService>(),
      undefined,
    );
  }, 60_000);

  afterAll(async () => {
    if (source?.isInitialized) await source.destroy();
  });

  it('deletes invited users with their roles, but keeps those who already accepted', async () => {
    const [role] = await source.getRepository(Role).find({ where: { isDefault: true } });
    const invite = async (username: string, isEmailVerified: boolean) => {
      const user = await source.getRepository(User).save(
        Object.assign(new User(), {
          username,
          email: `${username}@example.test`,
          externalIdentifier: null,
          locale: 'und',
          isEmailVerified,
        }),
      );
      await source.getRepository(UserRole).save({ userId: user.id, roleId: role.id, source: UserRoleSource.MANUAL });
      return user.id;
    };
    const pending = await invite('pending', false);
    const accepted = await invite('accepted', true);

    await users.deleteUnacceptedInvitations([pending, accepted]);

    expect((await source.getRepository(User).find()).map((user) => user.username)).toEqual(['accepted']);
    expect(await source.getRepository(UserRole).findBy({ userId: pending })).toEqual([]);
    expect(await source.getRepository(UserRole).findBy({ userId: accepted })).toHaveLength(1);
  });
});
