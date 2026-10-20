import { SAML, ValidateInResponseTo } from '@node-saml/node-saml';
import { SignedXml } from 'xml-crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Request } from 'express';
import { SessionStore } from '../../session-store/session-store';
import { browserBoundSamlCache } from './saml-request-cache';

// Real parser and signatures: successful assertions must still be tied to one browser.
describe('browser-bound SAML login', () => {
  let directory: string, cert: string, key: string;
  const states = new Map<string, { value: string; expiry: number }>();
  const store = {
    async putLogoutState(id: string, value: string, expiry: number) {
      if (states.has(id)) return false;
      states.set(id, { value, expiry });
      return true;
    },
    async takeLogoutState(id: string) {
      const entry = states.get(id);
      states.delete(id);
      return entry && entry.expiry > Date.now() ? entry.value : null;
    },
  } as SessionStore;
  const destination = 'https://app.example/api/auth/sso/SAML/7/callback';
  beforeAll(() => {
    directory = mkdtempSync(join(tmpdir(), 'saml-login-'));
    execFileSync(
      'openssl',
      [
        'req',
        '-x509',
        '-newkey',
        'rsa:2048',
        '-nodes',
        '-subj',
        '/CN=test',
        '-keyout',
        join(directory, 'key'),
        '-out',
        join(directory, 'cert'),
        '-days',
        '1',
      ],
      { stdio: 'ignore' },
    );
    cert = readFileSync(join(directory, 'cert'), 'utf8');
    key = readFileSync(join(directory, 'key'), 'utf8');
  });
  afterAll(() => rmSync(directory, { recursive: true, force: true }));
  beforeEach(() => states.clear());
  function browser(cookies: Record<string, string> = {}, callback = false, provider = 7) {
    const req = {
      path: callback ? '/callback' : '/login',
      cookies,
      query: { RelayState: 'https://app.example/' },
      body: { RelayState: 'https://app.example/' },
      res: {
        cookie: jest.fn((name, value) => {
          cookies[name] = value;
        }),
        clearCookie: jest.fn(),
      },
    } as unknown as Request;
    return new SAML({
      callbackUrl: destination,
      issuer: 'sp',
      idpCert: cert,
      audience: 'sp',
      entryPoint: 'https://idp.example/sso',
      wantAssertionsSigned: true,
      wantAuthnResponseSigned: true,
      validateInResponseTo: ValidateInResponseTo.always,
      cacheProvider: browserBoundSamlCache(store, req, provider, true),
    });
  }
  function response(id?: string) {
    const now = new Date().toISOString(),
      end = new Date(Date.now() + 60000).toISOString();
    const correlation = id ? ` InResponseTo="${id}"` : '';
    let xml = `<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="_response" Version="2.0" IssueInstant="${now}" Destination="${destination}"${correlation}><saml:Issuer>idp</saml:Issuer><samlp:Status><samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/></samlp:Status><saml:Assertion ID="_assertion" Version="2.0" IssueInstant="${now}"><saml:Issuer>idp</saml:Issuer><saml:Subject><saml:NameID>person</saml:NameID><saml:SubjectConfirmation Method="urn:oasis:names:tc:SAML:2.0:cm:bearer"><saml:SubjectConfirmationData Recipient="${destination}" NotOnOrAfter="${end}"${correlation}/></saml:SubjectConfirmation></saml:Subject><saml:Conditions NotBefore="${now}" NotOnOrAfter="${end}"><saml:AudienceRestriction><saml:Audience>sp</saml:Audience></saml:AudienceRestriction></saml:Conditions><saml:AuthnStatement AuthnInstant="${now}" SessionIndex="session"/></saml:Assertion></samlp:Response>`;
    for (const element of ['Assertion', 'Response']) {
      const signer = new SignedXml({ privateKey: key, publicCert: cert });
      signer.signatureAlgorithm = 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256';
      signer.canonicalizationAlgorithm = 'http://www.w3.org/2001/10/xml-exc-c14n#';
      signer.addReference({
        xpath: `//*[local-name()='${element}']`,
        transforms: [
          'http://www.w3.org/2000/09/xmldsig#enveloped-signature',
          'http://www.w3.org/2001/10/xml-exc-c14n#',
        ],
        digestAlgorithm: 'http://www.w3.org/2001/04/xmlenc#sha256',
      });
      signer.computeSignature(xml, {
        location: { reference: `//*[local-name()='${element}']/*[local-name()='Issuer']`, action: 'after' },
      });
      xml = signer.getSignedXml();
    }
    return { SAMLResponse: Buffer.from(xml).toString('base64'), RelayState: 'https://app.example/' };
  }
  async function initiate(cookies: Record<string, string>) {
    const saml = browser(cookies);
    const xml = await saml.generateAuthorizeRequestAsync(false, false);
    return /ID="([^"]+)"/.exec(xml)[1];
  }
  it('accepts one matching signed response and rejects replay', async () => {
    const cookies = {};
    const id = await initiate(cookies);
    expect((await browser(cookies, true).validatePostResponseAsync(response(id))).profile.nameID).toBe('person');
    await expect(browser(cookies, true).validatePostResponseAsync(response(id))).rejects.toThrow();
  });
  it.each(['other-browser', 'other-provider', 'unsolicited', 'mismatched', 'expired'])(
    'rejects %s assertions',
    async (kind) => {
      const cookies = {};
      const id = await initiate(cookies);
      if (kind === 'expired') for (const entry of states.values()) entry.expiry = 0;
      const saml = browser(kind === 'other-browser' ? {} : cookies, true, kind === 'other-provider' ? 8 : 7);
      await expect(
        saml.validatePostResponseAsync(
          response(kind === 'unsolicited' ? undefined : kind === 'mismatched' ? '_wrong' : id),
        ),
      ).rejects.toThrow();
    },
  );
});
