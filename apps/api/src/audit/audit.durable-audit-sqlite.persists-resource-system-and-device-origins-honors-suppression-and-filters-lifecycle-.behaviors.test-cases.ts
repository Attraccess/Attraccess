import { AuditQueryDto } from './audit-query.dto';
import { registerDurableAuditSqliteFixture } from './audit.durable-audit-sqlite.test-fixture';
import { Setting, AuditLog } from '@attraccess/database-entities';
import { AuditService } from './audit.service';
import { readAuditSettings } from './audit.config';
import { SettingsStoreService } from '../settings/settings-store.service';
import { SettingsService } from '../settings/settings.service';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';

export function registerPersistsResourceSystemAndDeviceOriginsHonorsSuppressionAndFiltersLifecycleCases(
  fixture: ReturnType<typeof registerDurableAuditSqliteFixture>,
) {
  it('persists resource system and device origins, honors suppression, and filters lifecycle actions', async () => {
    await fixture.service.recordResource({
      action: 'health.transition',
      actorId: null,
      subjectId: 7,
      details: { previousStatus: 'healthy', status: 'unhealthy', healthSource: 'heartbeat' },
    });
    await fixture.service.recordResource({
      action: 'usage_session.started',
      actorId: 8,
      authenticationMethod: null,
      subjectId: 7,
      details: { usageId: 4, usageUserId: 8 },
    });
    await fixture.service.recordResource({
      action: 'retraining.cleared',
      actorId: 8,
      authenticationMethod: null,
      subjectType: 'resource_group',
      subjectId: 3,
      details: { introductionId: 2, usageUserId: 8 },
    });
    expect((await fixture.service.list({ domain: 'resource', eventPrefix: 'health.' } as AuditQueryDto)).items).toEqual(
      [
        expect.objectContaining({
          action: 'health.transition',
          actorId: null,
          authenticationMethod: null,
          subjectId: 7,
        }),
      ],
    );
    expect(
      (await fixture.service.list({ domain: 'resource', action: 'usage_session.started' } as AuditQueryDto)).items,
    ).toEqual([expect.objectContaining({ actorId: 8, authenticationMethod: null, subjectId: 7 })]);
    expect(
      (await fixture.service.list({ domain: 'resource', subjectType: 'resource_group' } as AuditQueryDto)).items,
    ).toEqual([
      expect.objectContaining({ action: 'retraining.cleared', subjectId: 3, actorId: 8, authenticationMethod: null }),
    ]);
    await fixture.store.setPlainSetting('audit', 'domains', '[]');
    await fixture.service.recordResource({
      action: 'retraining.required',
      actorId: null,
      subjectId: 7,
      details: { introductionId: 2, usageUserId: 8, retrainingReason: 'age' },
    });
    expect((await fixture.service.list({ domain: 'resource' } as AuditQueryDto)).items).toHaveLength(3);
    await fixture.store.setPlainSetting('audit', 'domains', '["resource"]');
    await fixture.store.setPlainSetting('audit', 'enabled', 'false');
    await fixture.service.recordResource({
      action: 'retraining.required',
      actorId: null,
      subjectId: 7,
      details: { introductionId: 3, usageUserId: 8, retrainingReason: 'age' },
    });
    expect((await fixture.service.list({ domain: 'resource' } as AuditQueryDto)).items).toHaveLength(3);
  });
}

export function registerPersistsValidatedSettingsAcrossStoreAndServiceRestartsAndFailsClosedOnReaCases(
  fixture: ReturnType<typeof registerDurableAuditSqliteFixture>,
) {
  it('persists validated settings across store and service restarts, and fails closed on read failure', async () => {
    expect(await readAuditSettings(fixture.store)).toEqual(fixture.config);
    const settings = new SettingsService(null, fixture.store, null);
    await expect(settings.updateAuditSettings({ retention_days: 0 })).rejects.toThrow();
    await expect(settings.updateAuditSettings({ domains: ['unknown'] as never })).rejects.toThrow();
    await expect(settings.updateAuditSettings({ enabled: null })).rejects.toThrow();
    await expect(settings.updateAuditSettings({ secret: 'never' } as never)).rejects.toThrow();
    await settings.updateAuditSettings({ enabled: false, domains: [], retention_days: 2 });
    await fixture.service.onModuleDestroy();
    fixture.store = new SettingsStoreService(fixture.source.getRepository(Setting), null);
    expect(await readAuditSettings(fixture.store)).toEqual({
      enabled: false,
      domains: [],
      plugin_domains_disabled: [],
      retention_days: 2,
    });
    fixture.service = new AuditService(fixture.source, fixture.store);
    await fixture.service.onModuleInit();
    expect(await fixture.service.record(fixture.event())).toEqual({ status: 'unavailable' });
    await settings.updateAuditSettings({ enabled: true, domains: ['resource'] });
    jest.spyOn(fixture.store, 'getPlainSetting').mockRejectedValue(new Error('private failure'));
    expect(await fixture.service.record(fixture.event())).toEqual({ status: 'unavailable' });
    await expect(fixture.service.list({ limit: 1 })).rejects.toThrow('Audit settings unavailable');
  });
}

export function registerRecordsABillingEventOnlyAfterItsOriginatingTransactionCommitsCases(
  fixture: ReturnType<typeof registerDurableAuditSqliteFixture>,
) {
  it('records a billing event only after its originating transaction commits', async () => {
    await fixture.store.setPlainSetting('audit', 'domains', '["billing"]');
    let receipt: Promise<{ status: string }> | undefined;
    await fixture.source.transaction(async (manager) => {
      receipt = fixture.service.recordBillingTransactionAfterCommit(
        {
          transactionId: 8,
          userId: 42,
          amount: 0,
          status: 'pending',
          source: 'resource-usage',
        },
        manager,
      );
      expect((await fixture.service.list({ limit: 1 })).items).toHaveLength(0);
    });
    await expect(receipt).resolves.toEqual({ status: 'recorded' });
    expect((await fixture.service.list({ limit: 1 })).items[0]).toMatchObject({ subjectId: 8, domain: 'billing' });
  });
}

export function registerRecordsAllowlistedAdministrationMetadataAndRejectsCredentialBearingFieldsCases(
  fixture: ReturnType<typeof registerDurableAuditSqliteFixture>,
) {
  it('records allowlisted administration metadata and rejects credential-bearing fields', async () => {
    await fixture.service.recordAdministration({
      action: 'mqtt_server.created',
      actorId: 42,
      subjectType: 'mqtt-server',
      subjectId: 7,
      details: { host: 'mqtt.example.test', port: 8883, passwordChanged: 1 },
    });
    await fixture.service.recordAdministration({
      action: 'mqtt_server.created',
      actorId: 42,
      subjectType: 'mqtt-server',
      subjectId: 8,
      details: { password: 'do-not-store' } as never,
    });
    expect((await fixture.service.list(new AuditQueryDto())).items).toEqual([
      expect.objectContaining({
        action: 'mqtt_server.created',
        subjectId: 7,
        details: { host: 'mqtt.example.test', port: 8883, passwordChanged: 1 },
      }),
    ]);
  });
}

export function registerRecordsAnAnonymousIdentityEventWhenTheIdentityDomainIsEnabledCases(
  fixture: ReturnType<typeof registerDurableAuditSqliteFixture>,
) {
  it('records an anonymous identity event when the identity domain is enabled', async () => {
    await fixture.store.setPlainSetting('audit', 'domains', '["identity"]');
    const operationId = randomUUID();
    expect(
      await fixture.service.recordIdentity({
        action: 'login',
        operationId,
        outcome: 'failed',
        details: { reason: 'invalid_credentials' },
        request: { ipAddress: '203.0.113.7', userAgent: 'Attraccess/1.0' },
      }),
    ).toEqual({ status: 'recorded' });
    expect((await fixture.service.list({ limit: 1, operationId })).items[0]).toMatchObject({
      domain: 'identity',
      action: 'identity.login',
      actorId: null,
      subjectId: null,
      ipAddress: '203.0.113.7',
      userAgent: 'Attraccess/1.0',
      details: { reason: 'invalid_credentials' },
    });
  });
}

export function registerRecordsAnEventAfterAPausedCleanupTransactionCommitsCases(
  fixture: ReturnType<typeof registerDurableAuditSqliteFixture>,
) {
  it('records an event after a paused cleanup transaction commits', async () => {
    await fixture.source.getRepository(AuditLog).insert({
      at: new Date(0),
      domain: 'demo',
      pluginId: 'abcdefghijklmnopqrstu',
      action: 'demo.publication',
      operationId: randomUUID(),
      actorId: 42,
      authenticationMethod: 'session',
      apiTokenId: null,
      outcome: 'succeeded',
      subjectType: 'demo.device',
      subjectId: 7,
      ipAddress: null,
      userAgent: null,
      details: { revision: 1 },
    });
    const storage = (fixture.service as unknown as { storage: DataSource }).storage;
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
      const cleanup = fixture.service.cleanup();
      await cleanupStarted;
      let recorded = false;
      const receipt = fixture.service.record(fixture.event()).then((value) => {
        recorded = true;
        return value;
      });
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(recorded).toBe(false);

      releaseCleanup();
      await cleanup;
      await expect(receipt).resolves.toEqual({ status: 'recorded' });
      expect(await fixture.source.getRepository(AuditLog).count()).toBe(1);
    } finally {
      transaction.mockRestore();
    }
  });
}
