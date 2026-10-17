import { AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import { randomUUID } from 'node:crypto';
import { SettingsController } from '../settings/settings.controller';
import { SettingsService } from '../settings/settings.service';
import { AuditQueryDto } from './dto/audit-query.dto';
import { setupAuditDatabase } from './audit.test-fixture';
describe('durable audit SQLite', () => {
  const fixture = setupAuditDatabase();
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
});
