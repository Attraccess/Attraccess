import type { CreateSsoProviderDtoWritable, SsoProvider } from '@attraccess/react-query-client';

type StoredOidcConfiguration = NonNullable<SsoProvider['oidcConfiguration']>;
type StoredSamlConfiguration = NonNullable<SsoProvider['samlConfiguration']>;

/** Editable entries of a stored list, in stored order; anything other than an array becomes empty. */
export const listValue = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];

/** Editable OIDC form values for a stored provider configuration. */
export function oidcFormValues(
  config: StoredOidcConfiguration,
): NonNullable<CreateSsoProviderDtoWritable['oidcConfiguration']> {
  return {
    issuer: config.issuer ?? '',
    endSessionURL: config.endSessionURL ?? '',
    jwksURL: config.jwksURL ?? '',
    signingAlgorithms: config.signingAlgorithms?.length ? config.signingAlgorithms : ['RS256'],
    authorizationURL: config.authorizationURL ?? '',
    tokenURL: config.tokenURL ?? '',
    userInfoURL: config.userInfoURL ?? '',
    clientId: config.clientId ?? '',
    // The API never returns the client secret; it is only sent when changed.
    clientSecret: '',
    permissionSyncTtlMinutes: config.permissionSyncTtlMinutes ?? null,
  };
}

/**
 * Editable SAML form values for a stored provider configuration. Write-only secrets
 * (provisioning secret, signing private key) always start empty.
 */
export function samlFormValues(
  config: StoredSamlConfiguration,
): NonNullable<CreateSsoProviderDtoWritable['samlConfiguration']> {
  return {
    entryPoint: config.entryPoint ?? '',
    idpIssuer: config.idpIssuer ?? '',
    logoutURL: config.logoutURL ?? '',
    issuer: config.issuer ?? '',
    certificate: config.certificate ?? '',
    audience: config.audience ?? '',
    signRequest: config.signRequest ?? false,
    wantAssertionsSigned: config.wantAssertionsSigned ?? false,
    wantAuthnResponseSigned: config.wantAuthnResponseSigned ?? true,
    forceAuthn: config.forceAuthn ?? false,
    provisioningSecret: '',
    spSigningCertificate: config.spSigningCertificate ?? '',
    spSigningPrivateKey: '',
  };
}
