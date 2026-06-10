import { CreateSSOProviderDto, SSOPermissionMappingsDto, SSOProviderType } from '@attraccess/react-query-client';

export const permissionKeys = [
  'canManageResources',
  'canManageSystemConfiguration',
  'canManageUsers',
  'canManageBilling',
] as const;

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
  canManageResources: '',
  canManageSystemConfiguration: '',
  canManageUsers: '',
  canManageBilling: '',
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
  canManageResources: Array.isArray(mapping?.canManageResources) ? mapping?.canManageResources.join(', ') : '',
  canManageSystemConfiguration: Array.isArray(mapping?.canManageSystemConfiguration)
    ? mapping?.canManageSystemConfiguration.join(', ')
    : '',
  canManageUsers: Array.isArray(mapping?.canManageUsers) ? mapping?.canManageUsers.join(', ') : '',
  canManageBilling: Array.isArray(mapping?.canManageBilling) ? mapping?.canManageBilling.join(', ') : '',
});
