import { SSOProvider, SSOProviderType } from '@attraccess/database-entities';

import { AuthenticatedUser } from '@attraccess/plugins-backend-sdk';

import { Injectable } from '@nestjs/common';

import { randomUUID } from 'node:crypto';

import { isDeepStrictEqual } from 'node:util';

import { SsoAuditService } from '../../../../audit/sso-audit.service';

import { ssoAuditSnapshot } from './provider-audit';

export type SsoProvisioningAuditAction = 'sessions_revoked' | 'user_created' | 'user_deleted' | 'permissions_synced';

export type SsoProvisioningAuditChanges =
  | { sessionsRevoked: true }
  | { userCreated: true }
  | { userDeleted: true }
  | { added: string[]; removed: string[]; updated: string[] };

/** Audit records of SSO provider changes and of what identity providers provision. */
@Injectable()
export class SsoChangeAuditService {
  constructor(private readonly ssoAudit: SsoAuditService) {}

  async recordProvider(
    action: 'created' | 'updated' | 'deleted',
    actor: AuthenticatedUser,
    provider: SSOProvider,
    before?: SSOProvider,
    rotated: string[] = [],
  ): Promise<void> {
    const snapshot = ssoAuditSnapshot(provider);
    const beforeSnapshot = ssoAuditSnapshot(before ?? provider);
    const changes = this.providerChanges(before ?? provider, provider, rotated);
    if (action === 'updated' && changes === '{"changed":[],"rotated":[]}') return;
    await this.record({
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

  async recordProvisioning(
    action: SsoProvisioningAuditAction,
    provider: SSOProvider,
    userId: number,
    changes: SsoProvisioningAuditChanges,
  ): Promise<void> {
    await this.record({
      action: `sso.provisioning.${action}`,
      operationId: randomUUID(),
      actorId: null,
      authenticationMethod: null,
      subject: { type: 'user', id: userId },
      details: { provider: ssoAuditSnapshot(provider), changes: JSON.stringify(changes) },
    });
  }

  /** The secrets and certificates an update replaced; their values never reach the audit log. */
  rotationFlags(before: SSOProvider, after: SSOProvider): string[] {
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

  private async record(event: Parameters<SsoAuditService['record']>[0]): Promise<void> {
    try {
      await this.ssoAudit.record(event);
    } catch {
      // Auditing must not roll back an already-completed SSO operation.
    }
  }

  private providerChanges(before: SSOProvider, after: SSOProvider, rotated: string[]): string {
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
            'roleClaimPaths',
            'roleMappings',
            'permissionSyncTtlMinutes',
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
            'roleAttributeKeys',
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
}
