import { SSOProvider, SSOProviderType } from '@attraccess/database-entities';
import { AuthenticatedRequest, AuthenticatedUser } from '@attraccess/plugins-backend-sdk';
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { SsoAuditService } from '../../../audit/sso-audit.service';
import { ssoAuditSnapshot } from './sso-audit-snapshot';
import { SsoProvisioningValidationImplementation } from './sso-provisioning-validation';
export abstract class SsoProviderAuditImplementation extends SsoProvisioningValidationImplementation {
  // Per-role ceiling: each mapped role must have permissions that are a subset of the actor's own

  protected async recordProviderAudit(
    action: 'created' | 'updated' | 'deleted',
    request: AuthenticatedRequest,
    provider: SSOProvider,
    before?: SSOProvider,
    rotated: string[] = [],
  ): Promise<void> {
    const actor = request.user as AuthenticatedUser;
    const snapshot = this.providerSnapshot(provider);
    const beforeSnapshot = this.providerSnapshot(before ?? provider);
    const changes = this.providerChanges(before ?? provider, provider, rotated);
    if (action === 'updated' && changes === '{"changed":[],"rotated":[]}') return;
    await this.recordSso({
      action: `sso.provider.${action}`,
      operationId: randomUUID(),
      actorId: actor.id,
      authenticationMethod: actor.authenticationMethod ?? 'session',
      ...(actor.authenticationMethod === 'api-token' && actor.apiTokenId ? { apiTokenId: actor.apiTokenId } : {}),
      subject: { type: 'sso.provider', id: provider.id },
      details:
        action === 'created'
          ? { before: 'null', after: snapshot }
          : action === 'deleted'
            ? { before: snapshot, after: 'null' }
            : { before: beforeSnapshot, after: snapshot, changes },
    });
  }

  protected async recordProvisioningAudit(
    action: 'sessions_revoked' | 'user_created' | 'user_deleted' | 'permissions_synced',
    provider: SSOProvider,
    userId: number,
    changes:
      | { sessionsRevoked: true }
      | { userCreated: true }
      | { userDeleted: true }
      | { added: string[]; removed: string[]; updated: string[] },
  ): Promise<void> {
    await this.recordSso({
      action: `sso.provisioning.${action}`,
      operationId: randomUUID(),
      actorId: null,
      authenticationMethod: null,
      subject: { type: 'user', id: userId },
      details: { provider: this.providerSnapshot(provider), changes: JSON.stringify(changes) },
    });
  }

  protected async recordSso(event: Parameters<SsoAuditService['record']>[0]): Promise<void> {
    try {
      await this.ssoAudit?.record(event);
    } catch {
      // Auditing must not roll back an already-completed SSO operation.
    }
  }

  protected providerSnapshot(provider: SSOProvider): string {
    return ssoAuditSnapshot(provider);
  }

  protected providerChanges(before: SSOProvider, after: SSOProvider, rotated: string[]): string {
    const beforeConfiguration = (before.type === SSOProviderType.OIDC
      ? before.oidcConfiguration
      : before.samlConfiguration) as unknown as Record<string, unknown> | undefined;
    const afterConfiguration = (after.type === SSOProviderType.OIDC
      ? after.oidcConfiguration
      : after.samlConfiguration) as unknown as Record<string, unknown> | undefined;
    const fields =
      before.type === SSOProviderType.OIDC
        ? [
            'issuer',
            'authorizationURL',
            'tokenURL',
            'userInfoURL',
            'clientId',
            'scopes',
            'usernameClaimPaths',
            'emailClaimPaths',
            'roleMappings',
          ]
        : [
            'entryPoint',
            'issuer',
            'audience',
            'signRequest',
            'wantAssertionsSigned',
            'wantAuthnResponseSigned',
            'forceAuthn',
            'emailAttributeKeys',
            'roleMappings',
          ];
    const changed = [
      ...(before.name === after.name ? [] : ['name']),
      ...fields
        .filter((key) => !isDeepStrictEqual(beforeConfiguration?.[key], afterConfiguration?.[key]))
        .map((key) => `configuration.${key}`),
    ];
    return JSON.stringify({ changed, rotated });
  }

  protected providerRotationFlags(before: SSOProvider, after: SSOProvider): string[] {
    const rotated: string[] = [];
    if (before.oidcConfiguration?.clientSecret !== after.oidcConfiguration?.clientSecret) rotated.push('clientSecret');
    if (before.samlConfiguration?.provisioningSecret !== after.samlConfiguration?.provisioningSecret)
      rotated.push('provisioningSecret');
    if (before.samlConfiguration?.certificate !== after.samlConfiguration?.certificate)
      rotated.push('identityProviderCertificate');
    if (before.samlConfiguration?.spSigningCertificate !== after.samlConfiguration?.spSigningCertificate)
      rotated.push('signingCertificate');
    if (before.samlConfiguration?.spSigningKeyEncrypted !== after.samlConfiguration?.spSigningKeyEncrypted)
      rotated.push('signingPrivateKey');
    return rotated;
  }
}
