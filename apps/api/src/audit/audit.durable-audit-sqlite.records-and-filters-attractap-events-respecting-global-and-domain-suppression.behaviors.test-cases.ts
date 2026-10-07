import { registerDurableAuditSqliteFixture } from './audit.durable-audit-sqlite.test-fixture';
import { randomUUID } from 'node:crypto';
import { AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import { SettingsController } from '../settings/settings.controller';
import { AuditQueryDto } from './audit-query.dto';
import { SettingsService } from '../settings/settings.service';
import { AuditLog } from '@attraccess/database-entities';

export function registerRecordsAndFiltersAttractapEventsRespectingGlobalAndDomainSuppressionCases(
  fixture: ReturnType<typeof registerDurableAuditSqliteFixture>,
) {
  it('records and filters Attractap events, respecting global and domain suppression', async () => {
    await fixture.store.setPlainSetting('audit', 'domains', '["attractap"]');
    await fixture.service.recordAttractap({
      action: 'reader.crash_reported',
      actorId: null,
      authenticationMethod: null,
      subjectId: 7,
      details: { source: 'reader-websocket', resetReason: 'PANIC', hasCoredump: false },
    });
    expect(
      (await fixture.service.list({ domain: 'attractap', subjectType: 'attractap.reader', limit: 1 })).items[0],
    ).toMatchObject({
      action: 'attractap.reader.crash_reported',
      actorId: null,
      authenticationMethod: null,
      subjectId: 7,
      details: { source: 'reader-websocket', resetReason: 'PANIC', hasCoredump: false },
    });

    await fixture.store.setPlainSetting('audit', 'domains', '["resource"]');
    await fixture.service.recordAttractap({
      action: 'reader.registered',
      actorId: null,
      authenticationMethod: null,
      subjectId: 8,
      details: { source: 'reader-websocket' },
    });
    expect(
      (await fixture.service.list({ domain: 'attractap', action: 'attractap.reader.registered', limit: 1 })).items,
    ).toHaveLength(0);

    await fixture.store.setPlainSetting('audit', 'domains', '["attractap"]');
    await fixture.store.setPlainSetting('audit', 'enabled', 'false');
    await fixture.service.recordAttractap({
      action: 'reader.registered',
      actorId: null,
      authenticationMethod: null,
      subjectId: 9,
      details: { source: 'reader-websocket' },
    });
    expect((await fixture.service.list({ domain: 'attractap', subjectId: 9, limit: 1 })).items).toHaveLength(0);
  });
}

export function registerRecordsBillingTransactionLifecycleEventsWithOnlyAllowlistedMetadataCases(
  fixture: ReturnType<typeof registerDurableAuditSqliteFixture>,
) {
  it('records billing transaction lifecycle events with only allowlisted metadata', async () => {
    await fixture.store.setPlainSetting('audit', 'domains', '["billing"]');
    expect(
      await fixture.service.recordBillingTransaction({
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
    expect((await fixture.service.list({ limit: 1 })).items[0]).toMatchObject({
      domain: 'billing',
      action: 'billing.transaction.created',
      subjectType: 'billing.transaction',
      subjectId: 7,
      actorId: 9,
      details: { amount: 500, status: 'pending', source: 'sumup-topup' },
    });
    expect(
      await fixture.service.recordBillingTransaction({
        transactionId: 7,
        userId: 42,
        amount: 500,
        status: 'not-a-status',
        source: 'sumup-topup',
      }),
    ).toEqual({ status: 'unavailable' });
  });
}

export function registerRecordsIdentityApiTokenAttributionCases(
  fixture: ReturnType<typeof registerDurableAuditSqliteFixture>,
) {
  it('records identity API-token attribution', async () => {
    await fixture.store.setPlainSetting('audit', 'domains', '["identity"]');
    const operationId = randomUUID();
    expect(
      await fixture.service.recordIdentity({
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
    expect((await fixture.service.list({ limit: 1, operationId })).items[0]).toMatchObject({
      actorId: 42,
      authenticationMethod: 'api-token',
      apiTokenId: 9,
    });
  });
}

export function registerRecordsProjectAdministrationEventsWithOnlySafeAllowlistedDetailsCases(
  fixture: ReturnType<typeof registerDurableAuditSqliteFixture>,
) {
  it('records project administration events with only safe allowlisted details', async () => {
    await fixture.service.recordProject({
      action: 'project.invitation.sent',
      actorId: 42,
      subjectType: 'project.invitation',
      subjectId: 7,
      details: { projectId: 3, invitationId: 7, userId: 9, role: 'viewer' },
    });
    await fixture.service.recordProject({
      action: 'project.invitation.sent',
      actorId: 42,
      subjectType: 'project.invitation',
      subjectId: 8,
      details: { email: 'person@example.test' },
    } as never);

    expect((await fixture.service.list({ limit: 10 })).items).toEqual([
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
}

export function registerRecordsSystemOriginatedResourceIntroductionsWithoutASynthesizedSessionCases(
  fixture: ReturnType<typeof registerDurableAuditSqliteFixture>,
) {
  it('records system-originated resource introductions without a synthesized session', async () => {
    await fixture.store.setPlainSetting('audit', 'domains', '["resource"]');

    await fixture.service.recordResource({
      action: 'introduction.granted',
      actorId: null,
      authenticationMethod: null,
      subjectId: 7,
      details: { recipientUserId: 3, tutorUserId: 9 },
    });

    expect((await fixture.service.list({ limit: 1 })).items[0]).toMatchObject({
      domain: 'resource',
      action: 'introduction.granted',
      actorId: null,
      authenticationMethod: null,
      subjectId: 7,
      details: { recipientUserId: 3, tutorUserId: 9 },
    });
  });
}

export function registerRecordsTheFinalDisablingSettingsChangeAndSuppressesSubsequentEventsJCases(
  fixture: ReturnType<typeof registerDurableAuditSqliteFixture>,
) {
  it.each([{ enabled: false }, { domains: ['resource'] }])(
    'records the final disabling settings change and suppresses subsequent events (%j)',
    async (update) => {
      const settings = new SettingsService(null, fixture.store, null);
      await settings.updateAuditSettings(fixture.config);
      const controller = new SettingsController(settings, fixture.service);
      await controller.updateAuditSettings(update, {
        user: { id: 42, authenticationMethod: 'session' },
      } as AuthenticatedRequest);
      await fixture.service.recordAdministration({
        action: 'mqtt_server.created',
        actorId: 42,
        subjectType: 'mqtt-server',
        subjectId: 1,
        details: { host: 'mqtt.example' },
      });
      const rows = (await fixture.service.list(new AuditQueryDto())).items;
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        action: 'settings.updated',
        details: { settingKey: update.enabled === false ? 'audit.enabled' : 'audit.domains' },
      });
      expect(rows[0].details.before).not.toBe(rows[0].details.after);
      await settings.updateAuditSettings(fixture.config);
      await fixture.service.recordAdministration({
        action: 'mqtt_server.created',
        actorId: 42,
        subjectType: 'mqtt-server',
        subjectId: 1,
        details: { host: 'mqtt.example' },
      });
      expect((await fixture.service.list(new AuditQueryDto())).items).toHaveLength(2);
    },
  );
}

export function registerRejectsOversizedDetailsAtTheDatabaseBoundaryTooCases(
  fixture: ReturnType<typeof registerDurableAuditSqliteFixture>,
) {
  it('rejects oversized details at the database boundary too', async () => {
    await fixture.service.record(fixture.event());
    const row = (await fixture.service.list({ limit: 1 })).items[0];
    await expect(
      fixture.source.getRepository(AuditLog).insert({ ...row, id: undefined, details: { raw: 'x'.repeat(4096) } }),
    ).rejects.toThrow('CHECK constraint');
  });
}
