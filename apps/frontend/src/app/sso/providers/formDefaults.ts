import { CreateSsoProviderDtoWritable, SsoProviderType } from '@attraccess/react-query-client';

export const getDefaultOidcConfiguration = () => ({
  issuer: '',
  authorizationURL: '',
  tokenURL: '',
  userInfoURL: '',
  clientId: '',
  clientSecret: '',
  endSessionURL: '',
  jwksURL: '',
  signingAlgorithms: ['RS256'],
  permissionSyncTtlMinutes: null as number | null,
  firstNameClaimPath: '' as string | null,
  lastNameClaimPath: '' as string | null,
});

export { MAX_PERMISSION_SYNC_TTL_MINUTES } from '@attraccess/application-models';

export const getDefaultSamlConfiguration = () => ({
  entryPoint: '',
  idpIssuer: '',
  logoutURL: '',
  issuer: '',
  certificate: '',
  audience: '',
  signRequest: false,
  wantAssertionsSigned: false,
  wantAuthnResponseSigned: true,
  forceAuthn: false,
  provisioningSecret: '',
  spSigningCertificate: '',
  spSigningPrivateKey: '',
  firstNameClaimPath: '' as string | null,
  lastNameClaimPath: '' as string | null,
});

export const defaultProviderValues: CreateSsoProviderDtoWritable = {
  name: '',
  type: SsoProviderType.OIDC,
  oidcConfiguration: getDefaultOidcConfiguration(),
  samlConfiguration: getDefaultSamlConfiguration(),
};

export const ensureOidcConfiguration = (config?: CreateSsoProviderDtoWritable['oidcConfiguration']) =>
  config ?? getDefaultOidcConfiguration();

export const ensureSamlConfiguration = (config?: CreateSsoProviderDtoWritable['samlConfiguration']) =>
  config ?? getDefaultSamlConfiguration();

export const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export interface RoleMappingEntry {
  roleKey: string;
  ssoRole: string;
}

/** Flatten a server-side role mapping (role key → SSO role names) into table entries. */
export const buildRoleMappingEntries = (mapping?: Record<string, string[]> | null): RoleMappingEntry[] =>
  Object.entries(mapping ?? {}).flatMap(([roleKey, ssoRoles]) =>
    (Array.isArray(ssoRoles) ? ssoRoles : []).map((ssoRole) => ({ roleKey, ssoRole })),
  );

/** Group table entries back into the server-side role mapping shape. */
export const buildRoleMappingsPayload = (entries: RoleMappingEntry[]): Record<string, string[]> | undefined => {
  const mappings: Record<string, string[]> = {};
  for (const { roleKey, ssoRole } of entries) {
    const value = ssoRole.trim();
    if (!value) continue;
    mappings[roleKey] = mappings[roleKey] ?? [];
    if (!mappings[roleKey].includes(value)) mappings[roleKey].push(value);
  }
  return Object.keys(mappings).length > 0 ? mappings : undefined;
};
