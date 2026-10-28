import type { CreateSSOProviderDto, SSOProvider } from '@attraccess/react-query-client';

type StoredOidcConfiguration = NonNullable<SSOProvider['oidcConfiguration']>;
type StoredSamlConfiguration = NonNullable<SSOProvider['samlConfiguration']>;

/** Text-input representation of a stored list; anything other than an array becomes empty. */
export const listInputValue = (value: unknown) => (Array.isArray(value) ? value.join(', ') : '');

/** Editable OIDC form values for a stored provider configuration. */
export function oidcFormValues(
  config: StoredOidcConfiguration,
): NonNullable<CreateSSOProviderDto['oidcConfiguration']> {
  return {
    issuer: config.issuer ?? '',
    endSessionURL: config.endSessionURL ?? '',
    jwksURL: config.jwksURL ?? '',
    signingAlgorithms: config.signingAlgorithms?.length ? config.signingAlgorithms : ['RS256'],
    authorizationURL: config.authorizationURL ?? '',
    tokenURL: config.tokenURL ?? '',
    userInfoURL: config.userInfoURL ?? '',
    clientId: config.clientId ?? '',
    clientSecret: config.clientSecret ?? '',
  };
}

/**
 * Editable SAML form values for a stored provider configuration. Write-only secrets
 * (provisioning secret, signing private key) always start empty.
 */
export function samlFormValues(
  config: StoredSamlConfiguration,
): NonNullable<CreateSSOProviderDto['samlConfiguration']> {
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
