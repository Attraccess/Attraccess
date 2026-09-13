import { AuditLog, entities, Resource, ResourceType, Setting, User } from '@attraccess/database-entities';
import { DataSource } from 'typeorm';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import * as migrations from '../database/migrations';
import { SettingsStoreService } from '../settings/settings-store.service';
import { AuditService } from './audit.service';
import { AuditController } from './audit.controller';

describe('persisted audit names', () => {
  let directory: string;
  let source: DataSource;
  let service: AuditService;
  let controller: AuditController;
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'audit-labels-'));
    source = await new DataSource({
      type: 'sqlite',
      database: join(directory, 'fixture.sqlite'),
      entities: Object.values(entities),
      migrations: Object.values(migrations),
    }).initialize();
    await source.runMigrations();
    service = new AuditService(source, new SettingsStoreService(source.getRepository(Setting), null));
    await service.onModuleInit();
    controller = new AuditController(service);
    await source
      .getRepository(User)
      .insert({
        id: 7,
        username: 'Current admin',
        email: 'private@example.test',
        passwordResetToken: 'private-reset-token',
      });
    await source
      .getRepository(Resource)
      .insert({
        id: 7,
        name: 'Current lathe',
        type: ResourceType.Machine,
        documentationMarkdown: 'private documentation',
      });
  }, 60_000);
  afterEach(async () => {
    await service?.onModuleDestroy();
    if (source?.isInitialized) await source.destroy();
    await rm(directory, { recursive: true, force: true });
  });

  it('returns readable current names from persisted events without selecting private entity fields', async () => {
    await service.recordResource({
      action: 'maintenance_schedule.updated',
      actorId: 7,
      subjectId: 7,
      details: { scheduleId: 3, name: 'Monthly oiling' },
    });
    const queries: string[] = [];
    const queryRunner = source.createQueryRunner();
    const query = queryRunner.query.bind(queryRunner);
    const spy = jest.spyOn(queryRunner, 'query').mockImplementation((...args: Parameters<typeof query>) => {
      queries.push(args[0]);
      return query(...args);
    });
    const { items } = await controller.list({ limit: 50 });
    spy.mockRestore();
    expect(items).toEqual([
      expect.objectContaining({
        actorId: 7,
        actorUsername: 'Current admin',
        actorUsernameSource: 'current',
        subjectId: 7,
        subjectLabel: 'Current lathe',
        subjectLabelSource: 'current',
      }),
    ]);
    const nameQueries = queries.filter((sql) => sql.includes('"subject"'));
    expect(nameQueries).toHaveLength(2);
    expect(nameQueries.join('\n')).not.toMatch(/email|password|documentation|SELECT \*/i);
    expect(JSON.stringify(items)).not.toContain('private');
  });

  it('retains recorded names after deletion and never joins WAGO target IDs to core resources', async () => {
    await source
      .getRepository(AuditLog)
      .insert([
        {
          at: new Date(),
          domain: 'resource',
          pluginId: 'core',
          action: 'resource.deleted',
          operationId: randomUUID(),
          actorId: 7,
          authenticationMethod: 'session',
          apiTokenId: null,
          outcome: 'succeeded',
          subjectType: 'resource',
          subjectId: 7,
          details: { actorUsername: 'Original admin', 'before.name': 'Original lathe' },
        },
      ]);
    await service.record({
      pluginId: 'abcdefghijklmnopqrstu',
      action: 'wago.publication',
      operationId: randomUUID(),
      principal: { userId: 7, authenticationMethod: 'session' },
      outcome: 'succeeded',
      subject: { type: 'wago.controller', id: 7 },
      details: { revision: 2 },
    });
    const live = await controller.list({ limit: 50 });
    expect(live.items.find((entry) => entry.domain === 'wago')?.subjectLabel).toBeUndefined();
    await source.getRepository(Resource).delete(7);
    await source.getRepository(User).delete(7);
    const { items } = await controller.list({ limit: 50 });
    expect(items.find((entry) => entry.domain === 'resource')).toMatchObject({
      actorId: 7,
      actorUsername: 'Original admin',
      actorUsernameSource: 'recorded',
      subjectId: 7,
      subjectLabel: 'Original lathe',
      subjectLabelSource: 'recorded',
    });
    expect(items.find((entry) => entry.domain === 'wago')).toMatchObject({ actorId: 7, subjectId: 7 });
    expect(items.find((entry) => entry.domain === 'wago')?.actorUsername).toBeUndefined();
    expect(await source.getRepository(AuditLog).count()).toBe(2);
  });
});
