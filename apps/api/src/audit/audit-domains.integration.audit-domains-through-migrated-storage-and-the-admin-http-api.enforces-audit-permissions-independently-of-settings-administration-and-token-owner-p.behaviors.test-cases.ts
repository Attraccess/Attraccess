import request from 'supertest';
import { registerAuditDomainsThroughMigratedStorageAndTheAdminHttpApiFixture } from './audit-domains.integration.audit-domains-through-migrated-storage-and-the-admin-http-api.test-fixture';
import { randomUUID } from 'node:crypto';
import { AuditLog } from '@attraccess/database-entities';

export function registerEnforcesAuditPermissionsIndependentlyOfSettingsAdministrationAndTokenOwnerPCases(
  fixture: ReturnType<typeof registerAuditDomainsThroughMigratedStorageAndTheAdminHttpApiFixture>,
) {
  it('enforces audit permissions independently of settings administration and token-owner permissions', async () => {
    await fixture.emitAll();
    await request(fixture.app.getHttpServer()).get('/api/admin/audit-log').expect(401);
    await fixture.read({}, 'unknown').expect(401);
    await fixture.read({}, 'audit-manager').expect(403);
    await fixture.configure({ enabled: false }).set('Authorization', 'Bearer audit-reader').expect(403);
    await fixture.read().expect(200);
    fixture.ownerPermissions.delete('system.audit.read');
    await fixture.read().expect(403);
  });
}

export function registerExposesDomainEventsThroughEveryAdminFilterWithoutMixingTargetsCases(
  fixture: ReturnType<typeof registerAuditDomainsThroughMigratedStorageAndTheAdminHttpApiFixture>,
) {
  it.each(fixture.scenarios)(
    'exposes $domain events through every admin filter without mixing targets',
    async (scenario) => {
      const from = new Date(Date.now() - 1000).toISOString();
      await fixture.emitAll();
      const to = new Date(Date.now() + 1000).toISOString();
      for (const filter of [
        { domain: scenario.domain },
        { eventPrefix: scenario.action },
        { action: scenario.action },
        { subjectType: scenario.subjectType, subjectId: scenario.subjectId },
      ]) {
        await fixture
          .read({ ...filter, actorId: 42, outcome: 'succeeded', from, to })
          .expect(200)
          .expect(({ body }) => {
            expect(body.items).toHaveLength(1);
            expect(body.items[0]).toMatchObject({
              domain: scenario.domain,
              action: scenario.action,
              subjectType: scenario.subjectType,
              subjectId: scenario.subjectId,
              actorId: 42,
            });
          });
      }
    },
  );
}

export function registerKeepsRepresentativeCredentialBearingInputsOutOfStoredAndExportedDetailsCases(
  fixture: ReturnType<typeof registerAuditDomainsThroughMigratedStorageAndTheAdminHttpApiFixture>,
) {
  it('keeps representative credential-bearing inputs out of stored and exported details', async () => {
    const secret = 'audit-security-sentinel-secret';
    await fixture.emitAll();
    await fixture.audit.record({
      pluginId: fixture.fixturePluginId,
      action: 'demo.publication',
      operationId: randomUUID(),
      principal: { userId: 42, authenticationMethod: 'session' },
      outcome: 'succeeded',
      subject: { type: 'demo.device', id: 102 },
      details: { password: secret },
    } as never);
    await fixture.audit.recordResource({
      action: 'maintenance_schedule.updated',
      actorId: 42,
      subjectId: 101,
      details: { scheduleId: 12, password: secret },
    } as never);
    await fixture.audit.recordIdentity({
      action: 'user_updated',
      operationId: randomUUID(),
      actorId: 42,
      outcome: 'succeeded',
      subjectType: 'identity.user',
      subjectId: 105,
      details: { password: secret },
    });
    await fixture.audit.recordProject({
      action: 'project.created',
      actorId: 42,
      subjectType: 'project',
      subjectId: 106,
      details: { projectId: 106, invitationToken: secret },
    } as never);
    await fixture.audit.recordAdministration({
      action: 'mqtt_server.created',
      actorId: 42,
      subjectType: 'mqtt-server',
      subjectId: 104,
      details: { password: secret },
    } as never);
    await fixture.audit.recordAttractap({
      action: 'card.linked',
      actorId: 42,
      authenticationMethod: 'session',
      subjectId: 107,
      details: { source: 'reader-enrollment', cardKey: secret },
    } as never);
    await fixture.audit.recordSso({
      action: 'sso.provider.created',
      operationId: randomUUID(),
      actorId: 42,
      authenticationMethod: 'session',
      subject: { type: 'sso.provider', id: 108 },
      details: {
        before: 'null',
        after: JSON.stringify({
          id: 108,
          name: 'Unsafe provider',
          type: 'oidc',
          configuration: { clientSecret: secret },
        }),
      },
    });
    // Billing projects its own scalar fields and never copies provider payloads.
    await fixture.audit.recordBillingTransaction({
      transactionId: 109,
      userId: 42,
      initiatorId: 42,
      amount: 125,
      status: 'completed',
      source: 'manual',
      providerPayload: { token: secret },
    } as never);
    const { body } = await fixture.read().expect(200);
    expect(body.items).toHaveLength(fixture.scenarios.length + 1);
    expect(JSON.stringify(body)).not.toContain(secret);
    expect(JSON.stringify(body)).not.toContain('never-record-this-secret');
    expect(JSON.stringify(await fixture.source.getRepository(AuditLog).find())).not.toContain(secret);
  });
}

export function registerPaginatesAcrossDomainsAndAppliesShortenedRetentionBeforeCleanupCases(
  fixture: ReturnType<typeof registerAuditDomainsThroughMigratedStorageAndTheAdminHttpApiFixture>,
) {
  it('paginates across domains and applies shortened retention before cleanup', async () => {
    await fixture.emitAll();
    const seen: number[] = [];
    let beforeId: number | undefined;
    do {
      const { body } = await fixture.read({ limit: 1, ...(beforeId ? { beforeId } : {}) }).expect(200);
      seen.push(...body.items.map((item: AuditLog) => item.id));
      beforeId = body.nextCursor ?? undefined;
    } while (beforeId);
    expect(new Set(seen).size).toBe(fixture.scenarios.length);
    expect(seen).toHaveLength(fixture.scenarios.length);
    const row = await fixture.source.getRepository(AuditLog).findOneByOrFail({ id: seen[0] });
    const expired = await fixture.source.getRepository(AuditLog).save({
      ...row,
      id: undefined,
      at: new Date(Date.now() - 3 * 86400000),
    });
    await fixture
      .read()
      .expect(200)
      .expect(({ body }) => expect(body.items).toHaveLength(fixture.scenarios.length + 1));
    await fixture.configure({ retention_days: 1 }).expect(200);
    await fixture
      .read()
      .expect(200)
      .expect(({ body }) => expect(fixture.scenarioEntries(body.items)).toHaveLength(fixture.scenarios.length));
    await fixture.audit.cleanup();
    expect(await fixture.source.getRepository(AuditLog).findOneBy({ id: expired.id })).toBeNull();
    expect(fixture.scenarioEntries(await fixture.source.getRepository(AuditLog).find())).toHaveLength(
      fixture.scenarios.length,
    );
  });
}

export function registerPausesAllCaptureWithoutHidingPriorEventsAndResumesThroughPersistedSettingsCases(
  fixture: ReturnType<typeof registerAuditDomainsThroughMigratedStorageAndTheAdminHttpApiFixture>,
) {
  it('pauses all capture without hiding prior events and resumes through persisted settings', async () => {
    await fixture.emitAll();
    await fixture.configure({ enabled: false }).expect(200);
    await fixture.emitAll();
    await fixture
      .read()
      .expect(200)
      .expect(({ body }) => {
        expect(fixture.scenarioEntries(body.items)).toHaveLength(fixture.scenarios.length);
        expect(body.items).toContainEqual(
          expect.objectContaining({
            action: 'settings.updated',
            details: expect.objectContaining({ settingKey: 'audit.enabled', before: 'true', after: 'false' }),
          }),
        );
      });
    await fixture.configure({ enabled: true }).expect(200);
    await fixture.emitAll();
    await fixture
      .read()
      .expect(200)
      .expect(({ body }) => expect(fixture.scenarioEntries(body.items)).toHaveLength(fixture.scenarios.length * 2));
  });
}

export function registerRecordsPasswordPolicySnapshotsForValidGeneratedRoleKeysEndingInASeparatorCases(
  fixture: ReturnType<typeof registerAuditDomainsThroughMigratedStorageAndTheAdminHttpApiFixture>,
) {
  it('records password-policy snapshots for valid generated role keys ending in a separator', async () => {
    const role = `${'a'.repeat(79)}-`;
    await expect(
      fixture.audit.recordIdentity({
        action: 'password_policy_override_updated',
        operationId: randomUUID(),
        actorId: 42,
        authenticationMethod: 'session',
        outcome: 'succeeded',
        subjectType: 'identity.password_policy',
        subjectId: 110,
        details: {
          role,
          before: JSON.stringify({ role, minLength: 8 }),
          after: JSON.stringify({ role, minLength: 12 }),
        },
      }),
    ).resolves.toEqual({ status: 'recorded' });
    await fixture
      .read({ domain: 'identity', action: 'identity.password_policy_override_updated' })
      .expect(200)
      .expect(({ body }) => expect(body.items).toHaveLength(1));
  });
}
