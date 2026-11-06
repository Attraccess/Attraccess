import type { CreateOIDCConfigurationDto, CreateSSOProviderDto, SSOProvider } from '@attraccess/react-query-client';
import {
  ensureOidcConfiguration,
  ensureSamlConfiguration,
  buildRoleMappingsPayload,
  RoleMappingEntry,
} from '../formDefaults';

/**
 * Payload value for an edited list: the entries when there are any; `null` when the list was emptied
 * and the provider had stored entries (clears them, so defaults apply); otherwise omitted. Only sent
 * when stored values exist, so plain edits by users without `users.roles.manage` keep working.
 */
const listPayload = (values: string[], stored: string[] | null | undefined) => {
  if (values.length > 0) return values;
  return stored?.length ? null : undefined;
};

const sanitizeOptional = (value?: string) => (value && value.trim().length > 0 ? value.trim() : undefined);

const hasStoredMappings = (config?: { roleMappings?: Record<string, unknown> | null }) =>
  Object.keys(config?.roleMappings ?? {}).length > 0;

export function buildOidcPayload({
  formValues,
  scopes,
  usernameClaimPaths,
  emailClaimPaths,
  roleClaimPaths,
  oidcRoleMappingEntries,
  isEditing,
  providerDetails,
}: {
  formValues: CreateSSOProviderDto;
  scopes: string[];
  usernameClaimPaths: string[];
  emailClaimPaths: string[];
  roleClaimPaths: string[];
  oidcRoleMappingEntries: RoleMappingEntry[];
  isEditing: boolean;
  providerDetails: SSOProvider | undefined;
}) {
  const base = ensureOidcConfiguration(formValues.oidcConfiguration);
  const payload: CreateOIDCConfigurationDto = {
    issuer: base.issuer,
    endSessionURL: base.endSessionURL?.trim() || null,
    jwksURL: base.jwksURL?.trim() || null,
    // an emptied list falls back to the only algorithm every provider supports
    signingAlgorithms: base.signingAlgorithms?.length ? base.signingAlgorithms : ['RS256'],
    authorizationURL: base.authorizationURL,
    tokenURL: base.tokenURL,
    userInfoURL: base.userInfoURL,
    clientId: base.clientId,
    clientSecret: base.clientSecret,
    // null turns session-time permission re-sync off
    permissionSyncTtlMinutes: base.permissionSyncTtlMinutes ?? null,
  };

  const stored = providerDetails?.oidcConfiguration;
  const lists = {
    scopes: listPayload(scopes, stored?.scopes),
    usernameClaimPaths: listPayload(usernameClaimPaths, stored?.usernameClaimPaths),
    emailClaimPaths: listPayload(emailClaimPaths, stored?.emailClaimPaths),
    roleClaimPaths: listPayload(roleClaimPaths, stored?.roleClaimPaths),
  };
  for (const [field, value] of Object.entries(lists)) {
    if (value !== undefined) Object.assign(payload, { [field]: value });
  }
  const roleMappings = buildRoleMappingsPayload(oidcRoleMappingEntries);
  if (roleMappings) {
    payload.roleMappings = roleMappings;
  } else if (isEditing && hasStoredMappings(providerDetails?.oidcConfiguration)) {
    // emptied table must clear stored mappings; only sent when the provider had
    // some, so plain edits by users without users.roles.manage keep working
    payload.roleMappings = {};
  }

  return payload;
}

export function buildSamlPayload({
  formValues,
  emailAttributeKeys,
  roleAttributeKeys,
  samlRoleMappingEntries,
  isEditing,
  providerDetails,
}: {
  formValues: CreateSSOProviderDto;
  emailAttributeKeys: string[];
  roleAttributeKeys: string[];
  samlRoleMappingEntries: RoleMappingEntry[];
  isEditing: boolean;
  providerDetails: SSOProvider | undefined;
}) {
  const base = ensureSamlConfiguration(formValues.samlConfiguration);
  const payload: NonNullable<CreateSSOProviderDto['samlConfiguration']> = {
    ...base,
    idpIssuer: base.idpIssuer?.trim() || null,
    logoutURL: base.logoutURL?.trim() || null,
    audience: sanitizeOptional(base.audience),
  };
  const stored = providerDetails?.samlConfiguration;
  for (const [field, value] of [
    ['emailAttributeKeys', listPayload(emailAttributeKeys, stored?.emailAttributeKeys)],
    ['roleAttributeKeys', listPayload(roleAttributeKeys, stored?.roleAttributeKeys)],
  ] as const) {
    if (value !== undefined) Object.assign(payload, { [field]: value });
    else delete payload[field];
  }

  const sanitizedSigningCertificate = sanitizeOptional(base.spSigningCertificate);
  if (sanitizedSigningCertificate) {
    payload.spSigningCertificate = sanitizedSigningCertificate;
  } else {
    delete payload.spSigningCertificate;
  }

  if (base.spSigningPrivateKey && base.spSigningPrivateKey.trim().length > 0) {
    payload.spSigningPrivateKey = base.spSigningPrivateKey.trim();
  } else {
    delete payload.spSigningPrivateKey;
  }

  if (base.provisioningSecret && base.provisioningSecret.trim().length > 0) {
    payload.provisioningSecret = base.provisioningSecret.trim();
  } else {
    delete payload.provisioningSecret;
  }

  const roleMappings = buildRoleMappingsPayload(samlRoleMappingEntries);
  if (roleMappings) {
    payload.roleMappings = roleMappings;
  } else if (isEditing && hasStoredMappings(providerDetails?.samlConfiguration)) {
    // emptied table must clear stored mappings; only sent when the provider had
    // some, so plain edits by users without users.roles.manage keep working
    payload.roleMappings = {};
  } else {
    delete payload.roleMappings;
  }
  return payload;
}
