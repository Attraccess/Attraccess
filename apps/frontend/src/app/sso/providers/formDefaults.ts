import { CreateSSOProviderDto, SSOPermissionMappingsDto, SSOProviderType } from '@attraccess/react-query-client';

export const permissionKeys = ['resource-manager', 'system-admin', 'user-manager', 'billing-manager'] as const;

export type PermissionKey = (typeof permissionKeys)[number];

export const getDefaultOidcConfiguration = () => ({
  issuer: '',
  authorizationURL: '',
  tokenURL: '',
  userInfoURL: '',
  clientId: '',
  clientSecret: '',
});

export const getDefaultSamlConfiguration = () => ({
  entryPoint: '',
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
});

export const emptyPermissionMappingsInput: Record<PermissionKey, string> = {
  'resource-manager': '',
  'system-admin': '',
  'user-manager': '',
  'billing-manager': '',
};

export const defaultProviderValues: CreateSSOProviderDto = {
  name: '',
  type: SSOProviderType.OIDC,
  oidcConfiguration: getDefaultOidcConfiguration(),
  samlConfiguration: getDefaultSamlConfiguration(),
};

export const ensureOidcConfiguration = (config?: CreateSSOProviderDto['oidcConfiguration']) =>
  config ?? getDefaultOidcConfiguration();

export const ensureSamlConfiguration = (config?: CreateSSOProviderDto['samlConfiguration']) =>
  config ?? getDefaultSamlConfiguration();

export const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const buildPermissionMappingInputs = (
  mapping?: SSOPermissionMappingsDto | null,
): Record<PermissionKey, string> => ({
  'resource-manager': Array.isArray((mapping as Record<string, unknown>)?.['resource-manager'])
    ? ((mapping as Record<string, string[]>)?.['resource-manager'] ?? []).join(', ')
    : '',
  'system-admin': Array.isArray((mapping as Record<string, unknown>)?.['system-admin'])
    ? ((mapping as Record<string, string[]>)?.['system-admin'] ?? []).join(', ')
    : '',
  'user-manager': Array.isArray((mapping as Record<string, unknown>)?.['user-manager'])
    ? ((mapping as Record<string, string[]>)?.['user-manager'] ?? []).join(', ')
    : '',
  'billing-manager': Array.isArray((mapping as Record<string, unknown>)?.['billing-manager'])
    ? ((mapping as Record<string, string[]>)?.['billing-manager'] ?? []).join(', ')
    : '',
});
