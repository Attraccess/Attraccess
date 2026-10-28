import { Injectable } from '@nestjs/common';
import {
  SSOProvider,
  SSOProviderOIDCConfiguration,
  SSOProviderType,
  SsoSessionContext,
} from '@attraccess/database-entities';
import axios from 'axios';
import { EncryptionService } from '../../../../encryption/encryption.service';
import { RbacService } from '../../../rbac/rbac.service';
import { RoleDelta, SessionPermissionResyncer, SessionRejectedError } from '../session-permission-sync';
import { SSOService } from '../sso.service';
import { OidcTokenVerifier } from './oidc-token-verifier.service';
import { syncOidcRolesFromClaims } from './oidc-permission-claims';

type OidcSessionContext = Extract<SsoSessionContext, { protocol: 'OIDC' }>;

const IDP_REQUEST_OPTIONS = {
  timeout: 5000,
  maxContentLength: 262144,
  maxBodyLength: 262144,
  maxRedirects: 0,
  responseType: 'json' as const,
  validateStatus: () => true,
};

/**
 * OIDC side of session-time permission re-sync: refresh_token grant, UserInfo, ID-token verification
 * and the login role pipeline. Scheduling, backoff and revocation live in SsoSessionPermissionSyncService.
 */
@Injectable()
export class OidcSessionResyncer implements SessionPermissionResyncer {
  readonly protocol = 'OIDC' as const;

  constructor(
    private readonly ssoService: SSOService,
    private readonly rbacService: RbacService,
    private readonly tokenVerifier: OidcTokenVerifier,
    private readonly encryptionService: EncryptionService,
  ) {}

  async loadProvider(providerId: number) {
    const provider = await this.ssoService.getProviderByTypeAndIdWithConfiguration(SSOProviderType.OIDC, providerId);
    const config = provider?.oidcConfiguration;
    return provider && config ? { provider, permissionSyncTtlMinutes: config.permissionSyncTtlMinutes } : null;
  }

  canResync(context: SsoSessionContext): boolean {
    return context.protocol === 'OIDC' && !!context.refreshTokenEncrypted;
  }

  async resync({
    context,
    provider,
    userId,
    patchContext,
  }: {
    context: SsoSessionContext;
    userId: number;
    provider: SSOProvider;
    patchContext: (patch: Partial<OidcSessionContext>) => Promise<void>;
  }): Promise<RoleDelta> {
    const claimed = context as OidcSessionContext;
    const config = provider.oidcConfiguration as SSOProviderOIDCConfiguration;
    const refreshToken = this.encryptionService.decryptIfEncrypted(claimed.refreshTokenEncrypted) ?? '';
    const tokens = await this.refresh(config, refreshToken);
    // Persist a rotated refresh token before any further IdP call: the old one may already be invalid,
    // and replaying it after a transient failure would revoke the session.
    if (tokens.refreshToken) {
      await patchContext({ refreshTokenEncrypted: this.encryptionService.encrypt(tokens.refreshToken) });
    }

    const claimSources: unknown[] = [await this.userInfo(config, claimed.subject, tokens.accessToken)];
    if (tokens.idToken) {
      const claims = await this.tokenVerifier.verify(tokens.idToken, config);
      if (claims.sub !== claimed.subject || 'events' in claims)
        throw new SessionRejectedError('Refreshed ID token does not identify the session subject');
      claimSources.push(claims);
      await patchContext({ idTokenEncrypted: this.encryptionService.encrypt(tokens.idToken) });
    }

    const changes = await syncOidcRolesFromClaims(this.rbacService, userId, config, claimSources);
    return changes ?? { added: [], removed: [], updated: [] };
  }

  private async refresh(
    config: SSOProviderOIDCConfiguration,
    refreshToken: string,
  ): Promise<{ accessToken: string; refreshToken?: string; idToken?: string }> {
    // Same client authentication as the login code exchange (client_secret_post).
    const response = await axios.post<Record<string, unknown>>(
      config.tokenURL,
      new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: config.clientId,
        client_secret: config.clientSecret,
      }).toString(),
      {
        ...IDP_REQUEST_OPTIONS,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      },
    );
    const body = response.data && typeof response.data === 'object' ? response.data : {};
    if (body.error === 'invalid_grant') throw new SessionRejectedError('Refresh token rejected (invalid_grant)');
    if (response.status !== 200 || typeof body.access_token !== 'string' || !body.access_token) {
      throw new Error(
        `Token endpoint returned HTTP ${response.status}${typeof body.error === 'string' ? ` (${body.error})` : ''}`,
      );
    }
    return {
      accessToken: body.access_token,
      ...(typeof body.refresh_token === 'string' && body.refresh_token ? { refreshToken: body.refresh_token } : {}),
      ...(typeof body.id_token === 'string' && body.id_token ? { idToken: body.id_token } : {}),
    };
  }

  private async userInfo(
    config: SSOProviderOIDCConfiguration,
    subject: string,
    accessToken: string,
  ): Promise<Record<string, unknown>> {
    const response = await axios.get<Record<string, unknown>>(config.userInfoURL, {
      ...IDP_REQUEST_OPTIONS,
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    });
    if (response.status !== 200 || !response.data || typeof response.data !== 'object') {
      throw new Error(`Userinfo endpoint returned HTTP ${response.status}`);
    }
    if (response.data.sub !== subject) throw new SessionRejectedError('Userinfo subject mismatch');
    return response.data;
  }
}
