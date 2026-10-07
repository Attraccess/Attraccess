import { DataSource } from 'typeorm';
import { Test } from '@nestjs/testing';
import { PLUGIN_AUDIT_HOST_PROVIDER } from '@attraccess/plugins-backend-sdk';
import { AuditService } from './audit.service';
import { AuditModule } from './audit.module';
import { SettingsStoreService } from '../settings/settings-store.service';
import { SettingsModule } from '../settings/settings.module';
import { Module } from '@nestjs/common';
import { createPluginAuditContext } from '../plugin-system/plugin-audit-context';
import { registerDurableAuditSqliteFixture } from './audit.durable-audit-sqlite.test-fixture';
import { Setting } from '@attraccess/database-entities';
import { AuditQueryDto } from './audit-query.dto';

export function registerResolvesTheSdkProviderThroughTheModuleAndActualBridgeCases(
  fixture: ReturnType<typeof registerDurableAuditSqliteFixture>,
) {
  it('resolves the SDK provider through the module and actual bridge', async () => {
    @Module({
      providers: [{ provide: SettingsStoreService, useValue: fixture.store }],
      exports: [SettingsStoreService],
    })
    class FixtureSettingsModule {}
    const module = await Test.createTestingModule({ imports: [AuditModule] })
      .overrideModule(SettingsModule)
      .useModule(FixtureSettingsModule)
      .useMocker((token) => (token === DataSource ? fixture.source : undefined))
      .compile();
    await module.init();
    const sink = module.get<AuditService>(PLUGIN_AUDIT_HOST_PROVIDER);
    expect(sink).toBe(module.get(AuditService));
    const bridge = createPluginAuditContext('abcdefghijklmnopqrstu', () => sink);
    expect(await bridge.record(fixture.event())).toEqual({ status: 'recorded' });
    await module.close();
  });
}

export function registerRetainsBillingEventsFromACommittedSavepointWhenASiblingSavepointRollsBackCases(
  fixture: ReturnType<typeof registerDurableAuditSqliteFixture>,
) {
  it('retains billing events from a committed savepoint when a sibling savepoint rolls back', async () => {
    await fixture.store.setPlainSetting('audit', 'domains', '["billing"]');
    let committedReceipt: Promise<{ status: string }> | undefined;
    let rolledBackReceipt: Promise<{ status: string }> | undefined;
    await fixture.source.transaction(async (manager) => {
      await manager.transaction(async (nestedManager) => {
        committedReceipt = fixture.service.recordBillingTransactionAfterCommit(
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
          rolledBackReceipt = fixture.service.recordBillingTransactionAfterCommit(
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
    expect((await fixture.service.list({ limit: 10 })).items.map((item) => item.subjectId)).toEqual([8]);
  });
}

export function registerRetainsOuterBillingEventsWhenANestedTransactionRollsBackCases(
  fixture: ReturnType<typeof registerDurableAuditSqliteFixture>,
) {
  it('retains outer billing events when a nested transaction rolls back', async () => {
    await fixture.store.setPlainSetting('audit', 'domains', '["billing"]');
    let outerReceipt: Promise<{ status: string }> | undefined;
    let nestedReceipt: Promise<{ status: string }> | undefined;
    await fixture.source.transaction(async (manager) => {
      outerReceipt = fixture.service.recordBillingTransactionAfterCommit(
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
          nestedReceipt = fixture.service.recordBillingTransactionAfterCommit(
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
    expect((await fixture.service.list({ limit: 10 })).items.map((item) => item.subjectId)).toEqual([8]);
  });
}

export function registerUpgradesAdditivelySurvivesConnectionRestartAndPrincipalDeletionPreventsUpdatCases(
  fixture: ReturnType<typeof registerDurableAuditSqliteFixture>,
) {
  it('upgrades additively, survives connection restart and principal deletion, prevents updates, and reverts', async () => {
    expect(await fixture.source.query('SELECT * FROM role_permission')).toEqual([
      { roleId: 1, permissionKey: 'system.audit.read' },
    ]);
    expect(await fixture.service.record(fixture.event())).toEqual({ status: 'recorded' });
    await expect(fixture.source.query("UPDATE audit_log SET outcome = 'failed'")).rejects.toThrow('immutable');
    expect(await fixture.source.query('PRAGMA foreign_key_list(audit_log)')).toEqual([]);
    await fixture.source.query('DELETE FROM role WHERE id = 1');
    await fixture.service.onModuleDestroy();
    await fixture.source.destroy();
    await fixture.source.initialize();
    await fixture.source.query(
      'CREATE TABLE IF NOT EXISTS setting (id integer PRIMARY KEY AUTOINCREMENT, parent varchar NOT NULL, key varchar NOT NULL, value varchar NOT NULL, createdAt datetime NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt datetime NOT NULL DEFAULT CURRENT_TIMESTAMP)',
    );
    fixture.store = new SettingsStoreService(fixture.source.getRepository(Setting), null);
    fixture.service = new AuditService(fixture.source, fixture.store);
    await fixture.service.onModuleInit();
    expect((await fixture.service.list(new AuditQueryDto())).items).toEqual([
      expect.objectContaining({ actorId: 42, details: { revision: 2 } }),
    ]);
    await fixture.service.onModuleDestroy();
    await fixture.identityMigration.down(fixture.source.createQueryRunner());
    await fixture.migration.down(fixture.source.createQueryRunner());
    expect(await fixture.source.query("SELECT name FROM sqlite_master WHERE name = 'audit_log'")).toEqual([]);
    expect(await fixture.source.query('SELECT * FROM permission')).toEqual([]);
    expect(await fixture.source.query('SELECT * FROM role')).toEqual([{ id: 2, key: 'member' }]);
    await fixture.migration.up(fixture.source.createQueryRunner());
    await fixture.identityMigration.up(fixture.source.createQueryRunner());
  });
}

export function registerUsesOneSafeEventSnapshotBeforeSettingsAwaitsAndWaitsSafelyForShutdownCases(
  fixture: ReturnType<typeof registerDurableAuditSqliteFixture>,
) {
  it('uses one safe event snapshot before settings awaits and waits safely for shutdown', async () => {
    let release: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const originalRead = fixture.store.getPlainSetting.bind(fixture.store);
    const read = jest.spyOn(fixture.store, 'getPlainSetting').mockImplementation(async (parent, key) => {
      await gate;
      return originalRead(parent, key);
    });
    const input = fixture.event();
    const pending = fixture.service.record(input);
    input.principal.userId = 99;
    input.details.revision = 999;
    release();
    expect(await pending).toEqual({ status: 'recorded' });
    read.mockRestore();
    expect((await fixture.service.list({ limit: 1 })).items[0]).toMatchObject({
      actorId: 42,
      details: { revision: 2 },
    });
    const writes = Array.from({ length: 8 }, () => fixture.service.record(fixture.event()));
    const shutdown = fixture.service.onModuleDestroy();
    expect(await fixture.service.record(fixture.event())).toEqual({ status: 'unavailable' });
    await Promise.all([...writes, shutdown]);
    await expect(fixture.service.list({ limit: 1 })).rejects.toThrow('Audit storage unavailable');
  });
}
