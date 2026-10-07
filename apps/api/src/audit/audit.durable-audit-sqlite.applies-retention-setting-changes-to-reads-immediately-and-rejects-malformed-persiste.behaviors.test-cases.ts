import { AuditLog } from '@attraccess/database-entities';
import { SettingsService } from '../settings/settings.service';
import { registerDurableAuditSqliteFixture } from './audit.durable-audit-sqlite.test-fixture';
import { DataSource } from 'typeorm';
import { randomUUID } from 'node:crypto';

export function registerAppliesRetentionSettingChangesToReadsImmediatelyAndRejectsMalformedPersisteCases(
  fixture: ReturnType<typeof registerDurableAuditSqliteFixture>,
) {
  it('applies retention setting changes to reads immediately and rejects malformed persisted settings', async () => {
    await fixture.service.record(fixture.event());
    const row = (await fixture.service.list({ limit: 1 })).items[0];
    await fixture.source
      .getRepository(AuditLog)
      .insert({ ...row, id: undefined, at: new Date(Date.now() - 3 * 86400000) });
    expect((await fixture.service.list({ limit: 10 })).items).toHaveLength(2);
    const settings = new SettingsService(null, fixture.store, null);
    await settings.updateAuditSettings({ retention_days: 2 });
    expect((await fixture.service.list({ limit: 10 })).items).toHaveLength(1);
    expect(await fixture.source.getRepository(AuditLog).count()).toBe(2);
    for (const invalid of ['null', '"private"', '0']) {
      await fixture.store.setPlainSetting('audit', 'retention_days', invalid);
      expect(await fixture.service.record(fixture.event())).toEqual({ status: 'unavailable' });
      await expect(fixture.service.list({ limit: 1 })).rejects.toThrow('Audit settings unavailable');
      await fixture.service.cleanup();
      expect(await fixture.source.getRepository(AuditLog).count()).toBe(2);
    }
  });
}

export function registerBoundsAdmissionBeforeSettingsAwaitsAndRecoversAfterSettingsFailureCases(
  fixture: ReturnType<typeof registerDurableAuditSqliteFixture>,
) {
  it('bounds admission before settings awaits and recovers after settings failure', async () => {
    let release: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const read = jest.spyOn(fixture.store, 'getPlainSetting').mockImplementation(async () => {
      await gate;
      throw new Error('private');
    });
    const pending = Array.from({ length: 8 }, () => fixture.service.record(fixture.event()));
    expect(await fixture.service.record(fixture.event())).toEqual({ status: 'unavailable' });
    expect(read).toHaveBeenCalledTimes(32);
    release();
    expect((await Promise.all(pending)).every((receipt) => receipt.status === 'unavailable')).toBe(true);
    read.mockRestore();
    expect(await fixture.service.record(fixture.event())).toEqual({ status: 'recorded' });
  });
}

export function registerBoundsOutstandingWritesWithoutAnUnboundedQueueCases(
  fixture: ReturnType<typeof registerDurableAuditSqliteFixture>,
) {
  it('bounds outstanding writes without an unbounded queue', async () => {
    const receipts = await Promise.all(Array.from({ length: 40 }, () => fixture.service.record(fixture.event())));
    expect(receipts.filter((r) => r.status === 'recorded')).toHaveLength(8);
    expect(await fixture.source.getRepository(AuditLog).count()).toBe(8);
  });
}

export function registerDeclinesWritesUnderSqliteContentionWithinADeadlineAndRecoversCases(
  fixture: ReturnType<typeof registerDurableAuditSqliteFixture>,
) {
  it('declines writes under SQLite contention within a deadline and recovers', async () => {
    await fixture.source.query('PRAGMA busy_timeout = 10');
    const lock = await new DataSource({ type: 'sqlite', database: fixture.source.options.database }).initialize();
    try {
      await lock.query('BEGIN IMMEDIATE');
      const start = Date.now();
      const receipts = await Promise.all(Array.from({ length: 8 }, () => fixture.service.record(fixture.event())));
      expect(receipts.every((receipt) => receipt.status === 'unavailable')).toBe(true);
      expect(Date.now() - start).toBeLessThan(2500);
      await lock.query('ROLLBACK');
      expect(await fixture.service.record(fixture.event())).toEqual({ status: 'recorded' });
    } finally {
      await lock.destroy();
    }
  }, 10_000);
}

export function registerDiscardsABillingEventWhenItsOriginatingTransactionRollsBackCases(
  fixture: ReturnType<typeof registerDurableAuditSqliteFixture>,
) {
  it('discards a billing event when its originating transaction rolls back', async () => {
    await fixture.store.setPlainSetting('audit', 'domains', '["billing"]');
    let receipt: Promise<{ status: string }> | undefined;
    await expect(
      fixture.source.transaction(async (manager) => {
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
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');
    await expect(receipt).resolves.toEqual({ status: 'unavailable' });
    expect((await fixture.service.list({ limit: 1 })).items).toHaveLength(0);
  });
}

export function registerDoesNotPersistSsoEventsWhileTheSsoDomainIsDisabledCases(
  fixture: ReturnType<typeof registerDurableAuditSqliteFixture>,
) {
  it('does not persist SSO events while the SSO domain is disabled', async () => {
    await fixture.store.setPlainSetting('audit', 'domains', '["identity"]');
    expect(
      await fixture.service.recordSso({
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
}

export function registerDoesNotRollBackARecordedEventWhenAPausedCleanupTransactionFailsCases(
  fixture: ReturnType<typeof registerDurableAuditSqliteFixture>,
) {
  it('does not roll back a recorded event when a paused cleanup transaction fails', async () => {
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
    await fixture.source.query(`CREATE TRIGGER fail_audit_cleanup BEFORE DELETE ON audit_log
      BEGIN SELECT RAISE(ROLLBACK, 'cleanup delete failure'); END`);
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
      expect(await fixture.source.getRepository(AuditLog).count()).toBe(2);
    } finally {
      transaction.mockRestore();
    }
  });
}

export function registerDrainsMultipleBoundedRetentionBatchesAndFiltersEventPrefixesAndTimeWindowsCases(
  fixture: ReturnType<typeof registerDurableAuditSqliteFixture>,
) {
  it('drains multiple bounded retention batches and filters event prefixes and time windows', async () => {
    await fixture.service.record(fixture.event());
    const row = (await fixture.service.list({ limit: 1 })).items[0];
    for (let batch = 0; batch < 3; batch++) {
      await fixture.source
        .getRepository(AuditLog)
        .insert(Array.from({ length: 800 }, () => ({ ...row, id: undefined, at: new Date(0) })));
    }
    expect(await fixture.source.getRepository(AuditLog).count()).toBe(2401);
    expect((await fixture.service.list({ limit: 10 })).items).toHaveLength(1);
    await fixture.service.cleanup();
    expect(await fixture.source.getRepository(AuditLog).count()).toBe(1);
    expect(
      (
        await fixture.service.list({
          limit: 10,
          eventPrefix: 'demo.pub',
          from: row.at.toISOString(),
          to: row.at.toISOString(),
        })
      ).items,
    ).toHaveLength(1);
    expect((await fixture.service.list({ limit: 10, eventPrefix: 'demo.commissioning.' })).items).toHaveLength(0);
    expect((await fixture.service.list({ limit: 10, to: new Date(0).toISOString() })).items).toHaveLength(0);
  });
}
