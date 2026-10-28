import { Profile as SamlProfile } from '@node-saml/passport-saml';
import { buildSamlSessionContext } from './saml-session-context';

describe('buildSamlSessionContext', () => {
  const assertion = (attributes: string, statements: string) =>
    `<saml:Assertion xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ${attributes}>${statements}</saml:Assertion>`;

  it('prefers every signed AuthnStatement SessionIndex over the profile session index', () => {
    const profile = {
      nameID: 'alice',
      issuer: 'https://idp.example',
      sessionIndex: 'profile-index',
      getAssertionXml: () =>
        assertion(
          'IssueInstant="2026-10-08T12:00:00Z"',
          '<saml:AuthnStatement SessionIndex="a"/><saml:AuthnStatement/><saml:AuthnStatement SessionIndex="b"/>',
        ),
    } as unknown as SamlProfile;

    expect(buildSamlSessionContext(profile, 3, 'alice')).toEqual({
      protocol: 'SAML',
      providerIssuedAt: Date.parse('2026-10-08T12:00:00Z'),
      providerId: 3,
      issuer: 'https://idp.example',
      nameID: 'alice',
      sessionIndexes: ['a', 'b'],
    });
  });

  it('falls back to the profile session index and omits an unparseable IssueInstant', () => {
    const profile = {
      nameID: 'alice',
      sessionIndex: 'profile-index',
      getAssertionXml: () => assertion('IssueInstant="not-a-date"', '<saml:AuthnStatement/>'),
    } as unknown as SamlProfile;

    const context = buildSamlSessionContext(profile, 3, 'alice');
    expect(context).not.toHaveProperty('providerIssuedAt');
    expect(context.sessionIndexes).toEqual(['profile-index']);
  });

  it('stores no session indexes or optional qualifiers when the profile has none', () => {
    const profile = {
      nameID: 'alice',
      issuer: 7,
      nameIDFormat: '',
      nameQualifier: '',
      spNameQualifier: 5,
      sessionIndex: 9,
    } as unknown as SamlProfile;

    expect(buildSamlSessionContext(profile, 3, 'alice')).toEqual({
      protocol: 'SAML',
      providerId: 3,
      issuer: undefined,
      nameID: 'alice',
      sessionIndexes: [],
    });
  });

  it('keeps non-empty name qualifiers from the profile', () => {
    const profile = {
      nameID: 'alice',
      nameIDFormat: 'urn:format',
      nameQualifier: 'idp',
      spNameQualifier: 'sp',
    } as unknown as SamlProfile;

    expect(buildSamlSessionContext(profile, 3, 'alice')).toMatchObject({
      nameIDFormat: 'urn:format',
      nameQualifier: 'idp',
      spNameQualifier: 'sp',
    });
  });
});
