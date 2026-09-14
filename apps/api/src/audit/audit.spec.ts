import { AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import { PluginModule } from '../plugin-system/plugin.module';
import { PluginService } from '../plugin-system/plugin.service';
import { PluginSandboxService } from '../plugin-system/plugin-sandbox.service';
import { PluginEventsService } from '../plugin-system/plugin-events.service';
import { PluginMqttService } from '../plugin-system/plugin-mqtt.service';
import { NpmPluginService } from '../plugin-system/npm-plugin.service';
import { PluginClassificationService } from '../plugin-system/plugin-classification.service';
import { MqttModule } from '../mqtt/mqtt.module';
import * as pluginLoader from '../plugin-system/plugin-loader';
import { PluginContext } from '@attraccess/plugins-backend-sdk';
import { EventEmitter2 } from '@nestjs/event-emitter';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { SessionStrategy } from '../users-and-auth/strategies/session.strategy';
import { SessionService } from '../users-and-auth/auth/session.service';
import { TwoFactorService } from '../users-and-auth/auth/two-factor.service';
import { RbacService } from '../users-and-auth/rbac/rbac.service';
import { ApiTokenService } from '../users-and-auth/auth/api-token/api-token.service';
import { AuthAuditLogger } from '../users-and-auth/rate-limiting/auth-audit.logger';
import { SettingsController } from '../settings/settings.controller';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { ExecutionContext, ForbiddenException, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { AuditLog, Setting, entities } from '@attraccess/database-entities';
import * as migrations from '../database/migrations';
import {
  EffectivePermissionsGuard,
  PLUGIN_AUDIT_HOST_PROVIDER,
  PluginAuditEvent,
} from '@attraccess/plugins-backend-sdk';
import { DurableAudit1783700000000 } from '../database/migrations/1783700000000-durable-audit';
import { IdentityAudit1783800000000 } from '../database/migrations/1783800000000-identity-audit';
import { RetirePasswordPolicyAudit1783900000000 } from '../database/migrations/1783900000000-retire-password-policy-audit';
import { AuditService } from './audit.service';
import { AuditModule } from './audit.module';
import { AuditController } from './audit.controller';
import { AuditQueryDto } from './audit-query.dto';
import { readAuditSettings } from './audit.config';
import { SettingsStoreService } from '../settings/settings-store.service';
import { SettingsService } from '../settings/settings.service';
import { SettingsModule } from '../settings/settings.module';
import { Module } from '@nestjs/common';
import { AUDIT_ACTIONS, projectAuditEvent } from './audit-policy';
import { createPluginAuditContext } from '../plugin-system/plugin-audit-context';

const event = (): PluginAuditEvent & { pluginId: string } => ({
  pluginId: 'abcdefghijklmnopqrstu',
  action: 'wago.publication',
  operationId: randomUUID(),
  principal: { userId: 42, authenticationMethod: 'session' },
  outcome: 'succeeded',
  subject: { type: 'wago.controller', id: 7 },
  details: { revision: 2 },
});
const config = {
  enabled: true,
  domains: ['administration', 'attractap', 'identity', 'project', 'resource', 'wago'],
  retention_days: 90,
};

describe('durable audit SQLite', () => {
  let directory: string;
  let source: DataSource;
  let service: AuditService;
  let store: SettingsStoreService;
  const migration = new DurableAudit1783700000000();
  const identityMigration = new IdentityAudit1783800000000();
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'audit-'));
    source = await new DataSource({
      type: 'sqlite',
      database: join(directory, 'fixture.sqlite'),
      entities: [AuditLog, Setting],
    }).initialize();
    // Existing RBAC schema, with data that an additive upgrade must preserve.
    await source.query('CREATE TABLE permission (key text PRIMARY KEY, label text, description text, category text)');
    await source.query('CREATE TABLE role (id integer PRIMARY KEY, key text)');
    await source.query('CREATE TABLE role_permission (roleId integer, permissionKey text)');
    await source.query('CREATE TABLE api_token_permission (apiTokenId integer, permissionKey text)');
    await source.query("INSERT INTO role VALUES (1, 'administrator'), (2, 'member')");
    await migration.up(source.createQueryRunner());
    await identityMigration.up(source.createQueryRunner());
    await source.query(
      'CREATE TABLE IF NOT EXISTS setting (id integer PRIMARY KEY AUTOINCREMENT, parent varchar NOT NULL, key varchar NOT NULL, value varchar NOT NULL, createdAt datetime NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt datetime NOT NULL DEFAULT CURRENT_TIMESTAMP)',
    );
    store = new SettingsStoreService(source.getRepository(Setting), null);
    service = new AuditService(source, store);
    await service.onModuleInit();
  });
  afterEach(async () => {
    await service.onModuleDestroy();
    if (source.isInitialized) await source.destroy();
    await rm(directory, { recursive: true, force: true });
  });

  it.each([{ enabled: false }, { domains: ['wago'] }])(
    'records the final disabling settings change and suppresses subsequent events (%j)',
    async (update) => {
      const settings = new SettingsService(null, store, null);
      await settings.updateAuditSettings(config);
      const controller = new SettingsController(settings, service);
      await controller.updateAuditSettings(update, {
        user: { id: 42, authenticationMethod: 'session' },
      } as AuthenticatedRequest);
      await service.recordAdministration({
        action: 'mqtt_server.created',
        actorId: 42,
        subjectType: 'mqtt-server',
        subjectId: 1,
        details: { host: 'mqtt.example' },
      });
      const rows = (await service.list(new AuditQueryDto())).items;
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        action: 'settings.updated',
        details: { settingKey: update.enabled === false ? 'audit.enabled' : 'audit.domains' },
      });
      expect(rows[0].details.before).not.toBe(rows[0].details.after);
      await settings.updateAuditSettings(config);
      await service.recordAdministration({
        action: 'mqtt_server.created',
        actorId: 42,
        subjectType: 'mqtt-server',
        subjectId: 1,
        details: { host: 'mqtt.example' },
      });
      expect((await service.list(new AuditQueryDto())).items).toHaveLength(2);
    },
  );

  it('records allowlisted administration metadata and rejects credential-bearing fields', async () => {
    await service.recordAdministration({
      action: 'mqtt_server.created',
      actorId: 42,
      subjectType: 'mqtt-server',
      subjectId: 7,
      details: { host: 'mqtt.example.test', port: 8883, passwordChanged: 1 },
    });
    await service.recordAdministration({
      action: 'mqtt_server.created',
      actorId: 42,
      subjectType: 'mqtt-server',
      subjectId: 8,
      details: { password: 'do-not-store' } as never,
    });
    expect((await service.list(new AuditQueryDto())).items).toEqual([
      expect.objectContaining({
        action: 'mqtt_server.created',
        subjectId: 7,
        details: { host: 'mqtt.example.test', port: 8883, passwordChanged: 1 },
      }),
    ]);
  });

  it('upgrades additively, survives connection restart and principal deletion, prevents updates, and reverts', async () => {
    expect(await source.query('SELECT * FROM role_permission')).toEqual([
      { roleId: 1, permissionKey: 'system.audit.read' },
    ]);
    expect(await service.record(event())).toEqual({ status: 'recorded' });
    await expect(source.query("UPDATE audit_log SET outcome = 'failed'")).rejects.toThrow('immutable');
    expect(await source.query('PRAGMA foreign_key_list(audit_log)')).toEqual([]);
    await source.query('DELETE FROM role WHERE id = 1');
    await service.onModuleDestroy();
    await source.destroy();
    await source.initialize();
    await source.query(
      'CREATE TABLE IF NOT EXISTS setting (id integer PRIMARY KEY AUTOINCREMENT, parent varchar NOT NULL, key varchar NOT NULL, value varchar NOT NULL, createdAt datetime NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt datetime NOT NULL DEFAULT CURRENT_TIMESTAMP)',
    );
    store = new SettingsStoreService(source.getRepository(Setting), null);
    service = new AuditService(source, store);
    await service.onModuleInit();
    expect((await service.list(new AuditQueryDto())).items).toEqual([
      expect.objectContaining({ actorId: 42, details: { revision: 2 } }),
    ]);
    await service.onModuleDestroy();
    await identityMigration.down(source.createQueryRunner());
    await migration.down(source.createQueryRunner());
    expect(await source.query("SELECT name FROM sqlite_master WHERE name = 'audit_log'")).toEqual([]);
    expect(await source.query('SELECT * FROM permission')).toEqual([]);
    expect(await source.query('SELECT * FROM role')).toEqual([{ id: 2, key: 'member' }]);
    await migration.up(source.createQueryRunner());
    await identityMigration.up(source.createQueryRunner());
  });

  it('preserves shared audit rows through identity downgrade and re-upgrade', async () => {
    const rows = [
      [
        901,
        'resource',
        null,
        'resource.usage_auto_closed',
        '00000000-0000-4000-8000-000000000901',
        null,
        null,
        null,
        'resource.usage',
        11,
        null,
        null,
      ],
      [
        902,
        'wago',
        'abcdefghijklmnopqrstu',
        'wago.device_connected',
        '00000000-0000-4000-8000-000000000902',
        42,
        'api_token',
        7,
        'wago.device',
        12,
        '192.0.2.42',
        'WAGO/1.0',
      ],
      [
        903,
        'resource',
        null,
        'resource.maintenance_started',
        '00000000-0000-4000-8000-000000000903',
        null,
        null,
        null,
        'resource.maintenance',
        13,
        '2001:db8::3',
        'Resource worker/1.0',
      ],
    ];

    for (const row of rows) {
      await source.query(
        `INSERT INTO "audit_log" ("id", "at", "domain", "pluginId", "action", "operationId", "actorId", "authenticationMethod", "apiTokenId", "outcome", "subjectType", "subjectId", "ipAddress", "userAgent", "details")
         VALUES (?, datetime('now'), ?, ?, ?, ?, ?, ?, ?, 'succeeded', ?, ?, ?, ?, '{"source":"migration-test"}')`,
        row,
      );
    }

    await identityMigration.down(source.createQueryRunner());
    await identityMigration.up(source.createQueryRunner());

    expect(
      await source.query(`SELECT "id", "pluginId", "actorId", "authenticationMethod", "apiTokenId", "ipAddress", "userAgent"
        FROM "audit_log" WHERE "id" IN (901, 902, 903) ORDER BY "id"`),
    ).toEqual([
      {
        id: 901,
        pluginId: null,
        actorId: null,
        authenticationMethod: null,
        apiTokenId: null,
        ipAddress: null,
        userAgent: null,
      },
      {
        id: 902,
        pluginId: 'abcdefghijklmnopqrstu',
        actorId: 42,
        authenticationMethod: 'api_token',
        apiTokenId: 7,
        ipAddress: '192.0.2.42',
        userAgent: 'WAGO/1.0',
      },
      {
        id: 903,
        pluginId: null,
        actorId: null,
        authenticationMethod: null,
        apiTokenId: null,
        ipAddress: '2001:db8::3',
        userAgent: 'Resource worker/1.0',
      },
    ]);
    expect((await source.query('PRAGMA index_list(audit_log)')).map(({ name }: { name: string }) => name)).toEqual(
      expect.arrayContaining([
        'IDX_audit_log_at',
        'IDX_audit_log_domain_id',
        'IDX_audit_log_actor_id',
        'IDX_audit_log_subject_id',
        'IDX_audit_log_operation_id',
        'IDX_audit_log_domain_at',
      ]),
    );
    await expect(source.query("UPDATE audit_log SET outcome = 'failed' WHERE id = 901")).rejects.toThrow('immutable');
  });

  it('never acknowledges or persists an event in an originating transaction that rolls back', async () => {
    const runner = source.createQueryRunner();
    await runner.startTransaction();
    const receipt = service.record(event());
    await runner.rollbackTransaction();
    expect(await receipt).toEqual({ status: 'unavailable' });
    expect((await service.list(new AuditQueryDto())).items).toHaveLength(0);
    expect(await service.record(event())).toEqual({ status: 'recorded' });
  });

  it('records billing transaction lifecycle events with only allowlisted metadata', async () => {
    await store.setPlainSetting('audit', 'domains', '["billing"]');
    expect(
      await service.recordBillingTransaction({
        transactionId: 7,
        userId: 42,
        initiatorId: 9,
        amount: 500,
        status: 'pending',
        source: 'sumup-topup',
        // Runtime callers cannot expand the audited projection with provider data.
        clientSecret: 'not persisted',
      } as never),
    ).toEqual({ status: 'recorded' });
    expect((await service.list({ limit: 1 })).items[0]).toMatchObject({
      domain: 'billing',
      action: 'billing.transaction.created',
      subjectType: 'billing.transaction',
      subjectId: 7,
      actorId: 9,
      details: { amount: 500, status: 'pending', source: 'sumup-topup' },
    });
    expect(
      await service.recordBillingTransaction({
        transactionId: 7,
        userId: 42,
        amount: 500,
        status: 'not-a-status',
        source: 'sumup-topup',
      }),
    ).toEqual({ status: 'unavailable' });
  });

  it('records project administration events with only safe allowlisted details', async () => {
    await service.recordProject({
      action: 'project.invitation.sent',
      actorId: 42,
      subjectType: 'project.invitation',
      subjectId: 7,
      details: { projectId: 3, invitationId: 7, userId: 9, role: 'viewer' },
    });
    await service.recordProject({
      action: 'project.invitation.sent',
      actorId: 42,
      subjectType: 'project.invitation',
      subjectId: 8,
      details: { email: 'person@example.test' },
    } as never);

    expect((await service.list({ limit: 10 })).items).toEqual([
      expect.objectContaining({
        domain: 'project',
        action: 'project.invitation.sent',
        actorId: 42,
        subjectType: 'project.invitation',
        subjectId: 7,
        details: { projectId: 3, invitationId: 7, userId: 9, role: 'viewer' },
      }),
    ]);
  });

  it('persists project API-token attribution only with a valid token context', async () => {
    await service.recordProject({
      action: 'project.created', actorId: 42, authenticationMethod: 'api-token', apiTokenId: 9,
      subjectType: 'project', subjectId: 7, details: { projectId: 7, 'after.name': 'Project', 'after.hasLogo': 0 },
    });
    await service.recordProject({
      action: 'project.created', actorId: 42, authenticationMethod: 'session', apiTokenId: 9,
      subjectType: 'project', subjectId: 8, details: { projectId: 8, 'after.name': 'Project', 'after.hasLogo': 0 },
    } as never);

    expect((await service.list({ limit: 10 })).items).toEqual([
      expect.objectContaining({ domain: 'project', subjectId: 7, authenticationMethod: 'api-token', apiTokenId: 9 }),
    ]);
  });

  it('records and filters Attractap events, respecting global and domain suppression', async () => {
    await store.setPlainSetting('audit', 'domains', '["attractap"]');
    await service.recordAttractap({
      action: 'reader.crash_reported', actorId: null, authenticationMethod: null, subjectId: 7,
      details: { source: 'reader-websocket', resetReason: 'PANIC', hasCoredump: false },
    });
    expect((await service.list({ domain: 'attractap', subjectType: 'attractap.reader', limit: 1 })).items[0]).toMatchObject({
      action: 'attractap.reader.crash_reported', actorId: null, authenticationMethod: null,
      subjectId: 7, details: { source: 'reader-websocket', resetReason: 'PANIC', hasCoredump: false },
    });

    await store.setPlainSetting('audit', 'domains', '["resource"]');
    await service.recordAttractap({
      action: 'reader.registered', actorId: null, authenticationMethod: null, subjectId: 8,
      details: { source: 'reader-websocket' },
    });
    expect((await service.list({ domain: 'attractap', action: 'attractap.reader.registered', limit: 1 })).items).toHaveLength(0);

    await store.setPlainSetting('audit', 'domains', '["attractap"]');
    await store.setPlainSetting('audit', 'enabled', 'false');
    await service.recordAttractap({
      action: 'reader.registered', actorId: null, authenticationMethod: null, subjectId: 9,
      details: { source: 'reader-websocket' },
    });
    expect((await service.list({ domain: 'attractap', subjectId: 9, limit: 1 })).items).toHaveLength(0);
  });

  it('persists resource system and device origins, honors suppression, and filters lifecycle actions', async () => {
    await service.recordResource({
      action: 'health.transition', actorId: null, subjectId: 7,
      details: { previousStatus: 'healthy', status: 'unhealthy', healthSource: 'heartbeat' },
    });
    await service.recordResource({
      action: 'usage_session.started', actorId: 8, authenticationMethod: null, subjectId: 7,
      details: { usageId: 4, usageUserId: 8 },
    });
    await service.recordResource({
      action: 'retraining.cleared', actorId: 8, authenticationMethod: null, subjectType: 'resource_group', subjectId: 3,
      details: { introductionId: 2, usageUserId: 8 },
    });
    expect((await service.list({ domain: 'resource', eventPrefix: 'health.' } as AuditQueryDto)).items).toEqual([
      expect.objectContaining({ action: 'health.transition', actorId: null, authenticationMethod: null, subjectId: 7 }),
    ]);
    expect((await service.list({ domain: 'resource', action: 'usage_session.started' } as AuditQueryDto)).items).toEqual([
      expect.objectContaining({ actorId: 8, authenticationMethod: null, subjectId: 7 }),
    ]);
    expect((await service.list({ domain: 'resource', subjectType: 'resource_group' } as AuditQueryDto)).items).toEqual([
      expect.objectContaining({ action: 'retraining.cleared', subjectId: 3, actorId: 8, authenticationMethod: null }),
    ]);
    await store.setPlainSetting('audit', 'domains', '[]');
    await service.recordResource({
      action: 'retraining.required', actorId: null, subjectId: 7,
      details: { introductionId: 2, usageUserId: 8, retrainingReason: 'age' },
    });
    expect((await service.list({ domain: 'resource' } as AuditQueryDto)).items).toHaveLength(3);
    await store.setPlainSetting('audit', 'domains', '["resource"]');
    await store.setPlainSetting('audit', 'enabled', 'false');
    await service.recordResource({
      action: 'retraining.required', actorId: null, subjectId: 7,
      details: { introductionId: 3, usageUserId: 8, retrainingReason: 'age' },
    });
    expect((await service.list({ domain: 'resource' } as AuditQueryDto)).items).toHaveLength(3);
  });

  it('records a billing event only after its originating transaction commits', async () => {
    await store.setPlainSetting('audit', 'domains', '["billing"]');
    let receipt: Promise<{ status: string }> | undefined;
    await source.transaction(async (manager) => {
      receipt = service.recordBillingTransactionAfterCommit(
        {
          transactionId: 8,
          userId: 42,
          amount: 0,
          status: 'pending',
          source: 'resource-usage',
        },
        manager,
      );
      expect((await service.list({ limit: 1 })).items).toHaveLength(0);
    });
    await expect(receipt).resolves.toEqual({ status: 'recorded' });
    expect((await service.list({ limit: 1 })).items[0]).toMatchObject({ subjectId: 8, domain: 'billing' });
  });

  it('discards a billing event when its originating transaction rolls back', async () => {
    await store.setPlainSetting('audit', 'domains', '["billing"]');
    let receipt: Promise<{ status: string }> | undefined;
    await expect(
      source.transaction(async (manager) => {
        receipt = service.recordBillingTransactionAfterCommit(
          {
            transactionId: 8,
            userId: 42,
            amount: 0,
            status: 'pending',
            source: 'resource-usage',
          },
          manager,
        );
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');
    await expect(receipt).resolves.toEqual({ status: 'unavailable' });
    expect((await service.list({ limit: 1 })).items).toHaveLength(0);
  });

  it('retains outer billing events when a nested transaction rolls back', async () => {
    await store.setPlainSetting('audit', 'domains', '["billing"]');
    let outerReceipt: Promise<{ status: string }> | undefined;
    let nestedReceipt: Promise<{ status: string }> | undefined;
    await source.transaction(async (manager) => {
      outerReceipt = service.recordBillingTransactionAfterCommit(
        {
          transactionId: 8,
          userId: 42,
          amount: 0,
          status: 'pending',
          source: 'resource-usage',
        },
        manager,
      );
      await expect(
        manager.transaction(async (nestedManager) => {
          nestedReceipt = service.recordBillingTransactionAfterCommit(
            {
              transactionId: 9,
              userId: 42,
              amount: 0,
              status: 'pending',
              source: 'resource-usage',
            },
            nestedManager,
          );
          throw new Error('nested rollback');
        }),
      ).rejects.toThrow('nested rollback');
    });
    await expect(outerReceipt).resolves.toEqual({ status: 'recorded' });
    await expect(nestedReceipt).resolves.toEqual({ status: 'unavailable' });
    expect((await service.list({ limit: 10 })).items.map((item) => item.subjectId)).toEqual([8]);
  });

  it('retains billing events from a committed savepoint when a sibling savepoint rolls back', async () => {
    await store.setPlainSetting('audit', 'domains', '["billing"]');
    let committedReceipt: Promise<{ status: string }> | undefined;
    let rolledBackReceipt: Promise<{ status: string }> | undefined;
    await source.transaction(async (manager) => {
      await manager.transaction(async (nestedManager) => {
        committedReceipt = service.recordBillingTransactionAfterCommit(
          {
            transactionId: 8,
            userId: 42,
            amount: 0,
            status: 'pending',
            source: 'resource-usage',
          },
          nestedManager,
        );
      });
      await expect(
        manager.transaction(async (nestedManager) => {
          rolledBackReceipt = service.recordBillingTransactionAfterCommit(
            {
              transactionId: 9,
              userId: 42,
              amount: 0,
              status: 'pending',
              source: 'resource-usage',
            },
            nestedManager,
          );
          throw new Error('nested rollback');
        }),
      ).rejects.toThrow('nested rollback');
    });
    await expect(committedReceipt).resolves.toEqual({ status: 'recorded' });
    await expect(rolledBackReceipt).resolves.toEqual({ status: 'unavailable' });
    expect((await service.list({ limit: 10 })).items.map((item) => item.subjectId)).toEqual([8]);
  });

  it('persists every registered action lifecycle and preserves manual command and profile references', async () => {
    for (const action of AUDIT_ACTIONS) {
      for (const terminal of ['succeeded', 'failed'] as const) {
        const operationId = randomUUID();
        for (const outcome of ['attempted', terminal] as const) {
          expect(
            await service.record({
              ...event(),
              action,
              operationId,
              outcome,
              details: {},
              subject: {
                id: 7,
                type: action.startsWith('wago.commissioning.') ? 'wago.commissioning' : 'wago.controller',
              },
            }),
          ).toEqual({ status: 'recorded' });
        }
        expect((await service.list({ limit: 10, operationId })).items.map((row) => row.outcome)).toEqual([
          terminal,
          'attempted',
        ]);
      }
    }
    const commandId = randomUUID();
    const details = { channelId: 'door-1', commandId, operation: 'pulse', result: 'acknowledged' };
    expect(
      await service.record({
        ...event(),
        action: 'wago.manual_command',
        principal: { userId: 42, authenticationMethod: 'api-token', apiTokenId: 9 },
        details,
      }),
    ).toEqual({ status: 'recorded' });
    expect((await service.list({ limit: 1 })).items[0]).toMatchObject({ apiTokenId: 9, details });
    expect(
      await service.record({
        ...event(),
        action: 'wago.profile_change',
        details: {
          profileId: 'custom-profile',
          profileVersion: 2,
          'before.logicalChannelCount': 1,
          'after.logicalChannelCount': 2,
        },
      }),
    ).toEqual({ status: 'recorded' });
    expect((await service.list({ limit: 1 })).items[0].details).toEqual({
      profileId: 'custom-profile',
      profileVersion: 2,
      'before.logicalChannelCount': 1,
      'after.logicalChannelCount': 2,
    });
  }, 30_000);

  it('filters and paginates without duplication; hides expired rows and cleans them', async () => {
    await service.record(event());
    await service.record({ ...event(), outcome: 'failed' });
    await service.record(event());
    const page = await service.list({ limit: 1 });
    expect(page.nextCursor).toBe(3);
    expect((await service.list({ limit: 10, beforeId: page.nextCursor })).items.map((row) => row.id)).toEqual([2, 1]);
    expect(
      (await service.list({ limit: 10, outcome: 'failed', actorId: 42, subjectId: 7, action: 'wago.publication' }))
        .items,
    ).toHaveLength(1);
    expect((await service.list({ limit: 10, subjectType: 'wago.commissioning' })).items).toHaveLength(0);
    const old = source
      .getRepository(AuditLog)
      .create({ ...(await service.list({ limit: 1 })).items[0], id: undefined, at: new Date(0) });
    await source.getRepository(AuditLog).insert(old);
    expect(await source.getRepository(AuditLog).count()).toBe(4);
    expect((await service.list({ limit: 10 })).items).toHaveLength(3);
    await service.cleanup();
    expect(await source.getRepository(AuditLog).count()).toBe(3);
  });

  it('does not roll back a recorded event when a paused cleanup transaction fails', async () => {
    await source.getRepository(AuditLog).insert({
      at: new Date(0),
      domain: 'wago',
      pluginId: 'abcdefghijklmnopqrstu',
      action: 'wago.publication',
      operationId: randomUUID(),
      actorId: 42,
      authenticationMethod: 'session',
      apiTokenId: null,
      outcome: 'succeeded',
      subjectType: 'wago.controller',
      subjectId: 7,
      ipAddress: null,
      userAgent: null,
      details: { revision: 1 },
    });
    await source.query(`CREATE TRIGGER fail_audit_cleanup BEFORE DELETE ON audit_log
      BEGIN SELECT RAISE(ROLLBACK, 'cleanup delete failure'); END`);
    const storage = (service as unknown as { storage: DataSource }).storage;
    const originalTransaction = storage.transaction.bind(storage);
    let releaseCleanup!: () => void;
    const cleanupPaused = new Promise<void>((resolve) => {
      releaseCleanup = resolve;
    });
    let transactionStarted!: () => void;
    const cleanupStarted = new Promise<void>((resolve) => {
      transactionStarted = resolve;
    });
    const transaction = jest.spyOn(storage, 'transaction').mockImplementation(async (callback) =>
      originalTransaction(async (manager) => {
        transactionStarted();
        await cleanupPaused;
        return callback(manager);
      }),
    );

    try {
      const cleanup = service.cleanup();
      await cleanupStarted;
      let recorded = false;
      const receipt = service.record(event()).then((value) => {
        recorded = true;
        return value;
      });
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(recorded).toBe(false);

      releaseCleanup();
      await cleanup;
      await expect(receipt).resolves.toEqual({ status: 'recorded' });
      expect(await source.getRepository(AuditLog).count()).toBe(2);
    } finally {
      transaction.mockRestore();
    }
  });

  it('records an event after a paused cleanup transaction commits', async () => {
    await source.getRepository(AuditLog).insert({
      at: new Date(0),
      domain: 'wago',
      pluginId: 'abcdefghijklmnopqrstu',
      action: 'wago.publication',
      operationId: randomUUID(),
      actorId: 42,
      authenticationMethod: 'session',
      apiTokenId: null,
      outcome: 'succeeded',
      subjectType: 'wago.controller',
      subjectId: 7,
      ipAddress: null,
      userAgent: null,
      details: { revision: 1 },
    });
    const storage = (service as unknown as { storage: DataSource }).storage;
    const originalTransaction = storage.transaction.bind(storage);
    let releaseCleanup!: () => void;
    const cleanupPaused = new Promise<void>((resolve) => {
      releaseCleanup = resolve;
    });
    let transactionStarted!: () => void;
    const cleanupStarted = new Promise<void>((resolve) => {
      transactionStarted = resolve;
    });
    const transaction = jest.spyOn(storage, 'transaction').mockImplementation(async (callback) =>
      originalTransaction(async (manager) => {
        transactionStarted();
        await cleanupPaused;
        return callback(manager);
      }),
    );

    try {
      const cleanup = service.cleanup();
      await cleanupStarted;
      let recorded = false;
      const receipt = service.record(event()).then((value) => {
        recorded = true;
        return value;
      });
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(recorded).toBe(false);

      releaseCleanup();
      await cleanup;
      await expect(receipt).resolves.toEqual({ status: 'recorded' });
      expect(await source.getRepository(AuditLog).count()).toBe(1);
    } finally {
      transaction.mockRestore();
    }
  });

  it('fails closed on disabled capture, unsupported domains, invalid input and write failure', async () => {
    for (const disabled of [
      { ...config, enabled: false },
      { ...config, domains: [] },
    ]) {
      for (const [key, value] of Object.entries(disabled))
        await store.setPlainSetting('audit', key, JSON.stringify(value));
      const sink = new AuditService(source, store);
      await sink.onModuleInit();
      expect(await sink.record(event())).toEqual({ status: 'unavailable' });
      await sink.onModuleDestroy();
    }
    await store.setPlainSetting('audit', 'enabled', 'true');
    await store.setPlainSetting('audit', 'domains', '["wago"]');
    await service.recordResource({
      action: 'resource.created', actorId: 42, subjectId: 7, details: { 'after.name': 'Lathe', 'after.type': 'machine' },
    });
    expect(await source.getRepository(AuditLog).count()).toBe(0);
    expect(await service.record({ ...event(), details: { password: 'not-stored' } })).toEqual({
      status: 'unavailable',
    });
    await source.query('DROP TABLE audit_log');
    expect(await service.record(event())).toEqual({ status: 'unavailable' });
    await expect(service.cleanup()).resolves.toBeUndefined();
  });

  it('records an anonymous identity event when the identity domain is enabled', async () => {
    await store.setPlainSetting('audit', 'domains', '["identity"]');
    const operationId = randomUUID();
    expect(
      await service.recordIdentity({
        action: 'login',
        operationId,
        outcome: 'failed',
        details: { reason: 'invalid_credentials' },
        request: { ipAddress: '203.0.113.7', userAgent: 'Attraccess/1.0' },
      }),
    ).toEqual({ status: 'recorded' });
    expect((await service.list({ limit: 1, operationId })).items[0]).toMatchObject({
      domain: 'identity',
      action: 'identity.login',
      actorId: null,
      subjectId: null,
      ipAddress: '203.0.113.7',
      userAgent: 'Attraccess/1.0',
      details: { reason: 'invalid_credentials' },
    });
  });

  it('records system-originated resource introductions without a synthesized session', async () => {
    await store.setPlainSetting('audit', 'domains', '["resource"]');

    await service.recordResource({
      action: 'introduction.granted',
      actorId: null,
      authenticationMethod: null,
      subjectId: 7,
      details: { recipientUserId: 3, tutorUserId: 9 },
    });

    expect((await service.list({ limit: 1 })).items[0]).toMatchObject({
      domain: 'resource',
      action: 'introduction.granted',
      actorId: null,
      authenticationMethod: null,
      subjectId: 7,
      details: { recipientUserId: 3, tutorUserId: 9 },
    });
  });

  it('records identity API-token attribution', async () => {
    await store.setPlainSetting('audit', 'domains', '["identity"]');
    const operationId = randomUUID();
    expect(
      await service.recordIdentity({
        action: 'user_updated',
        operationId,
        outcome: 'succeeded',
        actorId: 42,
        authenticationMethod: 'api-token',
        apiTokenId: 9,
        subjectId: 7,
        details: { field: 'email' },
      }),
    ).toEqual({ status: 'recorded' });
    expect((await service.list({ limit: 1, operationId })).items[0]).toMatchObject({
      actorId: 42,
      authenticationMethod: 'api-token',
      apiTokenId: 9,
    });
  });

  it('persists provider-origin SSO role deltas and filters them by domain', async () => {
    await store.setPlainSetting('audit', 'domains', '["sso"]');
    const operationId = randomUUID();
    expect(
      await service.recordSso({
        action: 'sso.provisioning.permissions_synced',
        operationId,
        actorId: null,
        authenticationMethod: null,
        subject: { type: 'user', id: 7 },
        details: {
          provider: JSON.stringify({
            id: 3,
            name: 'Company IdP',
            type: 'saml',
            configuration: {
              entryPoint: 'https://idp.example.com/sso',
              issuer: 'https://app.example.com',
              audience: null,
              signRequest: false,
              wantAssertionsSigned: false,
              wantAuthnResponseSigned: true,
              forceAuthn: false,
              emailAttributeKeys: null,
              roleMappings: null,
              signingMaterial: {
                identityProviderCertificateConfigured: true,
                provisioningSecretConfigured: false,
                signingCertificateConfigured: false,
                signingPrivateKeyConfigured: false,
              },
              omitted: {},
            },
          }),
          changes: JSON.stringify({ added: ['billing-manager'], removed: [], updated: [] }),
        },
      }),
    ).toEqual({ status: 'recorded' });
    expect(
      (await service.list({ domain: 'sso', action: 'sso.provisioning.permissions_synced', limit: 1 })).items,
    ).toEqual([expect.objectContaining({ domain: 'sso', actorId: null, subjectType: 'user', subjectId: 7 })]);
  });

  it('does not persist SSO events while the SSO domain is disabled', async () => {
    await store.setPlainSetting('audit', 'domains', '["identity"]');
    expect(
      await service.recordSso({
        action: 'sso.provider.created',
        operationId: randomUUID(),
        actorId: 4,
        authenticationMethod: 'session',
        subject: { type: 'sso.provider', id: 3 },
        details: {
          before: 'null',
          after: JSON.stringify({
            id: 3,
            name: 'Company IdP',
            type: 'oidc',
            configuration: {
              issuer: 'https://idp.example.com',
              authorizationURL: 'https://idp.example.com/authorize',
              tokenURL: 'https://idp.example.com/token',
              userInfoURL: 'https://idp.example.com/userinfo',
              clientId: 'client-id',
              clientSecretConfigured: true,
              scopes: null,
              usernameClaimPaths: null,
              emailClaimPaths: null,
              roleMappings: null,
            },
          }),
        },
      }),
    ).toEqual({ status: 'unavailable' });
  });

  it('rejects oversized details at the database boundary too', async () => {
    await service.record(event());
    const row = (await service.list({ limit: 1 })).items[0];
    await expect(
      source.getRepository(AuditLog).insert({ ...row, id: undefined, details: { raw: 'x'.repeat(4096) } }),
    ).rejects.toThrow('CHECK constraint');
  });

  it('bounds outstanding writes without an unbounded queue', async () => {
    const receipts = await Promise.all(Array.from({ length: 40 }, () => service.record(event())));
    expect(receipts.filter((r) => r.status === 'recorded')).toHaveLength(8);
    expect(await source.getRepository(AuditLog).count()).toBe(8);
  });

  it('persists validated settings across store and service restarts, and fails closed on read failure', async () => {
    expect(await readAuditSettings(store)).toEqual(config);
    const settings = new SettingsService(null, store, null);
    await expect(settings.updateAuditSettings({ retention_days: 0 })).rejects.toThrow();
    await expect(settings.updateAuditSettings({ domains: ['unknown'] as never })).rejects.toThrow();
    await expect(settings.updateAuditSettings({ enabled: null })).rejects.toThrow();
    await expect(settings.updateAuditSettings({ secret: 'never' } as never)).rejects.toThrow();
    await settings.updateAuditSettings({ enabled: false, domains: [], retention_days: 2 });
    await service.onModuleDestroy();
    store = new SettingsStoreService(source.getRepository(Setting), null);
    expect(await readAuditSettings(store)).toEqual({ enabled: false, domains: [], retention_days: 2 });
    service = new AuditService(source, store);
    await service.onModuleInit();
    expect(await service.record(event())).toEqual({ status: 'unavailable' });
    await settings.updateAuditSettings({ enabled: true, domains: ['wago'] });
    jest.spyOn(store, 'getPlainSetting').mockRejectedValue(new Error('private failure'));
    expect(await service.record(event())).toEqual({ status: 'unavailable' });
    await expect(service.list({ limit: 1 })).rejects.toThrow('Audit settings unavailable');
  });

  it('applies retention setting changes to reads immediately and rejects malformed persisted settings', async () => {
    await service.record(event());
    const row = (await service.list({ limit: 1 })).items[0];
    await source.getRepository(AuditLog).insert({ ...row, id: undefined, at: new Date(Date.now() - 3 * 86400000) });
    expect((await service.list({ limit: 10 })).items).toHaveLength(2);
    const settings = new SettingsService(null, store, null);
    await settings.updateAuditSettings({ retention_days: 2 });
    expect((await service.list({ limit: 10 })).items).toHaveLength(1);
    expect(await source.getRepository(AuditLog).count()).toBe(2);
    for (const invalid of ['null', '"private"', '0']) {
      await store.setPlainSetting('audit', 'retention_days', invalid);
      expect(await service.record(event())).toEqual({ status: 'unavailable' });
      await expect(service.list({ limit: 1 })).rejects.toThrow('Audit settings unavailable');
      await service.cleanup();
      expect(await source.getRepository(AuditLog).count()).toBe(2);
    }
  });

  it('bounds admission before settings awaits and recovers after settings failure', async () => {
    let release: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const read = jest.spyOn(store, 'getPlainSetting').mockImplementation(async () => {
      await gate;
      throw new Error('private');
    });
    const pending = Array.from({ length: 8 }, () => service.record(event()));
    expect(await service.record(event())).toEqual({ status: 'unavailable' });
    expect(read).toHaveBeenCalledTimes(24);
    release();
    expect((await Promise.all(pending)).every((receipt) => receipt.status === 'unavailable')).toBe(true);
    read.mockRestore();
    expect(await service.record(event())).toEqual({ status: 'recorded' });
  });

  it('drains multiple bounded retention batches and filters event prefixes and time windows', async () => {
    await service.record(event());
    const row = (await service.list({ limit: 1 })).items[0];
    for (let batch = 0; batch < 3; batch++) {
      await source
        .getRepository(AuditLog)
        .insert(Array.from({ length: 800 }, () => ({ ...row, id: undefined, at: new Date(0) })));
    }
    expect(await source.getRepository(AuditLog).count()).toBe(2401);
    expect((await service.list({ limit: 10 })).items).toHaveLength(1);
    await service.cleanup();
    expect(await source.getRepository(AuditLog).count()).toBe(1);
    expect(
      (await service.list({ limit: 10, eventPrefix: 'wago.pub', from: row.at.toISOString(), to: row.at.toISOString() }))
        .items,
    ).toHaveLength(1);
    expect((await service.list({ limit: 10, eventPrefix: 'wago.commissioning.' })).items).toHaveLength(0);
    expect((await service.list({ limit: 10, to: new Date(0).toISOString() })).items).toHaveLength(0);
  });

  it('declines writes under SQLite contention within a deadline and recovers', async () => {
    await source.query('PRAGMA busy_timeout = 10');
    const lock = await new DataSource({ type: 'sqlite', database: source.options.database }).initialize();
    try {
      await lock.query('BEGIN IMMEDIATE');
      const start = Date.now();
      const receipts = await Promise.all(Array.from({ length: 8 }, () => service.record(event())));
      expect(receipts.every((receipt) => receipt.status === 'unavailable')).toBe(true);
      expect(Date.now() - start).toBeLessThan(2500);
      await lock.query('ROLLBACK');
      expect(await service.record(event())).toEqual({ status: 'recorded' });
    } finally {
      await lock.destroy();
    }
  }, 10_000);

  it('enforces HTTP session permissions, token ceilings, query validation and persisted settings updates', async () => {
    const ownerPermissions = new Set(['system.audit.read', 'system.settings.manage', 'users.api-tokens.manage']);
    const settings = new SettingsService(null, store, null);
    const module = await Test.createTestingModule({
      controllers: [AuditController, SettingsController],
      providers: [
        SessionStrategy,
        { provide: AuditService, useValue: service },
        { provide: SettingsService, useValue: settings },
        {
          provide: SessionService,
          useValue: { validateSession: async (token: string) => (token === 'session' ? { id: 42 } : null) },
        },
        { provide: TwoFactorService, useValue: { getStatus: async () => ({ required: false }) } },
        { provide: RbacService, useValue: { getEffectivePermissions: async () => ownerPermissions } },
        {
          provide: ApiTokenService,
          useValue: {
            authenticate: async (token: string) => {
              if (!['audit-token', 'settings-token'].includes(token)) return null;
              return {
                user: { id: 42 },
                apiToken: {
                  id: 9,
                  permissionKeys: [token === 'audit-token' ? 'system.audit.read' : 'system.settings.manage'],
                },
              };
            },
          },
        },
        { provide: AuthAuditLogger, useValue: { log: jest.fn() } },
      ],
    }).compile();
    const app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();
    try {
      await app.listen(0, '127.0.0.1');
      await service.record(event());
      await service.recordResource({
        action: 'resource_group.resource_added', actorId: 42, subjectType: 'resource_group', subjectId: 7,
        details: { resourceId: 3 },
      });
      const server = app.getHttpServer();
      await request(server).get('/api/admin/audit-log').expect(401);
      await request(server).get('/api/admin/audit-log').set('Authorization', 'Bearer invalid').expect(401);
      await request(server).get('/api/admin/audit-log').set('Cookie', 'auth-session=session').expect(200);
      await request(server).get('/api/admin/audit-log').set('Authorization', 'Bearer audit-token').expect(200);
      await request(server).get('/api/admin/audit-log').set('Authorization', 'Bearer settings-token').expect(403);
      await request(server).get('/api/settings/audit').set('Authorization', 'Bearer audit-token').expect(403);
      await request(server)
        .get('/api/settings/audit')
        .set('Authorization', 'Bearer settings-token')
        .expect(200, config);
      ownerPermissions.delete('system.audit.read');
      await request(server).get('/api/admin/audit-log').set('Authorization', 'Bearer audit-token').expect(403);
      await request(server).get('/api/admin/audit-log').set('Cookie', 'auth-session=session').expect(403);
      ownerPermissions.add('system.audit.read');
      for (const query of [
        'eventPrefix=wago.%25',
        'from=invalid',
        'from=2026-W01-1',
        'from=2026-09-02T00:00:00Z&to=2026-09-01T00:00:00Z',
        'limit=101',
        'raw=secret',
      ]) {
        await request(server)
          .get('/api/admin/audit-log?' + query)
          .set('Cookie', 'auth-session=session')
          .expect(400);
      }
      await request(server)
        .get('/api/admin/audit-log?eventPrefix=wago.pub&from=2020-01-01T00:00:00Z')
        .set('Cookie', 'auth-session=session')
        .expect(200)
        .expect(({ body }) => expect(body.items).toHaveLength(1));
      await request(server)
        .get('/api/admin/audit-log?action=resource_group.resource_added&subjectType=resource_group&domain=resource')
        .set('Cookie', 'auth-session=session')
        .expect(200)
        .expect(({ body }) => expect(body.items).toHaveLength(1));
      await request(server)
        .patch('/api/settings/audit')
        .set('Authorization', 'Bearer settings-token')
        .send({ enabled: false, retention_days: 3, domains: [] })
        .expect(200, { enabled: false, retention_days: 3, domains: [] });
      expect(await service.record(event())).toEqual({ status: 'unavailable' });
      await request(server)
        .patch('/api/settings/audit')
        .set('Authorization', 'Bearer settings-token')
        .send({ retention_days: 4 })
        .expect(200, { enabled: false, retention_days: 4, domains: [] });
      await request(server)
        .patch('/api/settings/audit')
        .set('Authorization', 'Bearer settings-token')
        .send({})
        .expect(200, { enabled: false, retention_days: 4, domains: [] });
      for (const body of [
        { enabled: null },
        { enabled: 'false' },
        { retention_days: '90' },
        { domains: ['unknown'] },
        { retention_days: 0 },
        { secret: 'private' },
      ]) {
        await request(server)
          .patch('/api/settings/audit')
          .set('Authorization', 'Bearer settings-token')
          .send(body)
          .expect(400);
      }
      ownerPermissions.delete('users.api-tokens.manage');
      await request(server).get('/api/settings/audit').set('Authorization', 'Bearer settings-token').expect(401);
      const restartedStore = new SettingsStoreService(source.getRepository(Setting), null);
      expect(await readAuditSettings(restartedStore)).toEqual({ enabled: false, retention_days: 4, domains: [] });
    } finally {
      await app.close();
    }
  });

  it('uses one safe event snapshot before settings awaits and waits safely for shutdown', async () => {
    let release: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const originalRead = store.getPlainSetting.bind(store);
    const read = jest.spyOn(store, 'getPlainSetting').mockImplementation(async (parent, key) => {
      await gate;
      return originalRead(parent, key);
    });
    const input = event();
    const pending = service.record(input);
    input.principal.userId = 99;
    input.details.revision = 999;
    release();
    expect(await pending).toEqual({ status: 'recorded' });
    read.mockRestore();
    expect((await service.list({ limit: 1 })).items[0]).toMatchObject({ actorId: 42, details: { revision: 2 } });
    const writes = Array.from({ length: 8 }, () => service.record(event()));
    const shutdown = service.onModuleDestroy();
    expect(await service.record(event())).toEqual({ status: 'unavailable' });
    await Promise.all([...writes, shutdown]);
    await expect(service.list({ limit: 1 })).rejects.toThrow('Audit storage unavailable');
  });

  it('resolves audit from a plugin context registered through full PluginModule.forRoot', async () => {
    let context: PluginContext;
    @Module({})
    class FixturePlugin {}
    @Module({ providers: [{ provide: SettingsStoreService, useValue: store }], exports: [SettingsStoreService] })
    class FixtureSettingsModule {}
    @Module({})
    class FixtureMqttModule {}
    const originalPluginPath = PluginService.PLUGIN_PATH;
    PluginService.PLUGIN_PATH = directory;
    const quarantine = jest.spyOn(PluginService, 'quarantinePlugin').mockImplementation(() => undefined);
    const manifests = jest.spyOn(PluginService, 'getPlugins').mockReturnValue([
      {
        id: event().pluginId,
        name: 'audit-fixture',
        version: '1.0.0',
        pluginDirectory: directory,
        main: { backend: { directory, entryPoint: 'fixture.js' } },
        permissions: [],
      } as never,
    ]);
    const quarantined = jest.spyOn(PluginService, 'isPluginQuarantined').mockReturnValue(false);
    const markLoaded = jest.spyOn(PluginService, 'markPluginAsLoaded').mockImplementation(() => undefined);
    const loader = jest.spyOn(pluginLoader, 'loadPluginEntryExports').mockReturnValue({
      default: {
        register: (value: PluginContext) => {
          context = value;
          return { module: FixturePlugin };
        },
      },
    });
    try {
      const builder = Test.createTestingModule({ imports: [AuditModule, PluginModule.forRoot()] })
        .overrideModule(SettingsModule)
        .useModule(FixtureSettingsModule)
        .overrideModule(MqttModule)
        .useModule(FixtureMqttModule);
      for (const provider of [
        PluginService,
        PluginSandboxService,
        PluginEventsService,
        PluginMqttService,
        NpmPluginService,
        PluginClassificationService,
      ]) {
        builder.overrideProvider(provider).useValue({ clearPlugin: jest.fn() });
      }
      const module = await builder
        .useMocker((token) => {
          if (token === DataSource) return source;
          if (token === EventEmitter2) return new EventEmitter2();
          return {};
        })
        .compile();
      try {
        await module.init();
        expect(context).toBeDefined();
        expect(await context.audit.record(event())).toEqual({ status: 'recorded' });
        expect((await module.get(AuditService).list({ limit: 1 })).items[0].pluginId).toBe(event().pluginId);
      } finally {
        await module.close();
      }
    } finally {
      PluginService.PLUGIN_PATH = originalPluginPath;
      quarantine.mockRestore();
      loader.mockRestore();
      manifests.mockRestore();
      quarantined.mockRestore();
      markLoaded.mockRestore();
    }
  });

  it('resolves the SDK provider through the module and actual bridge', async () => {
    @Module({ providers: [{ provide: SettingsStoreService, useValue: store }], exports: [SettingsStoreService] })
    class FixtureSettingsModule {}
    const module = await Test.createTestingModule({ imports: [AuditModule] })
      .overrideModule(SettingsModule)
      .useModule(FixtureSettingsModule)
      .useMocker((token) => (token === DataSource ? source : undefined))
      .compile();
    await module.init();
    const sink = module.get<AuditService>(PLUGIN_AUDIT_HOST_PROVIDER);
    expect(sink).toBe(module.get(AuditService));
    const bridge = createPluginAuditContext('abcdefghijklmnopqrstu', () => sink);
    expect(await bridge.record(event())).toEqual({ status: 'recorded' });
    await module.close();
  });
});

describe('audit policy and authorization', () => {
  it('accepts every current controller and f136365b commissioning action with the correct subject', () => {
    for (const action of AUDIT_ACTIONS) {
      expect(
        projectAuditEvent({
          ...event(),
          action,
          details: {},
          subject: { id: 1, type: action.startsWith('wago.commissioning.') ? 'wago.commissioning' : 'wago.controller' },
        }),
      ).toBeTruthy();
    }
    expect(
      projectAuditEvent({
        ...event(),
        action: 'wago.profile_change',
        details: { profileId: '  自定义  ', profileVersion: 1, 'before.physicalPointCount': 0 },
      }),
    ).toBeTruthy();
  });

  it('rejects arbitrary events, cross-event details, unsafe values and incorrect principals', () => {
    for (const override of [
      { action: 'wago.telemetry' },
      { action: 'wago.toString' },
      { details: { raw: 'payload' } },
      { details: { channelId: 'valid-but-wrong-event' } },
      { details: { revision: Infinity } },
      { action: 'wago.profile_change', details: { profileId: 'x'.repeat(161) } },
      { principal: { userId: 1, authenticationMethod: 'api-token' } },
      { subject: { type: 'wago.commissioning', id: 1 } },
    ])
      expect(projectAuditEvent({ ...event(), ...override } as ReturnType<typeof event>)).toBeNull();
  });

  it('uses the effective permission guard for both session and token ceilings', () => {
    const guard = new EffectivePermissionsGuard(new Reflector());
    const context = (user: unknown) =>
      ({
        getHandler: () => AuditController.prototype.list,
        getClass: () => AuditController,
        switchToHttp: () => ({ getRequest: () => ({ user }) }),
      }) as unknown as ExecutionContext;
    expect(() => guard.canActivate(context(undefined))).toThrow(UnauthorizedException);
    for (const authenticationMethod of ['session', 'api-token']) {
      expect(() =>
        guard.canActivate(
          context({ id: 1, authenticationMethod, effectivePermissions: new Set(['system.settings.manage']) }),
        ),
      ).toThrow(ForbiddenException);
      expect(
        guard.canActivate(
          context({ id: 1, authenticationMethod, effectivePermissions: new Set(['system.audit.read']) }),
        ),
      ).toBeTruthy();
    }
  });

  it('validates audit query bounds and allows the registered resource and billing filters', async () => {
    const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
    for (const query of [{ limit: '101' }, { beforeId: '-1' }, { raw: 'secret' }]) {
      await expect(pipe.transform(query, { type: 'query', metatype: AuditQueryDto })).rejects.toThrow();
    }
    expect(await pipe.transform({ limit: '5' }, { type: 'query', metatype: AuditQueryDto })).toEqual({ limit: 5 });
    await expect(
      pipe.transform({ eventPrefix: 'maintenance_schedule.' }, { type: 'query', metatype: AuditQueryDto }),
    ).resolves.toMatchObject({ eventPrefix: 'maintenance_schedule.' });
    await expect(
      pipe.transform({ eventPrefix: 'supervision.' }, { type: 'query', metatype: AuditQueryDto }),
    ).resolves.toMatchObject({ eventPrefix: 'supervision.' });
    const billingFilters = {
      domain: 'billing',
      eventPrefix: 'billing.transaction.',
      action: 'billing.transaction.updated',
      subjectType: 'billing.transaction',
    };
    await expect(pipe.transform(billingFilters, { type: 'query', metatype: AuditQueryDto })).resolves.toMatchObject(
      billingFilters,
    );
    await expect(
      pipe.transform({ domain: 'sso', action: 'sso.provider.created' }, { type: 'query', metatype: AuditQueryDto }),
    ).resolves.toMatchObject({ domain: 'sso', action: 'sso.provider.created' });
    await expect(
      pipe.transform(
        { eventPrefix: 'resource_group.', action: 'introduction.granted', subjectType: 'resource_group', domain: 'resource' },
        { type: 'query', metatype: AuditQueryDto },
      ),
    ).resolves.toMatchObject({ action: 'introduction.granted', subjectType: 'resource_group', domain: 'resource' });
    await expect(
      pipe.transform({ eventPrefix: 'billing.', action: 'billing.transaction.created', subjectType: 'billing.transaction', domain: 'billing' }, { type: 'query', metatype: AuditQueryDto }),
    ).resolves.toMatchObject({ action: 'billing.transaction.created', subjectType: 'billing.transaction', domain: 'billing' });
    for (const subjectType of ['project', 'project.member', 'project.invitation']) {
      await expect(
        pipe.transform({ domain: 'project', subjectType }, { type: 'query', metatype: AuditQueryDto }),
      ).resolves.toMatchObject({ domain: 'project', subjectType });
    }
  });
});

it('upgrades the full registered schema, reverts the audit migration, and reapplies it', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'audit-upgrade-'));
  const prior = Object.values(migrations).filter(
    (migration) =>
      migration !== DurableAudit1783700000000 &&
      migration !== IdentityAudit1783800000000 &&
      migration !== RetirePasswordPolicyAudit1783900000000 &&
      migration !== migrations.AttractapAuditDomain1784000000000,
  );
  const database = join(directory, 'upgrade.sqlite');
  let source = new DataSource({ type: 'sqlite', database, entities: Object.values(entities), migrations: prior });
  try {
    await source.initialize();
    await source.runMigrations();
    await source.query(`INSERT INTO "password_policy_audit" ("event", "actorId", "actorUsername", "ip", "userAgent", "requestId", "before", "after", "changedFields")
      VALUES ('global_policy_updated', 1, 'migration-user', '127.0.0.1', 'migration-test', 'migration-request', '{"minLength":12}', '{"minLength":16}', '["minLength"]')`);
    const oversizedRequestId = 'r'.repeat(5_000);
    const oversizedBefore = JSON.stringify({ minLength: 12, requireUppercase: true });
    const oversizedAfter = JSON.stringify({ minLength: 16, requireUppercase: false });
    await source.query(
      `INSERT INTO "password_policy_audit" ("event", "actorId", "actorUsername", "ip", "userAgent", "requestId", "before", "after", "changedFields")
      VALUES ('global_policy_updated', 1, 'migration-user', '127.0.0.1', 'migration-test', ?, ?, ?, '["minLength"]')`,
      [oversizedRequestId, oversizedBefore, oversizedAfter],
    );
    await source.query(
      `INSERT INTO "setting" ("parent", "key", "value") VALUES ('audit', 'domains', '["billing","resource","wago"]')`,
    );
    await source.destroy();
    source = new DataSource({
      type: 'sqlite',
      database,
      entities: Object.values(entities),
      migrations: Object.values(migrations),
    });
    await source.initialize();
    const applied = await source.runMigrations();
    expect(applied.map((migration) => migration.name)).toEqual([
      'DurableAudit1783700000000',
      'IdentityAudit1783800000000',
      'RetirePasswordPolicyAudit1783900000000',
      'AttractapAuditDomain1784000000000',
    ]);
    expect(source.hasMetadata(AuditLog)).toBeTruthy();
    expect(await source.query('PRAGMA foreign_key_list(audit_log)')).toEqual([]);
    expect(await source.query(`SELECT "value" FROM "setting" WHERE "parent" = 'audit' AND "key" = 'domains'`)).toEqual([
      { value: '["billing","resource","wago","identity","attractap"]' },
    ]);
    expect(await source.query("SELECT * FROM audit_log WHERE subjectType = 'identity.password_policy'")).toHaveLength(
      2,
    );
    expect(
      await source.query(`SELECT "metadata" FROM "password_policy_audit_overflow" WHERE "legacyAuditId" = 2`),
    ).toEqual([
      {
        metadata: JSON.stringify({
          actorUsername: 'migration-user',
          requestId: oversizedRequestId,
          role: null,
          before: oversizedBefore,
          after: oversizedAfter,
          changedFields: '["minLength"]',
        }),
      },
    ]);
    const migratedStore = new SettingsStoreService(source.getRepository(Setting), null);
    const migratedAudit = new AuditService(source, migratedStore);
    await migratedAudit.onModuleInit();
    const migratedList = await new AuditController(migratedAudit).list({ limit: 10 });
    const migratedOversizedEvent = migratedList.items.find((item) => item.details.legacyAuditId === 2);
    expect(migratedOversizedEvent).toMatchObject({
      details: {
        detailsTruncated: 1,
        actorUsername: 'migration-user',
        requestId: oversizedRequestId,
        before: oversizedBefore,
        after: oversizedAfter,
        changedFields: '["minLength"]',
      },
    });
    expect(migratedOversizedEvent?.operationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    await expect(
      new ValidationPipe({ transform: true }).transform(
        { operationId: migratedOversizedEvent?.operationId },
        { type: 'query', metatype: AuditQueryDto },
      ),
    ).resolves.toMatchObject({ operationId: migratedOversizedEvent?.operationId });
    const now = jest.spyOn(Date, 'now').mockReturnValue(new Date('2026-06-16T12:00:00.000Z').getTime());
    await source.query(`INSERT INTO "password_policy_audit_overflow" ("legacyAuditId", "metadata")
      VALUES (999, '{"actorUsername":"expired-user"}')`);
    await source.query(`INSERT INTO "audit_log" ("at", "domain", "action", "operationId", "outcome", "subjectType", "subjectId", "details")
      VALUES ('2026-06-15 11:00:00.000', 'identity', 'identity.password_policy_updated', 'password-policy-audit-999', 'succeeded', 'identity.password_policy', 1,
         '{"migrationSource":"password_policy_audit","legacyAuditId":999,"detailsTruncated":true}')`);
    await source.query(`INSERT INTO "password_policy_audit_overflow" ("legacyAuditId", "metadata")
      VALUES (998, '{"actorUsername":"retained-user"}')`);
    await source.query(`INSERT INTO "audit_log" ("at", "domain", "action", "operationId", "outcome", "subjectType", "subjectId", "details")
      VALUES ('2026-06-15 13:00:00.000', 'identity', 'identity.password_policy_updated', 'e3aedfb1-15c7-4290-9a0c-777f27a8357f', 'succeeded', 'identity.password_policy', 1,
        '{"migrationSource":"password_policy_audit","legacyAuditId":998,"detailsTruncated":true}')`);
    await migratedStore.setPlainSetting('audit', 'retention_days', '1');
    await source.query(`CREATE TRIGGER abort_audit_cleanup BEFORE DELETE ON "audit_log"
      WHEN OLD.id IN (SELECT id FROM "audit_log" WHERE "at" < '2026-06-15 12:00:00.000')
      BEGIN SELECT RAISE(ABORT, 'audit cleanup failed'); END`);
    await migratedAudit.cleanup();
    expect(await source.query('SELECT * FROM password_policy_audit_overflow WHERE legacyAuditId = 999')).toHaveLength(
      1,
    );
    await source.query('DROP TRIGGER abort_audit_cleanup');
    await migratedAudit.cleanup();
    expect(await source.query('SELECT * FROM password_policy_audit_overflow WHERE legacyAuditId = 999')).toEqual([]);
    expect(await source.query('SELECT * FROM password_policy_audit_overflow WHERE legacyAuditId = 998')).toHaveLength(
      1,
    );
    now.mockRestore();
    await migratedAudit.onModuleDestroy();
    await source.query(`INSERT INTO "audit_log" ("at", "domain", "action", "operationId", "outcome", "subjectType", "subjectId", "details")
      VALUES (datetime('now'), 'identity', 'identity.password_policy_updated', 'f4ae9dd5-3b66-4d5e-a46c-03cfaa25e266', 'succeeded', 'identity.password_policy', 1, '{"field":"minLength"}')`);
    await source.query(`UPDATE "setting" SET "value" = '["identity"]'
      WHERE "parent" = 'audit' AND "key" = 'domains'`);
    await source.undoLastMigration();
    await source.undoLastMigration();
    expect(await source.query("SELECT name FROM sqlite_master WHERE name = 'audit_log'")).toHaveLength(1);
    expect(await source.query('SELECT * FROM password_policy_audit')).toHaveLength(4);
    expect(
      await source.query(
        `SELECT "actorUsername", "requestId", "before", "after", "changedFields" FROM password_policy_audit WHERE "requestId" = 'migration-request'`,
      ),
    ).toEqual([
      {
        actorUsername: 'migration-user',
        requestId: 'migration-request',
        before: '{"minLength":12}',
        after: '{"minLength":16}',
        changedFields: '["minLength"]',
      },
    ]);
    expect(
      await source.query(`SELECT "requestId", "before", "after" FROM password_policy_audit WHERE "requestId" = ?`, [
        oversizedRequestId,
      ]),
    ).toEqual([{ requestId: oversizedRequestId, before: oversizedBefore, after: oversizedAfter }]);
    expect(await source.query("SELECT * FROM audit_log WHERE subjectType = 'identity.password_policy'")).toHaveLength(
      0,
    );
    expect(await source.query(`SELECT "value" FROM "setting" WHERE "parent" = 'audit' AND "key" = 'domains'`)).toEqual([
      { value: '[]' },
    ]);
    expect((await source.runMigrations()).map((migration) => migration.name)).toEqual([
      'RetirePasswordPolicyAudit1783900000000',
      'AttractapAuditDomain1784000000000',
    ]);
    expect(await source.query("SELECT * FROM audit_log WHERE subjectType = 'identity.password_policy'")).toHaveLength(
      4,
    );
    await source.undoLastMigration();
    await source.undoLastMigration();
    expect(
      await source.query(`SELECT "requestId", "before", "after" FROM password_policy_audit WHERE "requestId" = ?`, [
        oversizedRequestId,
      ]),
    ).toEqual([{ requestId: oversizedRequestId, before: oversizedBefore, after: oversizedAfter }]);
    expect(await source.query("SELECT name FROM sqlite_master WHERE name = 'audit_log'")).toHaveLength(1);
    await source.undoLastMigration();
    expect(await source.query("SELECT name FROM sqlite_master WHERE name = 'audit_log'")).toHaveLength(1);
    await source.undoLastMigration();
    expect(await source.query("SELECT name FROM sqlite_master WHERE name = 'audit_log'")).toEqual([]);
    expect((await source.runMigrations()).map((migration) => migration.name)).toEqual([
      'DurableAudit1783700000000',
      'IdentityAudit1783800000000',
      'RetirePasswordPolicyAudit1783900000000',
      'AttractapAuditDomain1784000000000',
    ]);
  } finally {
    if (source.isInitialized) await source.destroy();
    await rm(directory, { recursive: true, force: true });
  }
}, 60_000);
