import { SsoSessionContext } from '@attraccess/database-entities';
import { matchesSsoSession, SsoSessionSelector } from './sso-session-selector';

describe('matchesSsoSession', () => {
  const oidc: SsoSessionContext = {
    protocol: 'OIDC',
    providerId: 1,
    issuer: 'https://idp.example',
    subject: 'subject-1',
    sid: 'sid-1',
    providerIssuedAt: 1000,
  };
  const saml: SsoSessionContext = {
    protocol: 'SAML',
    providerId: 2,
    issuer: 'https://saml.example',
    nameID: 'alice',
    nameIDFormat: 'urn:format',
    nameQualifier: 'idp-qualifier',
    spNameQualifier: 'sp-qualifier',
    sessionIndexes: ['index-1', 'index-2'],
  };
  const oidcSelector: SsoSessionSelector = { protocol: 'OIDC', providerId: 1, issuer: oidc.issuer, sid: 'sid-1' };
  const samlSelector: SsoSessionSelector = {
    protocol: 'SAML',
    providerId: 2,
    issuer: 'https://saml.example',
    nameID: 'alice',
    nameIDFormat: 'urn:format',
    nameQualifier: 'idp-qualifier',
    spNameQualifier: 'sp-qualifier',
  };

  it('rejects missing contexts and other providers or protocols', () => {
    expect(matchesSsoSession(null, oidcSelector)).toBe(false);
    expect(matchesSsoSession(undefined, oidcSelector)).toBe(false);
    expect(matchesSsoSession(oidc, { ...oidcSelector, providerId: 9 })).toBe(false);
    expect(matchesSsoSession({ ...saml, providerId: 1 }, oidcSelector)).toBe(false);
  });

  it('only rejects sessions issued after the selector when both provider timestamps exist', () => {
    expect(matchesSsoSession(oidc, { ...oidcSelector, issuedBefore: 999 })).toBe(false);
    expect(matchesSsoSession(oidc, { ...oidcSelector, issuedBefore: 1000 })).toBe(true);
    expect(matchesSsoSession({ ...oidc, providerIssuedAt: undefined }, { ...oidcSelector, issuedBefore: 1 })).toBe(
      true,
    );
  });

  it('matches OIDC sessions by issuer and the supplied subject or sid', () => {
    expect(
      matchesSsoSession(oidc, { protocol: 'OIDC', providerId: 1, issuer: oidc.issuer, subject: 'subject-1' }),
    ).toBe(true);
    expect(matchesSsoSession(oidc, { ...oidcSelector, subject: 'subject-1' })).toBe(true);
    expect(matchesSsoSession(oidc, { ...oidcSelector, subject: 'other' })).toBe(false);
    expect(matchesSsoSession(oidc, { ...oidcSelector, sid: 'other' })).toBe(false);
    expect(matchesSsoSession(oidc, { ...oidcSelector, issuer: 'https://other.example' })).toBe(false);
  });

  it('never matches an OIDC selector without subject or sid', () => {
    expect(matchesSsoSession(oidc, { protocol: 'OIDC', providerId: 1, issuer: oidc.issuer })).toBe(false);
  });

  it('matches SAML sessions by issuer, name identifier and qualifiers', () => {
    expect(matchesSsoSession(saml, samlSelector)).toBe(true);
    expect(matchesSsoSession(saml, { ...samlSelector, issuer: undefined })).toBe(true);
    expect(matchesSsoSession(saml, { ...samlSelector, issuer: 'https://other.example' })).toBe(false);
    expect(matchesSsoSession(saml, { ...samlSelector, nameID: 'bob' })).toBe(false);
    expect(matchesSsoSession(saml, { ...samlSelector, nameIDFormat: undefined })).toBe(false);
    expect(matchesSsoSession(saml, { ...samlSelector, nameQualifier: undefined })).toBe(false);
    expect(matchesSsoSession(saml, { ...samlSelector, spNameQualifier: undefined })).toBe(false);
  });

  it('treats absent SAML qualifiers on both sides as equal', () => {
    const bare: SsoSessionContext = { protocol: 'SAML', providerId: 2, nameID: 'alice', sessionIndexes: [] };
    expect(matchesSsoSession(bare, { protocol: 'SAML', providerId: 2, nameID: 'alice' })).toBe(true);
    expect(matchesSsoSession(bare, { protocol: 'SAML', providerId: 2, nameID: 'alice', nameIDFormat: 'x' })).toBe(
      false,
    );
  });

  it('requires one shared SAML session index when the selector names any', () => {
    expect(matchesSsoSession(saml, { ...samlSelector, sessionIndexes: [] })).toBe(true);
    expect(matchesSsoSession(saml, { ...samlSelector, sessionIndexes: ['other', 'index-2'] })).toBe(true);
    expect(matchesSsoSession(saml, { ...samlSelector, sessionIndexes: ['other'] })).toBe(false);
  });
});
