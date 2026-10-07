import { AuditLog } from '@attraccess/database-entities';
import { AuditService } from './audit.service';
import { registerDurableAuditSqliteFixture } from './audit.durable-audit-sqlite.test-fixture';
import { AuditQueryDto } from './audit-query.dto';
import { randomUUID } from 'node:crypto';

export function registerFailsClosedOnDisabledCaptureUnsupportedDomainsInvalidInputAndWriteFailureCases(
  fixture: ReturnType<typeof registerDurableAuditSqliteFixture>,
) {
  it('fails closed on disabled capture, unsupported domains, invalid input and write failure', async () => {
    for (const disabled of [
      { ...fixture.config, enabled: false },
      { ...fixture.config, plugin_domains_disabled: ['demo'] },
    ]) {
      for (const [key, value] of Object.entries(disabled))
        await fixture.store.setPlainSetting('audit', key, JSON.stringify(value));
      const sink = new AuditService(fixture.source, fixture.store);
      await sink.onModuleInit();
      expect(await sink.record(fixture.event())).toEqual({ status: 'unavailable' });
      await sink.onModuleDestroy();
    }
    await fixture.store.setPlainSetting('audit', 'enabled', 'true');
    await fixture.store.setPlainSetting('audit', 'plugin_domains_disabled', '[]');
    await fixture.store.setPlainSetting('audit', 'domains', '[]');
    await fixture.service.recordResource({
      action: 'resource.created',
      actorId: 42,
      subjectId: 7,
      details: { 'after.name': 'Lathe', 'after.type': 'machine' },
    });
    expect(await fixture.source.getRepository(AuditLog).count()).toBe(0);
    expect(await fixture.service.record({ ...fixture.event(), details: { password: 'not-stored' } })).toEqual({
      status: 'unavailable',
    });
    await fixture.source.query('DROP TABLE audit_log');
    expect(await fixture.service.record(fixture.event())).toEqual({ status: 'unavailable' });
    await expect(fixture.service.cleanup()).resolves.toBeUndefined();
  });
}

export function registerFiltersAndPaginatesWithoutDuplicationHidesExpiredRowsAndCleansThemCases(
  fixture: ReturnType<typeof registerDurableAuditSqliteFixture>,
) {
  it('filters and paginates without duplication; hides expired rows and cleans them', async () => {
    await fixture.service.record(fixture.event());
    await fixture.service.record({ ...fixture.event(), outcome: 'failed' });
    await fixture.service.record(fixture.event());
    const page = await fixture.service.list({ limit: 1 });
    expect(page.nextCursor).toBe(3);
    expect((await fixture.service.list({ limit: 10, beforeId: page.nextCursor })).items.map((row) => row.id)).toEqual([
      2, 1,
    ]);
    expect(
      (
        await fixture.service.list({
          limit: 10,
          outcome: 'failed',
          actorId: 42,
          subjectId: 7,
          action: 'demo.publication',
        })
      ).items,
    ).toHaveLength(1);
    expect((await fixture.service.list({ limit: 10, subjectType: 'demo.commissioning' })).items).toHaveLength(0);
    const old = fixture.source
      .getRepository(AuditLog)
      .create({ ...(await fixture.service.list({ limit: 1 })).items[0], id: undefined, at: new Date(0) });
    await fixture.source.getRepository(AuditLog).insert(old);
    expect(await fixture.source.getRepository(AuditLog).count()).toBe(4);
    expect((await fixture.service.list({ limit: 10 })).items).toHaveLength(3);
    await fixture.service.cleanup();
    expect(await fixture.source.getRepository(AuditLog).count()).toBe(3);
  });
}

export function registerNeverAcknowledgesOrPersistsAnEventInAnOriginatingTransactionThatRollsBackCases(
  fixture: ReturnType<typeof registerDurableAuditSqliteFixture>,
) {
  it('never acknowledges or persists an event in an originating transaction that rolls back', async () => {
    const runner = fixture.source.createQueryRunner();
    await runner.startTransaction();
    const receipt = fixture.service.record(fixture.event());
    await runner.rollbackTransaction();
    expect(await receipt).toEqual({ status: 'unavailable' });
    expect((await fixture.service.list(new AuditQueryDto())).items).toHaveLength(0);
    expect(await fixture.service.record(fixture.event())).toEqual({ status: 'recorded' });
  });
}

export function registerPersistsEveryRegisteredPluginActionLifecycleAndPreservesDeclaredDetailFieldCases(
  fixture: ReturnType<typeof registerDurableAuditSqliteFixture>,
) {
  it('persists every registered plugin action lifecycle and preserves declared detail fields', async () => {
    for (const policy of fixture.demoDomain.actions) {
      for (const terminal of ['succeeded', 'failed'] as const) {
        const operationId = randomUUID();
        for (const outcome of ['attempted', terminal] as const) {
          expect(
            await fixture.service.record({
              ...fixture.event(),
              action: policy.action,
              operationId,
              outcome,
              details: {},
              subject: { id: 7, type: policy.subjectTypes[0] },
            }),
          ).toEqual({ status: 'recorded' });
        }
        expect((await fixture.service.list({ limit: 10, operationId })).items.map((row) => row.outcome)).toEqual([
          terminal,
          'attempted',
        ]);
      }
    }
    const commandId = randomUUID();
    const details = { channelId: 'door-1', commandId, operation: 'pulse', result: 'acknowledged' };
    expect(
      await fixture.service.record({
        ...fixture.event(),
        action: 'demo.manual_command',
        principal: { userId: 42, authenticationMethod: 'api-token', apiTokenId: 9 },
        details,
      }),
    ).toEqual({ status: 'recorded' });
    expect((await fixture.service.list({ limit: 1 })).items[0]).toMatchObject({ apiTokenId: 9, details });
    expect(
      await fixture.service.record({
        ...fixture.event(),
        action: 'demo.profile_change',
        details: {
          profileId: 'custom-profile',
          profileVersion: 2,
          'before.logicalChannelCount': 1,
          'after.logicalChannelCount': 2,
        },
      }),
    ).toEqual({ status: 'recorded' });
    expect((await fixture.service.list({ limit: 1 })).items[0].details).toEqual({
      profileId: 'custom-profile',
      profileVersion: 2,
      'before.logicalChannelCount': 1,
      'after.logicalChannelCount': 2,
    });
  }, 30_000);
}

export function registerPersistsProjectApiTokenAttributionOnlyWithAValidTokenContextCases(
  fixture: ReturnType<typeof registerDurableAuditSqliteFixture>,
) {
  it('persists project API-token attribution only with a valid token context', async () => {
    await fixture.service.recordProject({
      action: 'project.created',
      actorId: 42,
      authenticationMethod: 'api-token',
      apiTokenId: 9,
      subjectType: 'project',
      subjectId: 7,
      details: { projectId: 7, 'after.name': 'Project', 'after.hasLogo': 0 },
    });
    await fixture.service.recordProject({
      action: 'project.created',
      actorId: 42,
      authenticationMethod: 'session',
      apiTokenId: 9,
      subjectType: 'project',
      subjectId: 8,
      details: { projectId: 8, 'after.name': 'Project', 'after.hasLogo': 0 },
    } as never);

    expect((await fixture.service.list({ limit: 10 })).items).toEqual([
      expect.objectContaining({ domain: 'project', subjectId: 7, authenticationMethod: 'api-token', apiTokenId: 9 }),
    ]);
  });
}

export function registerPersistsProviderOriginSsoRoleDeltasAndFiltersThemByDomainCases(
  fixture: ReturnType<typeof registerDurableAuditSqliteFixture>,
) {
  it('persists provider-origin SSO role deltas and filters them by domain', async () => {
    await fixture.store.setPlainSetting('audit', 'domains', '["sso"]');
    const operationId = randomUUID();
    expect(
      await fixture.service.recordSso({
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
      (await fixture.service.list({ domain: 'sso', action: 'sso.provisioning.permissions_synced', limit: 1 })).items,
    ).toEqual([expect.objectContaining({ domain: 'sso', actorId: null, subjectType: 'user', subjectId: 7 })]);
  });
}
