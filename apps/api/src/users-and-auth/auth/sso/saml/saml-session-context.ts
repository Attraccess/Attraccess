import { DOMParser } from '@xmldom/xmldom';
import { SsoSessionContext } from '@attraccess/database-entities';
import { Profile as SamlProfile } from '@node-saml/passport-saml';

const ASSERTION = 'urn:oasis:names:tc:SAML:2.0:assertion';

type SamlSessionContext = Extract<SsoSessionContext, { protocol: 'SAML' }>;

/** Reads the provider IssueInstant and every AuthnStatement SessionIndex from the verified assertion. */
function readAssertionEvidence(profile: SamlProfile): { providerIssuedAt: number; indexes: string[] } {
  const assertionXml =
    typeof profile.getAssertionXml === 'function' ? (profile.getAssertionXml() as string) : undefined;
  const assertion = assertionXml ? new DOMParser().parseFromString(assertionXml, 'text/xml') : undefined;
  const providerIssuedAt = Date.parse(assertion?.documentElement.getAttribute('IssueInstant') ?? '');
  const indexes = assertion
    ? Array.from(assertion.getElementsByTagNameNS(ASSERTION, 'AuthnStatement'))
        .map((node) => node.getAttribute('SessionIndex'))
        .filter((index): index is string => !!index)
    : [];
  return { providerIssuedAt, indexes };
}

/** Builds the logout selector evidence stored with a SAML login session. */
export function buildSamlSessionContext(profile: SamlProfile, providerId: number, nameID: string): SamlSessionContext {
  const { providerIssuedAt, indexes } = readAssertionEvidence(profile);
  return {
    protocol: 'SAML',
    ...(Number.isFinite(providerIssuedAt) ? { providerIssuedAt } : {}),
    providerId,
    issuer: typeof profile.issuer === 'string' ? profile.issuer : undefined,
    nameID,
    ...(typeof profile.nameIDFormat === 'string' && profile.nameIDFormat ? { nameIDFormat: profile.nameIDFormat } : {}),
    ...(typeof profile.nameQualifier === 'string' && profile.nameQualifier
      ? { nameQualifier: profile.nameQualifier }
      : {}),
    ...(typeof profile.spNameQualifier === 'string' && profile.spNameQualifier
      ? { spNameQualifier: profile.spNameQualifier }
      : {}),
    sessionIndexes: indexes.length ? indexes : typeof profile.sessionIndex === 'string' ? [profile.sessionIndex] : [],
  };
}
