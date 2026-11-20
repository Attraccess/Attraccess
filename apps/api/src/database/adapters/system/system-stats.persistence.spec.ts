import { Project, Resource, ResourceUsage, Session, User } from '@attraccess/database-entities';
import { ResourceType } from '@attraccess/application-models';
import { DataSource } from 'typeorm';
import { closeTestDataSource, createTestDataSource } from '../../../test-utils/test-database';
import { TypeOrmSystemStatsStore } from './typeorm-system-stats.store';

describe('TypeOrmSystemStatsStore on PostgreSQL', () => {
  let source: DataSource;

  beforeAll(async () => {
    source = await createTestDataSource();
  }, 30_000);

  afterAll(() => closeTestDataSource(source));

  it('counts users, resources, projects, running published sessions and unexpired sign-ins', async () => {
    const users = await source.getRepository(User).save([
      { username: 'a', email: 'a@example.test' },
      { username: 'b', email: 'b@example.test' },
    ]);
    const [{ id: resourceId }] = await source.getRepository(Resource).save([{ name: 'Lathe', type: ResourceType.Machine }]);
    await source.getRepository(Project).save({ userId: users[0].id, name: 'P' });
    const now = new Date();
    await source.getRepository(ResourceUsage).save([
      { usageAction: 'usage', resourceId, userId: users[0].id, startTime: now, endTime: null, isFinalized: true, lifecyclePending: false },
      { usageAction: 'usage', resourceId, userId: users[0].id, startTime: now, endTime: now, isFinalized: true, lifecyclePending: false },
      { usageAction: 'usage', resourceId, userId: users[0].id, startTime: now, endTime: null, isFinalized: true, lifecyclePending: true },
    ] as never);
    const sessions = source.getRepository(Session);
    await sessions.save([
      { token: 't1', userId: users[0].id, expiresAt: new Date(Date.now() + 60_000) },
      { token: 't2', userId: users[1].id, expiresAt: new Date(Date.now() - 60_000) },
    ] as Session[]);

    const store = new TypeOrmSystemStatsStore(
      source.getRepository(User),
      source.getRepository(Resource),
      source.getRepository(Project),
      source.getRepository(ResourceUsage),
      sessions,
    );

    expect(await store.readCounts()).toEqual({
      usersTotal: 2,
      resourcesTotal: 1,
      projectsTotal: 1,
      activeResourceUsageSessions: 1,
      activeAuthSessions: 1,
    });
  });
});
