import { SSOProviderType } from '@attraccess/database-entities';
import { ssoAuditSnapshot } from '../users-and-auth/auth/sso/sso-audit-snapshot';
import { registerSsoAuditPolicyFixture } from './sso-audit.service.sso-audit-policy.test-fixture';
import { randomUUID } from 'node:crypto';
import { projectSsoAuditEvent } from './audit-policy';

export function registerBoundsTheTotalEncodedOidcSnapshotWhenIndividuallyValidFieldsExceedTheEnveCases(
  _fixture: ReturnType<typeof registerSsoAuditPolicyFixture>,
) {
  it('bounds the total encoded OIDC snapshot when individually valid fields exceed the envelope', () => {
    const url = 'https://example.test/' + 'a'.repeat(68);
    const strings = ['"'.repeat(18), '"'.repeat(18)];
    const snapshot = JSON.parse(
      ssoAuditSnapshot({
        id: 4,
        type: SSOProviderType.OIDC,
        name: '"'.repeat(40),
        oidcConfiguration: {
          issuer: url,
          authorizationURL: url,
          tokenURL: url,
          userInfoURL: url,
          clientId: '"'.repeat(40),
          scopes: strings,
          usernameClaimPaths: strings,
          emailClaimPaths: strings,
          roleMappings: { member: ['group'] },
        },
      } as never),
    );
    expect(snapshot.configuration.issuer).toBe('');
    expect(snapshot.configuration.scopes).toBeNull();
    expect(snapshot.configuration.omitted.issuer).toEqual({ byteLength: 89 });
    expect(snapshot.configuration.omitted.scopes.count).toBe(2);
    expect(Buffer.byteLength(JSON.stringify(JSON.stringify(snapshot)))).toBeLessThanOrEqual(1300);
  });
}

export function registerCapturesSecurityMaterialPresenceWithoutRetainingItsValuesCases(
  _fixture: ReturnType<typeof registerSsoAuditPolicyFixture>,
) {
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
}

export function registerDoesNotLetOmissionMetadataAuthorizeRetainedSecretsOrArbitraryFieldNamesCases(
  fixture: ReturnType<typeof registerSsoAuditPolicyFixture>,
) {
  it('does not let omission metadata authorize retained secrets or arbitrary field names', () => {
    const unsafe = JSON.parse(fixture.provider);
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
}

export function registerNormalizesAnEmptyOptionalSamlAudienceSoItsAuditEventIsRetainedCases(
  _fixture: ReturnType<typeof registerSsoAuditPolicyFixture>,
) {
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
}

export function registerProjectsASafeProviderLifecycleSnapshotCases(
  fixture: ReturnType<typeof registerSsoAuditPolicyFixture>,
) {
  it('projects a safe provider lifecycle snapshot', () => {
    expect(
      projectSsoAuditEvent({
        action: 'sso.provider.updated',
        operationId: randomUUID(),
        actorId: 7,
        authenticationMethod: 'session',
        subject: { type: 'sso.provider', id: 4 },
        details: { before: fixture.provider, after: fixture.provider, changes: fixture.providerChanges },
      }),
    ).toMatchObject({ action: 'sso.provider.updated', actorId: 7 });
  });
}

export function registerProjectsProviderOriginRoleSynchronizationWithoutAUserActorCases(
  fixture: ReturnType<typeof registerSsoAuditPolicyFixture>,
) {
  it('projects provider-origin role synchronization without a user actor', () => {
    expect(
      projectSsoAuditEvent({
        action: 'sso.provisioning.permissions_synced',
        operationId: randomUUID(),
        actorId: null,
        authenticationMethod: null,
        subject: { type: 'user', id: 9 },
        details: { provider: fixture.provider, changes: fixture.delta },
      }),
    ).toMatchObject({ action: 'sso.provisioning.permissions_synced', actorId: null, subject: { type: 'user', id: 9 } });
  });
}

export function registerRejectsAuditSnapshotsContainingUnsafeEndpointUrlComponentsCases(
  fixture: ReturnType<typeof registerSsoAuditPolicyFixture>,
) {
  it('rejects audit snapshots containing unsafe endpoint URL components', () => {
    const unsafeProvider = fixture.provider.replace(
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
}
