import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SignedXml } from 'xml-crypto';
import { inflateRawSync } from 'node:zlib';
import { Profile } from '@node-saml/node-saml';
import { ModuleRef } from '@nestjs/core';
import { SSOProviderSAMLConfiguration, SSOProviderType } from '@attraccess/database-entities';
import { SamlLogoutAdapter } from './saml-logout-adapter';
import { SsoLogoutService } from '../sso-logout.service';
import { SSOService } from '../sso.service';
import { SessionService } from '../../session.service';
import { SessionStore } from '../../session-store/session-store';
import { SettingsService } from '../../../../settings/settings.service';
import { EncryptionService } from '../../../../encryption/encryption.service';
import { OidcTokenVerifier } from '../oidc/oidc-token-verifier.service';

jest.setTimeout(30000);
const destination = 'https://app.example/api/auth/sso/SAML/2/slo';
const idpDestination = 'https://idp.example/slo';
const success = 'urn:oasis:names:tc:SAML:2.0:status:Success';
const context = {
  protocol: 'SAML' as const,
  providerId: 2,
  issuer: 'idp',
  nameID: 'person',
  nameIDFormat: 'format',
  nameQualifier: 'idp-qualifier',
  spNameQualifier: 'sp-qualifier',
  sessionIndexes: ['first', 'second'],
};
const decodeRedirect = (url: string) => {
  const parsed = new URL(url);
  return { values: Object.fromEntries(parsed.searchParams), query: parsed.search.slice(1) };
};

describe('SAML Single Logout using real node-saml 5.1.0 signatures and XML', () => {
  let directory: string;
  let cert: string;
  let privateKey: string;
  let spCert: string;
  let spKey: string;
  let adapter: SamlLogoutAdapter;
  let provider: SamlLogoutAdapter;
  let config: SSOProviderSAMLConfiguration;
  let service: SsoLogoutService;
  const sessions = { revokeSsoSessions: jest.fn() };
  const states = new Map<string, { value: string; expiry: number }>();
  const store = {
    putLogoutState: async (key: string, value: string, expiry: number) => {
      if ((states.get(key)?.expiry ?? 0) > Date.now()) return false;
      states.set(key, { value, expiry });
      return true;
    },
    takeLogoutState: async (key: string) => {
      const entry = states.get(key);
      states.delete(key);
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
  beforeAll(() => {
    directory = mkdtempSync(join(tmpdir(), 'attraccess-slo-'));
    for (const name of ['idp', 'sp'])
      execFileSync(
        'openssl',
        [
          'req',
          '-x509',
          '-newkey',
          'rsa:2048',
          '-nodes',
          '-subj',
          `/CN=${name}-logout-test`,
          '-keyout',
          join(directory, `${name}.key`),
          '-out',
          join(directory, `${name}.pem`),
          '-days',
          '1',
        ],
        { stdio: 'ignore' },
      );
    cert = readFileSync(join(directory, 'idp.pem'), 'utf8');
    privateKey = readFileSync(join(directory, 'idp.key'), 'utf8');
    spCert = readFileSync(join(directory, 'sp.pem'), 'utf8');
    spKey = readFileSync(join(directory, 'sp.key'), 'utf8');
  });
  afterAll(() => rmSync(directory, { recursive: true, force: true }));
  beforeEach(() => {
    jest.clearAllMocks();
    states.clear();
    adapter = new SamlLogoutAdapter({
      callbackUrl: destination,
      issuer: 'sp',
      idpIssuer: 'idp',
      idpCert: cert,
      entryPoint: idpDestination,
      logoutUrl: idpDestination,
      privateKey: spKey,
    });
    provider = new SamlLogoutAdapter({
      callbackUrl: idpDestination,
      issuer: 'idp',
      idpIssuer: 'sp',
      idpCert: spCert,
      entryPoint: destination,
      logoutUrl: destination,
      privateKey,
    });
    config = {
      ssoProviderId: 2,
      issuer: 'sp',
      idpIssuer: 'idp',
      entryPoint: idpDestination,
      logoutURL: idpDestination,
      certificate: cert,
      spSigningKeyEncrypted: spKey,
      spSigningCertificate: spCert,
    } as SSOProviderSAMLConfiguration;
    const providers = {
      getProviderByTypeAndIdWithConfiguration: async (type: SSOProviderType, id: number) =>
        type === SSOProviderType.SAML && id === 2 ? { samlConfiguration: config } : null,
    } as unknown as SSOService;
    const encryption = { decrypt: (value: string) => value } as EncryptionService;
    service = new SsoLogoutService(
      providers,
      sessions as unknown as SessionService,
      store as unknown as SessionStore,
      { getUrl: async () => 'https://app.example' } as SettingsService,
      encryption,
      {} as OidcTokenVerifier,
      { get: () => encryption } as unknown as ModuleRef,
    );
  });
  function signedPost(xml: string): string {
    const signer = new SignedXml({ privateKey, publicCert: cert });
    signer.signatureAlgorithm = 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256';
    signer.canonicalizationAlgorithm = 'http://www.w3.org/2001/10/xml-exc-c14n#';
    signer.addReference({
      xpath: '/*',
      digestAlgorithm: 'http://www.w3.org/2001/04/xmlenc#sha256',
      transforms: ['http://www.w3.org/2000/09/xmldsig#enveloped-signature', 'http://www.w3.org/2001/10/xml-exc-c14n#'],
    });
    signer.computeSignature(xml);
    return Buffer.from(signer.getSignedXml()).toString('base64');
  }
  const requestXml = async () => {
    const { values } = decodeRedirect(await provider.request(context, 'provider-state'));
    return inflateRawSync(Buffer.from(values.SAMLRequest, 'base64')).toString('utf8');
  };

  it('accepts signed Redirect/POST requests, retaining complete NameID and every SessionIndex', async () => {
    const redirect = decodeRedirect(await provider.request(context, 'provider-state'));
    const message = await adapter.validateMessage(redirect.values, redirect.query, destination);
    expect(message).toMatchObject({
      kind: 'request',
      nameID: context.nameID,
      nameIDFormat: context.nameIDFormat,
      nameQualifier: context.nameQualifier,
      spNameQualifier: context.spNameQualifier,
      sessionIndexes: context.sessionIndexes,
    });
    expect(
      await adapter.validateMessage({ SAMLRequest: signedPost(await requestXml()) }, null, destination),
    ).toMatchObject({ kind: 'request', sessionIndexes: context.sessionIndexes });
  });

  it('initiates a signed request and consumes a signed correlated Redirect response exactly once', async () => {
    const result = await service.prepare(context);
    expect(result.kind).toBe('redirect');
    const outbound = decodeRedirect(result.redirectUrl);
    const message = await provider.validateMessage(outbound.values, outbound.query, idpDestination);
    expect(message.nameQualifier).toBe(context.nameQualifier);
    expect(message.sessionIndexes).toEqual(context.sessionIndexes);
    const inbound = decodeRedirect(await provider.response(message.id, outbound.values.RelayState));
    expect(await service.samlMessage(2, inbound.values, inbound.query)).toBe('https://app.example/?ssoLogout=returned');
    await expect(service.samlMessage(2, inbound.values, inbound.query)).rejects.toThrow('Invalid SAML');
    expect(sessions.revokeSsoSessions).not.toHaveBeenCalled();
  });

  it('validates signed POST responses, rejects wrong correlation and reports provider failure/partial status honestly', async () => {
    for (const status of [
      success,
      'urn:oasis:names:tc:SAML:2.0:status:PartialLogout',
      'urn:oasis:names:tc:SAML:2.0:status:Responder',
    ]) {
      const outbound = decodeRedirect((await service.prepare(context)).redirectUrl);
      const message = await provider.validateMessage(outbound.values, outbound.query, idpDestination);
      const xml = provider._generateLogoutResponse({ ID: message.id } as Profile, true).replace(success, status);
      const expected = status === success ? 'returned' : status.endsWith('PartialLogout') ? 'partial' : 'failed';
      expect(
        await service.samlMessage(2, { SAMLResponse: signedPost(xml), RelayState: outbound.values.RelayState }, null),
      ).toBe(`https://app.example/?ssoLogout=${expected}`);
    }
    const xml = provider._generateLogoutResponse({ ID: 'unknown' } as Profile, true);
    await expect(
      service.samlMessage(2, { SAMLResponse: signedPost(xml), RelayState: 'not-outstanding' }, null),
    ).rejects.toThrow();
  });

  it('provider initiation follows the message scope, returns a signed correlated response and rejects replays', async () => {
    const request = decodeRedirect(await provider.request(context, 'state'));
    const inbound = await adapter.validateMessage(request.values, request.query, destination);
    const response = decodeRedirect(await service.samlMessage(2, request.values, request.query));
    expect(sessions.revokeSsoSessions).toHaveBeenCalledWith(
      expect.objectContaining({
        providerId: 2,
        nameID: context.nameID,
        sessionIndexes: context.sessionIndexes,
        spNameQualifier: context.spNameQualifier,
      }),
    );
    expect(await provider.validateMessage(response.values, response.query, idpDestination)).toMatchObject({
      kind: 'response',
      inResponseTo: inbound.id,
      status: success,
    });
    await expect(service.samlMessage(2, request.values, request.query)).rejects.toThrow();
    expect(sessions.revokeSsoSessions).toHaveBeenCalledTimes(1);
    await service.samlMessage(
      2,
      {
        SAMLRequest: signedPost(
          (await requestXml()).replace(/<[^>]*SessionIndex[^>]*>[^<]*<\/[^>]*SessionIndex>/g, ''),
        ),
      },
      null,
    );
    expect(sessions.revokeSsoSessions).toHaveBeenLastCalledWith(expect.objectContaining({ sessionIndexes: [] }));
  });

  it('rejects unsigned, tampered, misdirected, stale, wrong-provider and malformed requests before revocation', async () => {
    const xml = await requestXml();
    for (const changed of [
      xml.replace('Destination="' + destination, 'Destination="https://wrong.example'),
      xml.replace('>idp<', '>wrong-provider<'),
      xml.replace(/IssueInstant="[^"]+"/, 'IssueInstant="2001-01-01T00:00:00Z"'),
      xml.replace(/Version="2.0"/, 'Version="1.0"'),
    ]) {
      await expect(service.samlMessage(2, { SAMLRequest: signedPost(changed) }, null)).rejects.toThrow();
    }
    await expect(service.samlMessage(2, { SAMLRequest: Buffer.from(xml).toString('base64') }, null)).rejects.toThrow();
    const tampered = Buffer.from(signedPost(xml), 'base64').toString().replace('>person<', '>attacker<');
    await expect(
      service.samlMessage(2, { SAMLRequest: Buffer.from(tampered).toString('base64') }, null),
    ).rejects.toThrow();
    const redirect = decodeRedirect(await provider.request(context, 'state'));
    await expect(
      service.samlMessage(2, { ...redirect.values, Signature: undefined }, redirect.query),
    ).rejects.toThrow();
    await expect(service.samlMessage(2, redirect.values, redirect.query + '&SAMLRequest=other')).rejects.toThrow();
    await expect(service.samlMessage(3, redirect.values, redirect.query)).rejects.toThrow();
    await expect(service.samlMessage(2, { SAMLRequest: 'garbage' }, null)).rejects.toThrow();
    expect(sessions.revokeSsoSessions).not.toHaveBeenCalled();
  });

  it('rejects unsigned, tampered, misdirected, wrong-issuer and expired responses without consuming a valid transaction', async () => {
    const outbound = decodeRedirect((await service.prepare(context)).redirectUrl);
    const request = await provider.validateMessage(outbound.values, outbound.query, idpDestination);
    const xml = provider._generateLogoutResponse({ ID: request.id } as Profile, true);
    await expect(
      service.samlMessage(2, { SAMLResponse: signedPost(xml), RelayState: 'x'.repeat(43) }, null),
    ).rejects.toThrow();
    for (const response of [
      Buffer.from(xml).toString('base64'),
      signedPost(xml.replace('>idp<', '>wrong<')),
      signedPost(xml.replace('Destination="' + destination, 'Destination="https://wrong.example')),
      signedPost(xml.replace(/IssueInstant="[^"]+"/, 'IssueInstant="2001-01-01T00:00:00Z"')),
    ]) {
      await expect(
        service.samlMessage(2, { SAMLResponse: response, RelayState: outbound.values.RelayState }, null),
      ).rejects.toThrow();
    }
    expect(
      await service.samlMessage(2, { SAMLResponse: signedPost(xml), RelayState: outbound.values.RelayState }, null),
    ).toContain('returned');
  });

  it('does not send incomplete logout requests without correlation or signing material', async () => {
    expect(await service.prepare({ ...context, sessionIndexes: [] })).toEqual({
      kind: 'local_only',
      reason: 'missing_correlation',
    });
    config.spSigningKeyEncrypted = null;
    expect(await service.prepare(context)).toEqual({ kind: 'local_only', reason: 'provider_unavailable' });
    expect(states.size).toBe(0);
  });

  it('never sends an unsigned exchange when the stored signing key cannot be decrypted', async () => {
    const moduleRef = (service as unknown as { moduleRef: ModuleRef }).moduleRef;
    jest.spyOn(moduleRef, 'get').mockReturnValue({
      decrypt: () => {
        throw new Error('Unavailable key');
      },
    });
    expect(await service.prepare(context)).toEqual({ kind: 'local_only', reason: 'provider_failed' });
    expect(states.size).toBe(0);
    const request = decodeRedirect(await provider.request(context, 'state'));
    await expect(service.samlMessage(2, request.values, request.query)).rejects.toThrow('Invalid SAML');
    expect(sessions.revokeSsoSessions).not.toHaveBeenCalled();
  });
});
