import { ConfigService } from '@nestjs/config';
import { AppConfigType } from '../../../config/app.config';
import { BadRequestException, Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { SSOProviderType, SsoSessionContext } from '@attraccess/database-entities';
import { randomBytes, createHash } from 'node:crypto';
import { SamlConfig } from '@node-saml/node-saml';
import { SettingsService } from '../../../settings/settings.service';
import { EncryptionService } from '../../../encryption/encryption.service';
import { SessionService } from '../session.service';
import { SESSION_STORE, SessionStore } from '../session-store/session-store';
import { SSOService } from './sso.service';
import { OidcTokenVerifier } from './oidc/oidc-token-verifier.service';
import { SamlLogoutAdapter } from './saml/saml-logout-adapter';
import { SSOSamlStrategy } from './saml/saml.strategy';
import { trustedEndpoint } from './logout-endpoints';
import { CentralLogoutResult, LogoutCapability } from './logout.types';

const TTL_MS = 300000;
const receiptKey = (protocol: string, providerId: number, id: string) =>
  `${protocol}:${providerId}:receipt:${createHash('sha256').update(id).digest('hex')}`;
const samlTransactionKey = (providerId: number, requestId: string, state: string) =>
  `SAML:${providerId}:request:${requestId}:${createHash('sha256').update(state).digest('hex')}`;

@Injectable()
export class SsoLogoutService {
  private readonly logger = new Logger(SsoLogoutService.name);
  constructor(
    private readonly providers: SSOService,
    private readonly sessions: SessionService,
    @Inject(SESSION_STORE) private readonly store: SessionStore,
    private readonly settings: SettingsService,
    private readonly encryption: EncryptionService,
    private readonly oidc: OidcTokenVerifier,
    private readonly moduleRef: ModuleRef,
    @Optional() private readonly appConfig?: ConfigService,
  ) {}

  async callbackURL(protocol: 'OIDC' | 'SAML', providerId: number): Promise<string> {
    const base = await this.settings.getUrl();
    if (!base) throw new BadRequestException('Application URL not configured');
    const url = trustedEndpoint(base);
    url.pathname = `/api/auth/sso/${protocol}/${providerId}/${protocol === 'OIDC' ? 'post-logout' : 'slo'}`;
    url.search = '';
    url.hash = '';
    return url.toString();
  }

  async returnURL(result?: 'failed' | 'partial' | 'returned'): Promise<string> {
    const base = this.appConfig?.get<AppConfigType>('app')?.ATTRACCESS_FRONTEND_URL || (await this.settings.getUrl());
    if (!base) throw new BadRequestException('Application URL not configured');
    const url = trustedEndpoint(base);
    url.pathname = '/';
    url.search = '';
    url.hash = '';
    if (result) url.searchParams.set('ssoLogout', result);
    return url.toString();
  }

  async capability(context: SsoSessionContext | null): Promise<LogoutCapability> {
    if (!context) return { available: false, reason: 'local_session' };
    try {
      const provider = await this.providers.getProviderByTypeAndIdWithConfiguration(
        context.protocol as SSOProviderType,
        context.providerId,
      );
      if (context.protocol === 'OIDC') {
        if (!provider?.oidcConfiguration || context.issuer !== provider.oidcConfiguration.issuer)
          return { available: false, reason: 'provider_unavailable' };
        const metadata = await this.oidc.metadata(provider.oidcConfiguration, true);
        return metadata.endSessionURL ? { available: true } : { available: false, reason: 'provider_unavailable' };
      }
      const config = provider?.samlConfiguration;
      if (!context.nameID || !context.sessionIndexes.length || !context.issuer || context.issuer !== config?.idpIssuer)
        return { available: false, reason: 'missing_correlation' };
      return config?.logoutURL && config.idpIssuer && config.spSigningKeyEncrypted && config.spSigningCertificate
        ? { available: true }
        : { available: false, reason: 'provider_unavailable' };
    } catch {
      return { available: false, reason: 'provider_unavailable' };
    }
  }

  async prepare(context: SsoSessionContext | null): Promise<CentralLogoutResult> {
    try {
      const capability = await this.capability(context);
      if (!capability.available || !context) return { kind: 'local_only', reason: capability.reason };
      const provider = await this.providers.getProviderByTypeAndIdWithConfiguration(
        context.protocol as SSOProviderType,
        context.providerId,
      );
      const state = randomBytes(32).toString('base64url');
      const returnTarget = await this.returnURL('returned');
      if (context.protocol === 'OIDC') {
        const config = provider.oidcConfiguration;
        const { endSessionURL } = await this.oidc.metadata(config, true);
        const target = trustedEndpoint(endSessionURL);
        target.searchParams.set('client_id', config.clientId);
        target.searchParams.set('post_logout_redirect_uri', await this.callbackURL('OIDC', context.providerId));
        target.searchParams.set('state', state);
        if (context.idTokenEncrypted)
          target.searchParams.set('id_token_hint', this.encryption.decrypt(context.idTokenEncrypted));
        if (
          !(await this.store.putLogoutState(
            `OIDC:${context.providerId}:state:${state}`,
            returnTarget,
            Date.now() + TTL_MS,
          ))
        )
          throw new Error('Duplicate state');
        return { kind: 'redirect', redirectUrl: target.toString() };
      }
      const requestId = '_' + randomBytes(24).toString('hex');
      const adapter = await this.saml(context.providerId, () => requestId);
      const redirectUrl = await adapter.request(context, state);
      if (
        !(await this.store.putLogoutState(
          samlTransactionKey(context.providerId, requestId, state),
          JSON.stringify({ state, returnTarget }),
          Date.now() + TTL_MS,
        ))
      )
        throw new Error('Duplicate request');
      return { kind: 'redirect', redirectUrl };
    } catch {
      this.logger.warn('Central logout preparation failed; local logout will still complete');
      return { kind: 'local_only', reason: 'provider_failed' };
    }
  }

  async oidcReturn(providerId: number, state: unknown): Promise<string> {
    if (typeof state !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(state))
      throw new BadRequestException('Invalid logout state');
    const target = await this.store.takeLogoutState(`OIDC:${providerId}:state:${state}`);
    if (!target) throw new BadRequestException('Expired or consumed logout state');
    return target;
  }

  async backchannel(providerId: number, token: unknown): Promise<void> {
    try {
      const provider = await this.providers.getProviderByTypeAndIdWithConfiguration(SSOProviderType.OIDC, providerId);
      if (!provider?.oidcConfiguration || typeof token !== 'string') throw new Error('Invalid provider/token');
      const config = provider.oidcConfiguration;
      const claims = await this.oidc.verify(token, config, true);
      const events = claims.events;
      const event =
        events && typeof events === 'object' && !Array.isArray(events)
          ? (events as Record<string, unknown>)['http://schemas.openid.net/event/backchannel-logout']
          : undefined;
      if (
        !event ||
        typeof event !== 'object' ||
        Array.isArray(event) ||
        'nonce' in claims ||
        typeof claims.jti !== 'string' ||
        !claims.jti ||
        claims.jti.length > 256 ||
        ('sub' in claims && (typeof claims.sub !== 'string' || !claims.sub)) ||
        ('sid' in claims && (typeof claims.sid !== 'string' || !claims.sid)) ||
        (!claims.sub && !claims.sid) ||
        typeof claims.iat !== 'number' ||
        typeof claims.exp !== 'number' ||
        claims.exp <= claims.iat
      )
        throw new Error('Invalid logout claims');
      await this.sessions.revokeSsoSessionsOnce(
        {
          protocol: 'OIDC',
          providerId,
          issuer: config.issuer,
          subject: claims.sub,
          ...(typeof claims.sid === 'string' ? { sid: claims.sid } : {}),
          issuedBefore: (claims.iat + 1) * 1000 - 1,
        },
        { key: receiptKey('OIDC', providerId, claims.jti), expiresAt: (claims.exp + 30) * 1000 },
      );
    } catch {
      throw new BadRequestException('Invalid OIDC logout notification');
    }
  }

  async frontchannel(providerId: number, issuer: unknown, sid: unknown, cookieToken?: string): Promise<boolean> {
    const provider = await this.providers.getProviderByTypeAndIdWithConfiguration(SSOProviderType.OIDC, providerId);
    if (!provider?.oidcConfiguration) throw new BadRequestException('Invalid OIDC provider');
    const context = cookieToken ? await this.sessions.getSsoContext(cookieToken) : null;
    if (issuer !== undefined || sid !== undefined) {
      if (
        typeof issuer !== 'string' ||
        issuer !== provider.oidcConfiguration.issuer ||
        typeof sid !== 'string' ||
        !sid ||
        sid.length > 1024
      )
        throw new BadRequestException('Invalid OIDC browser notification');
      const fresh = await this.sessions.revokeSsoSessionsOnce(
        { protocol: 'OIDC', providerId, issuer, sid },
        {
          key: receiptKey('OIDC-front', providerId, `${issuer}:${sid}`),
          expiresAt: Date.now() + 604800000,
          requireMatch: true,
        },
      );
      return (
        fresh &&
        context?.protocol === 'OIDC' &&
        context.providerId === providerId &&
        context.issuer === issuer &&
        context.sid === sid
      );
    }
    if (
      context?.protocol !== 'OIDC' ||
      context.providerId !== providerId ||
      context.issuer !== provider.oidcConfiguration.issuer
    )
      return false;
    await this.sessions.revokeSession(cookieToken);
    return true;
  }

  private async saml(providerId: number, generateUniqueId?: () => string): Promise<SamlLogoutAdapter> {
    const provider = await this.providers.getProviderByTypeAndIdWithConfiguration(SSOProviderType.SAML, providerId);
    const config = provider?.samlConfiguration;
    if (!config?.idpIssuer || !config.logoutURL || !config.spSigningKeyEncrypted || !config.spSigningCertificate)
      throw new BadRequestException('SAML logout not configured');
    trustedEndpoint(config.logoutURL);
    const callbackUrl = await this.callbackURL('SAML', providerId);
    const shared = SSOSamlStrategy.buildPassportConfig(
      this.moduleRef,
      { providerId, samlConfiguration: config, callbackUrl },
      this.logger,
    );
    if (!shared.privateKey) throw new BadRequestException('SAML logout signing key unavailable');
    return new SamlLogoutAdapter({
      ...(shared as unknown as SamlConfig),
      idpIssuer: config.idpIssuer,
      logoutUrl: config.logoutURL,
      logoutCallbackUrl: callbackUrl,
      wantAuthnResponseSigned: true,
      generateUniqueId,
      // Application correlation is persisted below, rather than node-saml's process-local login cache.
      cacheProvider: {
        saveAsync: async (_key, value) => ({ createdAt: Date.now(), value }),
        getAsync: async () => null,
        removeAsync: async () => null,
      },
    });
  }

  async samlMessage(
    providerId: number,
    container: Record<string, string>,
    originalQuery: string | null,
  ): Promise<string> {
    try {
      const adapter = await this.saml(providerId);
      const message = await adapter.validateMessage(
        container,
        originalQuery,
        await this.callbackURL('SAML', providerId),
      );
      if (message.kind === 'response') {
        if (typeof container.RelayState !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(container.RelayState))
          throw new Error('Invalid RelayState');
        // Include the expected state in the lookup, so a changed unsigned POST RelayState
        // cannot consume the valid outstanding transaction before correlation succeeds.
        const raw = await this.store.takeLogoutState(
          samlTransactionKey(providerId, message.inResponseTo, container.RelayState),
        );
        if (!raw) throw new Error('Expired or consumed request');
        const transaction = JSON.parse(raw) as { state: string; returnTarget: string };
        if (container.RelayState !== transaction.state) throw new Error('RelayState mismatch');
        if (message.status !== 'urn:oasis:names:tc:SAML:2.0:status:Success') return this.returnURL('failed');
        if (message.subStatusCodes?.[0] === 'urn:oasis:names:tc:SAML:2.0:status:PartialLogout')
          return this.returnURL('partial');
        return transaction.returnTarget;
      }
      const fresh = await this.sessions.revokeSsoSessionsOnce(
        {
          protocol: 'SAML',
          providerId,
          issuer: message.issuer,
          nameID: message.nameID,
          nameIDFormat: message.nameIDFormat,
          nameQualifier: message.nameQualifier,
          spNameQualifier: message.spNameQualifier,
          sessionIndexes: message.sessionIndexes,
          issuedBefore: message.issueInstant,
        },
        { key: receiptKey('SAML', providerId, message.id), expiresAt: message.issueInstant + TTL_MS + 30000 },
      );
      if (!fresh) throw new Error('Replayed request');
      return adapter.response(message.id, container.RelayState);
    } catch {
      throw new BadRequestException('Invalid SAML logout exchange');
    }
  }
}
