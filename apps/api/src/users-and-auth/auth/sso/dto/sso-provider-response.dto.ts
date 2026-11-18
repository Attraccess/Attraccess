import { ApiProperty, ApiSchema } from '@nestjs/swagger';
import { SSOProviderType } from '@attraccess/application-models';
import type {
  SsoOidcConfigurationRecord,
  SsoProviderRecord,
  SsoSamlConfigurationRecord,
} from '@attraccess/application-models';

/** The OIDC configuration of a provider. `clientSecret` is declared for the schema and never sent. */
@ApiSchema({ name: 'SSOProviderOIDCConfiguration' })
export class SsoOidcConfigurationResponseDto {
  @ApiProperty({
    description: 'The unique identifier of the provider',
    example: 1,
  })
  id!: number;

  @ApiProperty({
    description: 'The ID of the SSO provider',
    example: 1,
  })
  ssoProviderId!: number;

  @ApiProperty({
    description: 'The issuer of the provider',
    example: 'https://sso.csh.rit.edu/auth/realms/csh',
  })
  issuer!: string;

  @ApiProperty({
    description: 'The authorization URL of the provider',
    example: 'https://sso.csh.rit.edu/auth/realms/csh/protocol/openid-connect/auth',
  })
  authorizationURL!: string;

  @ApiProperty({
    description: 'The token URL of the provider',
    example: 'https://sso.csh.rit.edu/auth/realms/csh/protocol/openid-connect/token',
  })
  tokenURL!: string;

  @ApiProperty({
    description: 'The user info URL of the provider',
    example: 'https://sso.csh.rit.edu/auth/realms/csh/protocol/openid-connect/userinfo',
  })
  userInfoURL!: string;

  @ApiProperty({
    description: 'The client ID of the provider',
    example: '1234567890',
  })
  clientId!: string;

  @ApiProperty({
    description: 'The client secret of the provider',
    example: '1234567890',
    writeOnly: true,
  })
  clientSecret!: string;

  @ApiProperty({
    description:
      'Optional list of OIDC scopes to request. The `openid` scope is added automatically and does not need to be listed here.',
    example: ['email', 'profile'],
    required: false,
  })
  scopes!: string[] | null;

  @ApiProperty({
    description: 'Ordered list of claim paths to resolve the username',
    example: ['preferred_username', 'email', 'sub'],
    required: false,
  })
  usernameClaimPaths!: string[] | null;

  @ApiProperty({
    description: 'Ordered list of claim paths to resolve the email',
    example: ['email', 'emails[0].value', 'upn'],
    required: false,
  })
  emailClaimPaths!: string[] | null;

  @ApiProperty({
    description:
      'Ordered list of claim paths to read roles/groups/permissions from. When unset, the built-in defaults are read. When set, only these paths are read.',
    example: ['realm_access.roles', 'groups'],
    required: false,
    nullable: true,
  })
  roleClaimPaths?: string[] | null;

  // ponytail: keeps the legacy 'permissionMappings' DB column — renaming it would need a migration for zero gain
  @ApiProperty({
    description: 'Mapping between Attraccess role keys and IdP role/group claim values',
    required: false,
    nullable: true,
    type: Object,
    additionalProperties: { type: 'array', items: { type: 'string' } },
    example: {
      'resource-manager': ['attraccess_resources'],
      'user-manager': ['attraccess_admin'],
    },
  })
  roleMappings?: Record<string, string[]> | null;

  @ApiProperty({ description: 'Provider end-session endpoint', required: false, nullable: true })
  endSessionURL?: string | null;

  @ApiProperty({ description: 'Trusted provider JWKS endpoint', required: false, nullable: true })
  jwksURL?: string | null;

  @ApiProperty({
    description: 'Allowed asymmetric ID/logout token signing algorithms; defaults to RS256',
    required: false,
    type: [String],
  })
  signingAlgorithms?: string[] | null;

  @ApiProperty({
    description:
      'Minutes between session-time permission re-syncs using the IdP refresh token; null or 0 disables re-sync',
    required: false,
    nullable: true,
    type: Number,
    example: 60,
  })
  permissionSyncTtlMinutes?: number | null;

  @ApiProperty({
    description: 'When the user was created',
  })
  createdAt!: Date;

  @ApiProperty({
    description: 'When the user was last updated',
  })
  updatedAt!: Date;
}

/** The SAML configuration of a provider. Secrets are declared for the schema and never sent. */
@ApiSchema({ name: 'SSOProviderSAMLConfiguration' })
export class SsoSamlConfigurationResponseDto {
  @ApiProperty({
    description: 'The unique identifier of the SAML configuration',
    example: 1,
  })
  id!: number;

  @ApiProperty({
    description: 'The ID of the parent SSO provider',
    example: 3,
  })
  ssoProviderId!: number;

  @ApiProperty({
    description: 'The Identity Provider entry point (SSO URL)',
    example: 'https://login.example.com/realms/master/protocol/saml',
  })
  entryPoint!: string;

  @ApiProperty({
    description: 'The Service Provider issuer URL presented to the IdP',
    example: 'https://app.attraccess.org',
  })
  issuer!: string;

  @ApiProperty({
    description: 'PEM encoded IdP signing certificate (without BEGIN/END markers)',
  })
  certificate!: string;

  @ApiProperty({
    description: 'Optional audience restriction to validate within assertions',
    required: false,
    nullable: true,
  })
  audience?: string | null;

  @ApiProperty({
    description: 'Whether AuthnRequests should be signed by Attraccess',
    default: false,
  })
  signRequest!: boolean;

  @ApiProperty({
    description: 'Whether SAML Assertions must include their own signature',
    default: false,
  })
  wantAssertionsSigned!: boolean;

  @ApiProperty({
    description: 'Whether the SAML Response must be signed',
    default: true,
  })
  wantAuthnResponseSigned!: boolean;

  @ApiProperty({
    description: 'Force the IdP to re-authenticate the user',
    default: false,
  })
  forceAuthn!: boolean;

  @ApiProperty({
    description: 'Optional list of attribute keys (ordered) to resolve user emails from SAML assertions',
    required: false,
    isArray: true,
    type: String,
    example: ['email', 'urn:oid:1.2.840.113549.1.9.1'],
  })
  emailAttributeKeys?: string[] | null;

  @ApiProperty({
    description:
      'Attribute keys to read roles/groups from. When unset, the built-in defaults are read. When set, only these keys are read (matched case-insensitively).',
    required: false,
    nullable: true,
    isArray: true,
    type: String,
    example: ['roles', 'http://schemas.microsoft.com/ws/2008/06/identity/claims/role'],
  })
  roleAttributeKeys?: string[] | null;

  @ApiProperty({
    description: 'Shared secret used to authorize SAML provisioning requests',
    required: false,
    nullable: true,
    writeOnly: true,
  })
  provisioningSecret?: string | null;

  // ponytail: keeps the legacy 'permissionMappings' DB column — renaming it would need a migration for zero gain
  @ApiProperty({
    description: 'Mapping between Attraccess role keys and SAML role/group attribute values',
    required: false,
    nullable: true,
    type: Object,
    additionalProperties: { type: 'array', items: { type: 'string' } },
    example: {
      'system-admin': ['attraccess_config_admin'],
      'billing-manager': ['attraccess_billing'],
    },
  })
  roleMappings?: Record<string, string[]> | null;

  @ApiProperty({
    description: 'PEM encoded Service Provider certificate used when signing AuthnRequests',
    required: false,
    nullable: true,
  })
  spSigningCertificate?: string | null;

  @ApiProperty({
    description: 'Encrypted Service Provider private key used for signing AuthnRequests',
    required: false,
    nullable: true,
    writeOnly: true,
  })
  spSigningKeyEncrypted?: string | null;

  @ApiProperty({
    description: 'Identifier for the encryption key used to protect the signing private key',
    required: false,
    nullable: true,
  })
  spSigningKeyEncryptionKeyId?: string | null;

  @ApiProperty({
    description: 'Identity Provider entity ID (distinct from the Service Provider issuer)',
    required: false,
    nullable: true,
  })
  idpIssuer?: string | null;

  @ApiProperty({ description: 'Identity Provider Single Logout endpoint', required: false, nullable: true })
  logoutURL?: string | null;

  @ApiProperty({
    description: 'When the configuration was created',
  })
  createdAt!: Date;

  @ApiProperty({
    description: 'When the configuration was last updated',
  })
  updatedAt!: Date;
}

/** An SSO provider as clients see it. */
@ApiSchema({ name: 'SSOProvider' })
export class SsoProviderResponseDto {
  @ApiProperty({
    description: 'The unique identifier of the provider',
    example: 1,
  })
  id!: number;

  @ApiProperty({
    description: 'The internal name of the provider',
    example: 'Keycloak',
  })
  name!: string;

  @ApiProperty({
    description: 'The type of the provider',
    example: 'OIDC',
    enum: SSOProviderType,
    enumName: 'SSOProviderType',
  })
  type!: SSOProviderType;

  @ApiProperty({
    description: 'When the user was created',
  })
  createdAt!: Date;

  @ApiProperty({
    description: 'When the user was last updated',
  })
  updatedAt!: Date;

  @ApiProperty({
    description: 'The OIDC configuration of the provider',
    type: SsoOidcConfigurationResponseDto,
    required: false,
  })
  oidcConfiguration?: SsoOidcConfigurationResponseDto;

  @ApiProperty({
    description: 'The SAML configuration of the provider',
    type: SsoSamlConfigurationResponseDto,
    required: false,
  })
  samlConfiguration?: SsoSamlConfigurationResponseDto;
}

function toOidcResponse(config: SsoOidcConfigurationRecord): SsoOidcConfigurationResponseDto {
  // clientSecret is deliberately not copied: the secret never leaves the server.
  return {
    id: config.id,
    ssoProviderId: config.ssoProviderId,
    issuer: config.issuer,
    authorizationURL: config.authorizationURL,
    tokenURL: config.tokenURL,
    userInfoURL: config.userInfoURL,
    clientId: config.clientId,
    scopes: config.scopes,
    usernameClaimPaths: config.usernameClaimPaths,
    emailClaimPaths: config.emailClaimPaths,
    roleClaimPaths: config.roleClaimPaths,
    roleMappings: config.roleMappings,
    endSessionURL: config.endSessionURL,
    jwksURL: config.jwksURL,
    signingAlgorithms: config.signingAlgorithms,
    permissionSyncTtlMinutes: config.permissionSyncTtlMinutes,
    createdAt: config.createdAt,
    updatedAt: config.updatedAt,
  } as SsoOidcConfigurationResponseDto;
}

function toSamlResponse(config: SsoSamlConfigurationRecord): SsoSamlConfigurationResponseDto {
  // provisioningSecret and the encrypted signing key are deliberately not copied.
  return {
    id: config.id,
    ssoProviderId: config.ssoProviderId,
    entryPoint: config.entryPoint,
    issuer: config.issuer,
    certificate: config.certificate,
    audience: config.audience,
    signRequest: config.signRequest,
    wantAssertionsSigned: config.wantAssertionsSigned,
    wantAuthnResponseSigned: config.wantAuthnResponseSigned,
    forceAuthn: config.forceAuthn,
    emailAttributeKeys: config.emailAttributeKeys,
    roleAttributeKeys: config.roleAttributeKeys,
    roleMappings: config.roleMappings,
    spSigningCertificate: config.spSigningCertificate,
    spSigningKeyEncryptionKeyId: config.spSigningKeyEncryptionKeyId,
    idpIssuer: config.idpIssuer,
    logoutURL: config.logoutURL,
    createdAt: config.createdAt,
    updatedAt: config.updatedAt,
  } as SsoSamlConfigurationResponseDto;
}

export function toSsoProviderResponse(provider: SsoProviderRecord): SsoProviderResponseDto {
  const response = {
    id: provider.id,
    name: provider.name,
    type: provider.type,
    createdAt: provider.createdAt,
    updatedAt: provider.updatedAt,
  } as SsoProviderResponseDto;
  if (provider.oidcConfiguration) response.oidcConfiguration = toOidcResponse(provider.oidcConfiguration);
  if (provider.samlConfiguration) response.samlConfiguration = toSamlResponse(provider.samlConfiguration);
  return response;
}
