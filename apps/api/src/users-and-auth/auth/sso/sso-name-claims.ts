import { get } from 'lodash-es';
import { normalizeUserName, USER_NAME_MAX_LENGTH } from '../../users/accounts/normalize-name';

/** The first and last name an identity provider released. A name the provider did not release is undefined. */
export interface SsoNameClaims {
  firstName?: string;
  lastName?: string;
}

/** What the config adds to the defaults: a configured path replaces them, because it names the one place to read. */
interface NameClaimPaths {
  firstNameClaimPath?: string | null;
  lastNameClaimPath?: string | null;
}

export const OIDC_DEFAULT_FIRST_NAME_PATHS = ['given_name', 'name.givenName'];
export const OIDC_DEFAULT_LAST_NAME_PATHS = ['family_name', 'name.familyName'];
export const SAML_DEFAULT_FIRST_NAME_KEYS = [
  'givenName',
  'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname',
];
export const SAML_DEFAULT_LAST_NAME_KEYS = ['surname', 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname'];

/** A claim value as a stored name: a string (or the first string of a list), trimmed, never blank, at most 100 characters. */
function asName(value: unknown): string | undefined {
  const text = Array.isArray(value) ? value.find((entry) => typeof entry === 'string') : value;
  if (typeof text !== 'string') return undefined;
  return normalizeUserName(text)?.slice(0, USER_NAME_MAX_LENGTH) ?? undefined;
}

function configuredOr(configured: string | null | undefined, defaults: string[]): string[] {
  const path = configured?.trim();
  return path ? [path] : defaults;
}

function firstName(paths: string[], read: (path: string) => unknown): string | undefined {
  for (const path of paths) {
    const name = asName(read(path));
    if (name) return name;
  }
  return undefined;
}

/** Names from the OIDC profile, userinfo (`_json`) and id-token claims. */
export function resolveOidcNameClaims(sources: unknown[], config: NameClaimPaths): SsoNameClaims {
  const read = (path: string) => sources.map((source) => get(source, path)).find((value) => asName(value));
  return {
    firstName: firstName(configuredOr(config.firstNameClaimPath, OIDC_DEFAULT_FIRST_NAME_PATHS), read),
    lastName: firstName(configuredOr(config.lastNameClaimPath, OIDC_DEFAULT_LAST_NAME_PATHS), read),
  };
}

/** Names from the SAML profile and its attribute bag; the configured attribute key replaces the defaults. */
export function resolveSamlNameClaims(profile: unknown, config: NameClaimPaths): SsoNameClaims {
  const record = profile as Record<string, unknown>;
  const attributes = record.attributes as Record<string, unknown> | undefined;
  // A key holding dots or colons (a claim URI) is one attribute name, not a path.
  const read = (key: string) => (asName(record[key]) ? record[key] : attributes?.[key]);
  return {
    firstName: firstName(configuredOr(config.firstNameClaimPath, SAML_DEFAULT_FIRST_NAME_KEYS), read),
    lastName: firstName(configuredOr(config.lastNameClaimPath, SAML_DEFAULT_LAST_NAME_KEYS), read),
  };
}
