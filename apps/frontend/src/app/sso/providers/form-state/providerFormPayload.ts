import type { CreateOIDCConfigurationDto, CreateSSOProviderDto, SSOProvider } from '@attraccess/react-query-client';
import {
  ensureOidcConfiguration,
  ensureSamlConfiguration,
  buildRoleMappingsPayload,
  RoleMappingEntry,
} from '../formDefaults';

const parseList = (value: string) =>
  value
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

const sanitizeOptional = (value?: string) => (value && value.trim().length > 0 ? value.trim() : undefined);

const hasStoredMappings = (config?: { roleMappings?: Record<string, unknown> | null }) =>
  Object.keys(config?.roleMappings ?? {}).length > 0;

export function buildOidcPayload({
  formValues,
  scopesInput,
  signingAlgorithmsInput,
  usernameClaimPathsInput,
  emailClaimPathsInput,
  oidcRoleMappingEntries,
  isEditing,
  providerDetails,
}: {
  formValues: CreateSSOProviderDto;
  scopesInput: string;
  signingAlgorithmsInput: string;
  usernameClaimPathsInput: string;
  emailClaimPathsInput: string;
  oidcRoleMappingEntries: RoleMappingEntry[];
  isEditing: boolean;
  providerDetails: SSOProvider | undefined;
}) {
  const base = ensureOidcConfiguration(formValues.oidcConfiguration);
  const signingAlgorithms = parseList(signingAlgorithmsInput);
  const payload: CreateOIDCConfigurationDto = {
    issuer: base.issuer,
    endSessionURL: base.endSessionURL?.trim() || null,
    jwksURL: base.jwksURL?.trim() || null,
    signingAlgorithms: signingAlgorithms.length ? signingAlgorithms : ['RS256'],
    authorizationURL: base.authorizationURL,
    tokenURL: base.tokenURL,
    userInfoURL: base.userInfoURL,
    clientId: base.clientId,
    clientSecret: base.clientSecret,
  };

  if (scopesInput.trim().length > 0) payload.scopes = parseList(scopesInput);
  if (usernameClaimPathsInput.trim().length > 0) payload.usernameClaimPaths = parseList(usernameClaimPathsInput);
  if (emailClaimPathsInput.trim().length > 0) payload.emailClaimPaths = parseList(emailClaimPathsInput);
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
  emailAttributeKeysInput,
  samlRoleMappingEntries,
  isEditing,
  providerDetails,
}: {
  formValues: CreateSSOProviderDto;
  emailAttributeKeysInput: string;
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
  const parsedEmailKeys = parseList(emailAttributeKeysInput);
  if (parsedEmailKeys.length > 0) {
    payload.emailAttributeKeys = parsedEmailKeys;
  } else {
    delete payload.emailAttributeKeys;
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
