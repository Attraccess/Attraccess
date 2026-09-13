import { randomUUID } from 'node:crypto';
import { SSOProviderType } from '@attraccess/database-entities';
import { projectSsoAuditEvent } from './audit-policy';
import { ssoAuditSnapshot } from '../users-and-auth/auth/sso/sso-audit-snapshot';

describe('SSO audit policy', () => {
  const provider = JSON.stringify({
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
      scopes: ['email'],
      usernameClaimPaths: null,
      emailClaimPaths: null,
      roleMappings: { 'user-manager': ['admins'] },
      omitted: {},
    },
  });
  const delta = JSON.stringify({ added: ['user-manager'], removed: [], updated: [] });
  const providerChanges = JSON.stringify({ changed: ['configuration.issuer'], rotated: [] });

  it('projects a safe provider lifecycle snapshot', () => {
    expect(
      projectSsoAuditEvent({
        action: 'sso.provider.updated',
        operationId: randomUUID(),
        actorId: 7,
        authenticationMethod: 'session',
        subject: { type: 'sso.provider', id: 4 },
        details: { before: provider, after: provider, changes: providerChanges },
      }),
    ).toMatchObject({ action: 'sso.provider.updated', actorId: 7 });
  });

  it('captures security material presence without retaining its values', () => {
    const snapshot = JSON.parse(
      ssoAuditSnapshot({
        id: 4,
        name: 'Workforce',
        type: SSOProviderType.SAML,
        samlConfiguration: {
          entryPoint: 'https://idp.example.com/sso',
          issuer: 'https://app.example.com',
          certificate: 'idp-certificate',
          provisioningSecret: 'provisioning-secret',
          spSigningCertificate: 'sp-certificate',
          spSigningKeyEncrypted: 'encrypted-private-key',
        },
      } as never),
    );

    expect(snapshot).toMatchObject({
      configuration: {
        signingMaterial: {
          identityProviderCertificateConfigured: true,
          provisioningSecretConfigured: true,
          signingCertificateConfigured: true,
          signingPrivateKeyConfigured: true,
        },
      },
    });
    expect(JSON.stringify(snapshot)).not.toContain('idp-certificate');
    expect(JSON.stringify(snapshot)).not.toContain('provisioning-secret');
    expect(JSON.stringify(snapshot)).not.toContain('sp-certificate');
    expect(JSON.stringify(snapshot)).not.toContain('encrypted-private-key');
  });

  it('normalizes an empty optional SAML audience so its audit event is retained', () => {
    const snapshot = ssoAuditSnapshot({
      id: 4,
      name: 'Workforce',
      type: SSOProviderType.SAML,
      samlConfiguration: {
        entryPoint: 'https://idp.example.com/sso',
        issuer: 'https://app.example.com',
        audience: '',
      },
    } as never);

    expect(JSON.parse(snapshot).configuration.audience).toBeNull();
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

  it('rejects audit snapshots containing unsafe endpoint URL components', () => {
    const unsafeProvider = provider.replace(
      'https://idp.example.com',
      'https://user:password@idp.example.com?secret=value#fragment',
    );
    expect(
      projectSsoAuditEvent({
        action: 'sso.provider.created',
        operationId: randomUUID(),
        actorId: 7,
        authenticationMethod: 'session',
        subject: { type: 'sso.provider', id: 4 },
        details: { before: 'null', after: unsafeProvider },
      }),
    ).toBeNull();
  });

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
      const details = { before: snapshot, after: snapshot, changes: providerChanges };
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

  it('does not let omission metadata authorize retained secrets or arbitrary field names', () => {
    const unsafe = JSON.parse(provider);
    unsafe.configuration.issuer = 'https://user:secret@example.test?token=private';
    unsafe.configuration.omitted = { issuer: { byteLength: 120 } };
    const event = {
      action: 'sso.provider.created',
      operationId: randomUUID(),
      actorId: 7,
      authenticationMethod: 'session' as const,
      subject: { type: 'sso.provider' as const, id: 4 },
      details: { before: 'null', after: JSON.stringify(unsafe) },
    };
    expect(projectSsoAuditEvent(event)).toBeNull();
    unsafe.configuration.issuer = '';
    unsafe.configuration.omitted['arbitrary-secret-field'] = { count: 1 };
    expect(projectSsoAuditEvent({ ...event, details: { ...event.details, after: JSON.stringify(unsafe) } })).toBeNull();
  });

  it('projects provider-origin role synchronization without a user actor', () => {
    expect(
      projectSsoAuditEvent({
        action: 'sso.provisioning.permissions_synced',
        operationId: randomUUID(),
        actorId: null,
        authenticationMethod: null,
        subject: { type: 'user', id: 9 },
        details: { provider, changes: delta },
      }),
    ).toMatchObject({ action: 'sso.provisioning.permissions_synced', actorId: null, subject: { type: 'user', id: 9 } });
  });

  it('rejects secrets, malformed deltas, and provider-origin attribution', () => {
    for (const event of [
      {
        details: {
          before: provider,
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
        details: { provider, changes: JSON.stringify({ added: ['administrator'], removed: [] }) },
      },
      {
        action: 'sso.provisioning.permissions_synced',
        actorId: null,
        authenticationMethod: 'session',
        subject: { type: 'user', id: 9 },
        details: { provider, changes: delta },
      },
      { details: { before: provider, after: provider, provider } },
      {
        action: 'sso.provisioning.user_created',
        actorId: 7,
        authenticationMethod: 'session',
        subject: { type: 'user', id: 9 },
        details: { provider, changes: JSON.stringify({ userCreated: true }) },
      },
    ]) {
      expect(
        projectSsoAuditEvent({
          action: 'sso.provider.updated',
          operationId: randomUUID(),
          actorId: 7,
          authenticationMethod: 'session',
          subject: { type: 'sso.provider', id: 4 },
          details: { before: provider, after: provider, changes: providerChanges },
          ...event,
        }),
      ).toBeNull();
    }
  });
});
