import { randomUUID } from 'node:crypto';
import { projectSsoAuditEvent } from './audit-policy';
import { registerSsoAuditPolicyFixture } from './sso-audit.service.sso-audit-policy.test-fixture';
import { SSOProviderType } from '@attraccess/database-entities';
import { ssoAuditSnapshot } from '../users-and-auth/auth/sso/sso-audit-snapshot';

export function registerRejectsSecretsMalformedDeltasAndProviderOriginAttributionCases(
  fixture: ReturnType<typeof registerSsoAuditPolicyFixture>,
) {
  it('rejects secrets, malformed deltas, and provider-origin attribution', () => {
    for (const event of [
      {
        details: {
          before: fixture.provider,
          after: JSON.stringify({
            id: 4,
            name: 'Workforce',
            type: 'oidc',
            configuration: {
              issuer: 'https://idp.example.com',
              authorizationURL: 'https://idp.example.com/authorize',
              tokenURL: 'https://idp.example.com/token',
              userInfoURL: 'https://idp.example.com/userinfo',
              clientId: 'client-id',
              clientSecretConfigured: true,
              clientSecret: 'secret',
              scopes: [],
              usernameClaimPaths: null,
              emailClaimPaths: null,
              roleMappings: null,
            },
          }),
        },
      },
      {
        action: 'sso.provisioning.permissions_synced',
        subject: { type: 'user', id: 9 },
        details: { provider: fixture.provider, changes: JSON.stringify({ added: ['administrator'], removed: [] }) },
      },
      {
        action: 'sso.provisioning.permissions_synced',
        actorId: null,
        authenticationMethod: 'session',
        subject: { type: 'user', id: 9 },
        details: { provider: fixture.provider, changes: fixture.delta },
      },
      { details: { before: fixture.provider, after: fixture.provider, provider: fixture.provider } },
      {
        action: 'sso.provisioning.user_created',
        actorId: 7,
        authenticationMethod: 'session',
        subject: { type: 'user', id: 9 },
        details: { provider: fixture.provider, changes: JSON.stringify({ userCreated: true }) },
      },
    ]) {
      expect(
        projectSsoAuditEvent({
          action: 'sso.provider.updated',
          operationId: randomUUID(),
          actorId: 7,
          authenticationMethod: 'session',
          subject: { type: 'sso.provider', id: 4 },
          details: { before: fixture.provider, after: fixture.provider, changes: fixture.providerChanges },
          ...event,
        }),
      ).toBeNull();
    }
  });
}

export function registerRetainsFullLifecycleEventsWithAnEscapedMaximumLengthNameJCases(
  fixture: ReturnType<typeof registerSsoAuditPolicyFixture>,
) {
  it.each(['x', '界', '"', '\n'])(
    'retains full lifecycle events with an escaped maximum-length name (%j)',
    (character) => {
      const endpoint = `https://idp.example.test/${'x'.repeat(69)}`;
      const snapshot = ssoAuditSnapshot({
        id: 4,
        name: character.repeat(255),
        type: SSOProviderType.OIDC,
        oidcConfiguration: {
          issuer: endpoint,
          authorizationURL: endpoint,
          tokenURL: endpoint,
          userInfoURL: endpoint,
          clientId: 'x'.repeat(94),
          scopes: ['s'.repeat(90)],
          usernameClaimPaths: ['u'.repeat(90)],
          emailClaimPaths: ['e'.repeat(90)],
          roleMappings: { admin: ['a'.repeat(150)] },
        },
      } as never);
      const details = { before: snapshot, after: snapshot, changes: fixture.providerChanges };
      expect(Buffer.byteLength(JSON.stringify(snapshot), 'utf8')).toBeLessThanOrEqual(1300);
      expect(Buffer.byteLength(JSON.stringify(details), 'utf8')).toBeLessThanOrEqual(4096);
      expect(JSON.parse(snapshot).configuration.omitted.name).toBeDefined();
      expect(
        projectSsoAuditEvent({
          action: 'sso.provider.updated',
          operationId: randomUUID(),
          actorId: 7,
          authenticationMethod: 'session',
          subject: { type: 'sso.provider', id: 4 },
          details,
        }),
      ).not.toBeNull();
    },
  );
}

export function registerRetainsValidLargeSamlConfigurationsWithOpaqueEntityIdsAndOmissionMetadataCases(
  _fixture: ReturnType<typeof registerSsoAuditPolicyFixture>,
) {
  it('retains valid large SAML configurations with opaque entity IDs and omission metadata', () => {
    const snapshot = ssoAuditSnapshot({
      id: 4,
      name: 'Workforce',
      type: SSOProviderType.SAML,
      samlConfiguration: {
        entryPoint: 'https://idp.example.com/sso?private=value',
        issuer: 'urn:example:service-provider:'.concat('x'.repeat(200)),
        audience: 'urn:example:audience:'.concat('y'.repeat(200)),
        emailAttributeKeys: Array.from({ length: 100 }, (_, index) => `email-${index}`),
        roleMappings: Object.fromEntries(
          Array.from({ length: 100 }, (_, index) => [
            `role-${index}`,
            Array.from({ length: 100 }, () => 'external-value'),
          ]),
        ),
      },
    } as never);

    expect(Buffer.byteLength(snapshot, 'utf8')).toBeLessThanOrEqual(1800);
    expect(snapshot).not.toContain('private=value');
    expect(JSON.parse(snapshot).configuration).toMatchObject({
      issuer: '',
      audience: '',
      omitted: {
        issuer: { byteLength: expect.any(Number) },
        audience: { byteLength: expect.any(Number) },
        emailAttributeKeys: { count: 100 },
      },
    });
    expect(
      projectSsoAuditEvent({
        action: 'sso.provider.created',
        operationId: randomUUID(),
        actorId: 7,
        authenticationMethod: 'session',
        subject: { type: 'sso.provider', id: 4 },
        details: { before: 'null', after: snapshot },
      }),
    ).not.toBeNull();
  });
}

export function registerStripsEndpointCredentialsQueriesAndFragmentsWhileRetainingABoundedMappingSCases(
  _fixture: ReturnType<typeof registerSsoAuditPolicyFixture>,
) {
  it('strips endpoint credentials, queries, and fragments while retaining a bounded mapping summary', () => {
    const snapshot = ssoAuditSnapshot({
      id: 4,
      name: 'Workforce',
      type: SSOProviderType.OIDC,
      oidcConfiguration: {
        issuer: 'https://user:password@idp.example.com/issuer?tenant=private#metadata',
        authorizationURL: 'https://user:password@idp.example.com/authorize?client_secret=private#fragment',
        tokenURL: 'https://idp.example.com/token?secret=private',
        userInfoURL: 'https://idp.example.com/userinfo#private',
        clientId: 'client',
        roleMappings: Object.fromEntries(
          Array.from({ length: 100 }, (_, index) => [
            `role-${index}`,
            Array.from({ length: 100 }, () => 'external-value'),
          ]),
        ),
      },
    } as never);

    expect(snapshot).not.toContain('user:password');
    expect(snapshot).not.toContain('client_secret');
    expect(snapshot).not.toContain('#');
    expect(snapshot.length).toBeLessThanOrEqual(1800);
    expect(JSON.parse(snapshot).configuration.roleMappings).toEqual({
      mappedRoleCount: 100,
      externalValueCount: 10000,
      truncated: true,
    });
    expect(
      projectSsoAuditEvent({
        action: 'sso.provider.created',
        operationId: randomUUID(),
        actorId: 7,
        authenticationMethod: 'session',
        subject: { type: 'sso.provider', id: 4 },
        details: { before: 'null', after: snapshot },
      }),
    ).not.toBeNull();
  });
}

export function registerStripsUrlCredentialsFromSamlEntityIdentifiersWhilePreservingUrnsCases(
  _fixture: ReturnType<typeof registerSsoAuditPolicyFixture>,
) {
  it('strips URL credentials from SAML entity identifiers while preserving URNs', () => {
    const snapshot = ssoAuditSnapshot({
      id: 4,
      name: 'Workforce',
      type: SSOProviderType.SAML,
      samlConfiguration: {
        entryPoint: 'https://idp.example.test/sso',
        issuer: 'https://fixture-user:fixture-password@example.test?api_key=fixture-secret',
        audience: 'urn:attraccess:sp',
      },
    } as never);
    expect(snapshot).not.toContain('fixture-');
    expect(JSON.parse(snapshot).configuration).toMatchObject({
      issuer: 'https://example.test/',
      audience: 'urn:attraccess:sp',
    });
    expect(
      projectSsoAuditEvent({
        action: 'sso.provider.created',
        operationId: randomUUID(),
        actorId: 7,
        authenticationMethod: 'session',
        subject: { type: 'sso.provider', id: 4 },
        details: { before: 'null', after: snapshot },
      }),
    ).not.toBeNull();
  });
}
