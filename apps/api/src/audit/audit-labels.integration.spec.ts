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
import {
  registerPluginAuditDomains,
  resetPluginAuditRegistry,
} from '../plugin-system/plugin-audit-registry';

const fixturePluginId = 'abcdefghijklmnopqrstu';

describe('persisted audit names', () => {
  let directory: string;
  let source: DataSource;
  let service: AuditService;
  let controller: AuditController;
  beforeEach(async () => {
    resetPluginAuditRegistry();
    registerPluginAuditDomains({ name: 'labels-fixture-plugin', id: fixturePluginId }, [
      {
        domain: 'demo',
        actions: [
          {
            action: 'demo.publication',
            subjectTypes: ['demo.device'],
            details: { revision: { type: 'number', integer: true, min: 1 } },
          },
        ],
      },
    ]);
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
    resetPluginAuditRegistry();
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

  it('retains recorded names after deletion and never joins plugin target IDs to core resources', async () => {
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
    expect(
      await service.record({
        pluginId: fixturePluginId,
        action: 'demo.publication',
        operationId: randomUUID(),
        principal: { userId: 7, authenticationMethod: 'session' },
        outcome: 'succeeded',
        subject: { type: 'demo.device', id: 7 },
        details: { revision: 2 },
      }),
    ).toEqual({ status: 'recorded' });
    const live = await controller.list({ limit: 50 });
    expect(live.items.find((entry) => entry.domain === 'demo')?.subjectLabel).toBeUndefined();
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
    expect(items.find((entry) => entry.domain === 'demo')).toMatchObject({ actorId: 7, subjectId: 7 });
    expect(items.find((entry) => entry.domain === 'demo')?.actorUsername).toBeUndefined();
    expect(await source.getRepository(AuditLog).count()).toBe(2);
  });

  it('uses recorded MQTT names without joining coincident resource IDs', async () => {
    await service.recordAdministration({
      action: 'mqtt_server.deleted',
      actorId: 7,
      subjectType: 'mqtt-server',
      subjectId: 7,
      details: { serverName: 'Former workshop broker', host: 'mqtt.example.test', port: 1883, useTls: 0 },
    });
    const { items } = await controller.list({ domain: 'administration' });
    expect(items).toEqual([
      expect.objectContaining({
        subjectId: 7,
        subjectLabel: 'Former workshop broker',
        subjectLabelSource: 'recorded',
      }),
    ]);
  });

  it('keeps recorded SSO provider names after deletion and labels provisioning targets as users', async () => {
    await source.getRepository(AuditLog).insert([
      {
        at: new Date(),
        domain: 'sso',
        pluginId: null,
        action: 'sso.provider.deleted',
        operationId: randomUUID(),
        actorId: 7,
        authenticationMethod: 'session',
        apiTokenId: null,
        outcome: 'succeeded',
        subjectType: 'sso.provider',
        subjectId: 7,
        details: { before: JSON.stringify({ id: 7, name: 'Former identity provider' }), after: 'null' },
      },
      {
        at: new Date(),
        domain: 'sso',
        pluginId: null,
        action: 'sso.provisioning.user_created',
        operationId: randomUUID(),
        actorId: null,
        authenticationMethod: null,
        apiTokenId: null,
        outcome: 'succeeded',
        subjectType: 'user',
        subjectId: 7,
        details: {},
      },
    ]);
    const { items } = await controller.list({ domain: 'sso', limit: 50 });
    expect(items.find((entry) => entry.subjectType === 'sso.provider')).toMatchObject({
      subjectLabel: 'Former identity provider',
      subjectLabelSource: 'recorded',
    });
    expect(items.find((entry) => entry.subjectType === 'user')).toMatchObject({
      subjectLabel: 'Current admin',
      subjectLabelSource: 'current',
    });
    expect(JSON.stringify(items)).not.toContain('private');
    await source.getRepository(User).delete(7);
    const deleted = await controller.list({ domain: 'sso', limit: 50 });
    expect(deleted.items.find((entry) => entry.subjectType === 'user')?.subjectLabel).toBeUndefined();
    expect(deleted.items.find((entry) => entry.subjectType === 'sso.provider')?.subjectLabel).toBe(
      'Former identity provider',
    );
  });
});
