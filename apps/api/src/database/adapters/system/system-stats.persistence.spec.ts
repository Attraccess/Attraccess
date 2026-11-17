import { entities, Project, Resource, ResourceUsage, Session, User } from '@attraccess/database-entities';
import { DataSource } from 'typeorm';
import { TypeOrmSystemStatsStore } from './typeorm-system-stats.store';

describe('TypeOrmSystemStatsStore on SQLite', () => {
  let source: DataSource;

  beforeAll(async () => {
    source = await new DataSource({
      type: 'sqlite',
      database: ':memory:',
      entities: Object.values(entities),
      synchronize: true,
    }).initialize();
    await source.query('PRAGMA foreign_keys = OFF');
  }, 30_000);

  afterAll(() => source.destroy());

  it('counts users, resources, projects, running published sessions and unexpired sign-ins', async () => {
    await source.query("INSERT INTO user (username, email) VALUES ('a', 'a@example.test'), ('b', 'b@example.test')");
    await source.query("INSERT INTO resource (id, name, type) VALUES (1, 'Lathe', 'machine')");
    await source.query("INSERT INTO project (userId, name) VALUES (1, 'P')");
    await source.query(
      "INSERT INTO resource_usage (usageAction, resourceId, startTime, endTime, isFinalized, lifecyclePending) VALUES ('usage', 1, CURRENT_TIMESTAMP, NULL, 1, 0), ('usage', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1, 0), ('usage', 1, CURRENT_TIMESTAMP, NULL, 1, 1)",
    );
    const sessions = source.getRepository(Session);
    await sessions.save([
      { token: 't1', userId: 1, expiresAt: new Date(Date.now() + 60_000) },
      { token: 't2', userId: 2, expiresAt: new Date(Date.now() - 60_000) },
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
