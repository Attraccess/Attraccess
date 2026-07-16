import { ApiProperty } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString, ValidateNested, IsArray, IsBoolean, IsNotEmpty } from 'class-validator';
import { Type } from 'class-transformer';
import { IsStringArrayRecord } from './validators';

export class UpdateOIDCConfigurationDto {
  @ApiProperty({
    description: 'The issuer of the provider',
    example: 'https://sso.example.com/auth/realms/example',
    required: false,
  })
  @IsString()
  @IsOptional()
  issuer?: string;

  @ApiProperty({
    description: 'The authorization URL of the provider',
    example: 'https://sso.example.com/auth/realms/example/protocol/openid-connect/auth',
    required: false,
  })
  @IsString()
  @IsOptional()
  authorizationURL?: string;

  @ApiProperty({
    description: 'The token URL of the provider',
    example: 'https://sso.example.com/auth/realms/example/protocol/openid-connect/token',
    required: false,
  })
  @IsString()
  @IsOptional()
  tokenURL?: string;

  @ApiProperty({
    description: 'The user info URL of the provider',
    example: 'https://sso.example.com/auth/realms/example/protocol/openid-connect/userinfo',
    required: false,
  })
  @IsString()
  @IsOptional()
  userInfoURL?: string;

  @ApiProperty({
    description: 'The client ID of the provider',
    example: 'attraccess-client',
    required: false,
  })
  @IsString()
  @IsOptional()
  clientId?: string;

  @ApiProperty({
    description: 'The client secret of the provider',
    example: 'client-secret',
    required: false,
  })
  @IsString()
  @IsOptional()
  clientSecret?: string;

  @ApiProperty({
    description: 'Optional list of OIDC scopes to request',
    example: ['openid', 'email', 'profile'],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  scopes?: string[];

  @ApiProperty({
    description: 'Ordered list of claim paths to resolve the username',
    example: ['preferred_username', 'email', 'sub'],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  usernameClaimPaths?: string[];

  @ApiProperty({
    description: 'Ordered list of claim paths to resolve the email',
    example: ['email', 'emails[0].value', 'upn'],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  emailClaimPaths?: string[];

  @ApiProperty({
    description:
      'Maps any Attraccess role key (system-provided or user-defined) to the IdP role/group claim values that should grant it.',
    required: false,
    type: Object,
    additionalProperties: { type: 'array', items: { type: 'string' } },
    example: { 'resource-manager': ['attraccess_resources'], 'my-custom-role': ['my_sso_group'] },
  })
  @IsOptional()
  @IsStringArrayRecord()
  roleMappings?: Record<string, string[]>;

  @ApiProperty({
    description: 'Deprecated alias of roleMappings, accepted during the migration window. Ignored when roleMappings is set.',
    required: false,
    deprecated: true,
    type: Object,
    additionalProperties: { type: 'array', items: { type: 'string' } },
  })
  @IsOptional()
  @IsStringArrayRecord()
  permissionMappings?: Record<string, string[]>;
}

export class UpdateSAMLConfigurationDto {
  @ApiProperty({
    description: 'Identity Provider SSO entry point URL',
    required: false,
  })
  @IsOptional()
  @IsString()
  entryPoint?: string;

  @ApiProperty({
    description: 'Service Provider issuer that IdP expects',
    required: false,
  })
  @IsOptional()
  @IsString()
  issuer?: string;

  @ApiProperty({
    description: 'Optional Assertion Consumer Service override',
    required: false,
  })
  @IsOptional()
  @IsString()
  callbackUrl?: string;

  @ApiProperty({
    description: 'Base64 encoded IdP certificate without PEM boundaries',
    required: false,
  })
  @IsOptional()
  @IsString()
  certificate?: string;

  @ApiProperty({
    description: 'Audience restriction to validate against',
    required: false,
  })
  @IsOptional()
  @IsString()
  audience?: string;

  @ApiProperty({
    description: 'Whether AuthnRequests should be signed by Attraccess',
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  signRequest?: boolean;

  @ApiProperty({
    description: 'Require signed assertions inside the response',
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  wantAssertionsSigned?: boolean;

  @ApiProperty({
    description: 'Require the overall response to be signed',
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  wantAuthnResponseSigned?: boolean;

  @ApiProperty({
    description: 'Force IdP to re-authenticate the subject',
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  forceAuthn?: boolean;

  @ApiProperty({
    description: 'Ordered list of attribute keys to resolve email addresses from (first match wins)',
    required: false,
    isArray: true,
    type: String,
    example: ['email', 'urn:oid:1.2.840.113549.1.9.1'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  emailAttributeKeys?: string[];

  @ApiProperty({
    description: 'Shared secret used to authorize SAML provisioning requests',
    required: false,
    writeOnly: true,
  })
  @IsOptional()
  @IsString()
  provisioningSecret?: string;

  @ApiProperty({
    description:
      'Maps any Attraccess role key (system-provided or user-defined) to the SAML role/group attribute values that should grant it.',
    required: false,
    type: Object,
    additionalProperties: { type: 'array', items: { type: 'string' } },
    example: { 'resource-manager': ['attraccess_resources'], 'my-custom-role': ['my_sso_group'] },
  })
  @IsOptional()
  @IsStringArrayRecord()
  roleMappings?: Record<string, string[]>;

  @ApiProperty({
    description: 'Deprecated alias of roleMappings, accepted during the migration window. Ignored when roleMappings is set.',
    required: false,
    deprecated: true,
    type: Object,
    additionalProperties: { type: 'array', items: { type: 'string' } },
  })
  @IsOptional()
  @IsStringArrayRecord()
  permissionMappings?: Record<string, string[]>;

  @ApiProperty({
    description: 'PEM encoded Service Provider certificate used when signing requests',
    required: false,
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  spSigningCertificate?: string;

  @ApiProperty({
    description: 'PEM encoded Service Provider private key used for signing requests (stored encrypted)',
    required: false,
    writeOnly: true,
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  spSigningPrivateKey?: string;
}

export class UpdateSSOProviderDto {
  @ApiProperty({
    description: 'The name of the SSO provider',
    example: 'Company Keycloak',
    required: false,
  })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty({
    description: 'The OIDC configuration for the provider',
    type: UpdateOIDCConfigurationDto,
    required: false,
  })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => UpdateOIDCConfigurationDto)
  oidcConfiguration?: UpdateOIDCConfigurationDto;

  @ApiProperty({
    description: 'The SAML configuration for the provider',
    type: UpdateSAMLConfigurationDto,
    required: false,
  })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => UpdateSAMLConfigurationDto)
  samlConfiguration?: UpdateSAMLConfigurationDto;
}
