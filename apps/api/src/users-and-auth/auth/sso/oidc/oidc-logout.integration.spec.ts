import { createServer, Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { exportJWK, generateKeyPair, SignJWT, JWTPayload } from 'jose';
import { ModuleRef } from '@nestjs/core';
import { SSOProviderOIDCConfiguration, SSOProviderType, SsoSessionContext } from '@attraccess/database-entities';
import { OidcTokenVerifier } from './oidc-token-verifier.service';
import { SsoLogoutService } from '../sso-logout.service';
import { SessionService } from '../../session.service';
import { SSOService } from '../sso.service';
import { SessionStore } from '../../session-store/session-store';
import { SettingsService } from '../../../../settings/settings.service';
import { EncryptionService } from '../../../../encryption/encryption.service';

jest.setTimeout(30000);
const event = { 'http://schemas.openid.net/event/backchannel-logout': {} };

describe('Signed OIDC logout with a local discovery/JWKS provider', () => {
  let server: Server;
  let issuer: string;
  let config: SSOProviderOIDCConfiguration;
  let key: Awaited<ReturnType<typeof generateKeyPair>>;
  let verifier: OidcTokenVerifier;
  let service: SsoLogoutService;
  let jwks: { keys: unknown[] };
  let discoveryOverride: Record<string, unknown> | undefined;
  const receipts = new Map<string, { value: string; expiry: number }>();
  const sessions = { revokeSsoSessions: jest.fn(), getSsoContext: jest.fn(), revokeSession: jest.fn() };
  const store = {
    putLogoutState: async (id: string, value: string, expiry: number) => {
      if ((receipts.get(id)?.expiry ?? 0) > Date.now()) return false;
      receipts.set(id, { value, expiry });
      return true;
    },
    takeLogoutState: async (id: string) => {
      const entry = receipts.get(id);
      receipts.delete(id);
      return entry && entry.expiry > Date.now() ? entry.value : null;
    },
  };
  Object.assign(sessions, {
    revokeSsoSessionsOnce: async (selector: unknown, receipt: { key: string; expiresAt: number }) => {
      if (!(await store.putLogoutState(receipt.key, 'seen', receipt.expiresAt))) return false;
      await sessions.revokeSsoSessions(selector);
      return true;
    },
  });
  beforeAll(async () => {
    key = await generateKeyPair('RS256');
    jwks = { keys: [{ ...(await exportJWK(key.publicKey)), kid: 'first', alg: 'RS256' }] };
    server = createServer((request, response) => {
      response.setHeader('Content-Type', 'application/json');
      if (request.url === '/jwks') response.end(JSON.stringify(jwks));
      else if (request.url === '/redirect') {
        response.writeHead(302, { Location: `${issuer}/jwks` });
        response.end();
      } else if (request.url === '/large') response.end(JSON.stringify({ keys: [], large: 'x'.repeat(270000) }));
      else
        response.end(
          JSON.stringify(
            discoveryOverride ?? { issuer, jwks_uri: `${issuer}/jwks`, end_session_endpoint: `${issuer}/logout` },
          ),
        );
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    issuer = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  });
  beforeEach(() => {
    receipts.clear();
    jest.clearAllMocks();
    discoveryOverride = undefined;
    config = {
      ssoProviderId: 1,
      issuer,
      clientId: 'attraccess',
      signingAlgorithms: ['RS256'],
    } as SSOProviderOIDCConfiguration;
    verifier = new OidcTokenVerifier();
    const providers = {
      getProviderByTypeAndIdWithConfiguration: async (type: SSOProviderType, id: number) =>
        type === SSOProviderType.OIDC && id === 1 ? { oidcConfiguration: config } : null,
    } as unknown as SSOService;
    service = new SsoLogoutService(
      providers,
      sessions as unknown as SessionService,
      store as unknown as SessionStore,
      { getUrl: async () => 'https://app.example' } as SettingsService,
      { decrypt: (value: string) => value } as EncryptionService,
      verifier,
      {} as ModuleRef,
    );
  });
  const token = async (overrides: JWTPayload = {}, kid = 'first', signingKey = key.privateKey, algorithm = 'RS256') => {
    const now = Math.floor(Date.now() / 1000);
    return new SignJWT({
      iss: issuer,
      aud: 'attraccess',
      iat: now,
      exp: now + 120,
      jti: 'receipt',
      sub: 'person',
      sid: 'browser',
      events: event,
      ...overrides,
    })
      .setProtectedHeader({ alg: algorithm, kid })
      .sign(signingKey);
  };

  it('validates signed server notifications without a cookie, follows both identifiers, and makes duplicates idempotent', async () => {
    const signed = await token();
    await service.backchannel(1, signed);
    expect(sessions.revokeSsoSessions).toHaveBeenCalledWith(
      expect.objectContaining({ protocol: 'OIDC', providerId: 1, issuer, subject: 'person', sid: 'browser' }),
    );
    await service.backchannel(1, signed);
    expect(sessions.revokeSsoSessions).toHaveBeenCalledTimes(1);
    await service.backchannel(1, await token({ jti: 'subject-only', sid: undefined }));
    await service.backchannel(1, await token({ jti: 'sid-only', sub: undefined }));
    expect(sessions.revokeSsoSessions).toHaveBeenCalledTimes(3);
  });

  it.each([
    { iss: 'https://wrong.example' },
    { aud: 'wrong-client' },
    { iat: undefined },
    { exp: undefined },
    { jti: undefined },
    { events: {} },
    { events: { 'http://schemas.openid.net/event/backchannel-logout': [] } },
    { nonce: 'forbidden' },
    { sub: undefined, sid: undefined },
    { sid: 1 },
    { sub: '' },
    { iat: 1, exp: 121 },
    { exp: 1 },
    { iat: 9999999999, exp: 10000000001 },
  ])('rejects invalid claims without revoking anything: %j', async (claims) => {
    await expect(service.backchannel(1, await token(claims as JWTPayload))).rejects.toThrow('Invalid OIDC');
    expect(sessions.revokeSsoSessions).not.toHaveBeenCalled();
  });

  it('rejects unsigned/tampered tokens, disallowed algorithms and the wrong provider', async () => {
    const signed = await token();
    await expect(service.backchannel(1, signed.slice(0, -10) + 'tampered00')).rejects.toThrow();
    await expect(
      service.backchannel(1, await token({}, 'first', (await generateKeyPair('RS512')).privateKey, 'RS512')),
    ).rejects.toThrow();
    await expect(service.backchannel(1, 'e30.e30.')).rejects.toThrow();
    await expect(service.backchannel(2, signed)).rejects.toThrow();
    expect(sessions.revokeSsoSessions).not.toHaveBeenCalled();
  });

  it('refreshes trusted JWKS once for a newly rotated signing key', async () => {
    await verifier.verify(await token(), config, true);
    const rotated = await generateKeyPair('RS256');
    jwks.keys.push({ ...(await exportJWK(rotated.publicKey)), kid: 'rotated', alg: 'RS256' });
    expect((await verifier.verify(await token({}, 'rotated', rotated.privateKey), config, true)).sub).toBe('person');
  });

  it('rejects mismatched discovery identity, redirects and oversized JWKS; accepts changed provider configuration immediately', async () => {
    discoveryOverride = { issuer: 'https://wrong.example', jwks_uri: `${issuer}/jwks` };
    await expect(verifier.metadata(config)).rejects.toThrow('issuer mismatch');
    config.jwksURL = `${issuer}/redirect`;
    config.endSessionURL = `${issuer}/logout`;
    await expect(verifier.verify(await token(), config, true)).rejects.toThrow();
    config.jwksURL = `${issuer}/large`;
    await expect(verifier.verify(await token(), config, true)).rejects.toThrow();
    config.jwksURL = `${issuer}/jwks`;
    expect((await verifier.verify(await token(), config, true)).sub).toBe('person');
  });

  it('constructs an RP redirect and consumes its state independently of the deleted authentication session', async () => {
    const result = await service.prepare({
      protocol: 'OIDC',
      providerId: 1,
      issuer,
      subject: 'person',
      sid: 'browser',
      idTokenEncrypted: 'hint-fixture',
    });
    expect(result.kind).toBe('redirect');
    const url = new URL(result.redirectUrl);
    expect(url.searchParams.get('id_token_hint')).toBe('hint-fixture');
    expect(url.searchParams.get('post_logout_redirect_uri')).toBe(
      'https://app.example/api/auth/sso/OIDC/1/post-logout',
    );
    const state = url.searchParams.get('state');
    expect(await service.oidcReturn(1, state)).toBe('https://app.example/?ssoLogout=returned');
    await expect(service.oidcReturn(1, state)).rejects.toThrow('Expired or consumed');
    await expect(service.oidcReturn(2, state)).rejects.toThrow();
  });

  it('handles browser session parameters, cookie-only notifications and cookieless notifications without widening scope', async () => {
    const context: SsoSessionContext = { protocol: 'OIDC', providerId: 1, issuer, subject: 'person', sid: 'browser' };
    sessions.getSsoContext.mockResolvedValue(context);
    expect(await service.frontchannel(1, issuer, 'browser')).toBe(false);
    expect(sessions.revokeSsoSessions).toHaveBeenCalledWith({
      protocol: 'OIDC',
      providerId: 1,
      issuer,
      sid: 'browser',
    });
    await service.frontchannel(1, issuer, 'browser');
    expect(sessions.revokeSsoSessions).toHaveBeenCalledTimes(1);
    // A new browser login can have the same provider session ID. Replaying the
    // notification must preserve its cookie as well as its stored session.
    expect(await service.frontchannel(1, issuer, 'browser', 'new-cookie')).toBe(false);
    expect(await service.frontchannel(1, undefined, undefined)).toBe(false);
    expect(await service.frontchannel(1, undefined, undefined, 'cookie')).toBe(true);
    expect(sessions.revokeSession).toHaveBeenCalledWith('cookie');
    sessions.getSsoContext.mockResolvedValue({ ...context, providerId: 2 });
    expect(await service.frontchannel(1, undefined, undefined, 'other-cookie')).toBe(false);
    await expect(service.frontchannel(1, issuer, undefined)).rejects.toThrow();
    await expect(service.frontchannel(1, 'https://wrong.example', 'browser')).rejects.toThrow();
  });
});
