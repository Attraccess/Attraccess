import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsObject, IsOptional, IsString, ValidateNested, IsArray, IsBoolean } from 'class-validator';
import { SSOProviderType } from '@attraccess/database-entities';
import { Type } from 'class-transformer';
import { SSOPermissionMappingsDto } from './permission-mapping.dto';

export class CreateOIDCConfigurationDto {
  @ApiProperty({
    description: 'The issuer of the provider',
    example: 'https://sso.example.com/auth/realms/example',
  })
  @IsString()
  @IsNotEmpty()
  issuer: string;

  @ApiProperty({
    description: 'The authorization URL of the provider',
    example: 'https://sso.example.com/auth/realms/example/protocol/openid-connect/auth',
  })
  @IsString()
  @IsNotEmpty()
  authorizationURL: string;

  @ApiProperty({
    description: 'The token URL of the provider',
    example: 'https://sso.example.com/auth/realms/example/protocol/openid-connect/token',
  })
  @IsString()
  @IsNotEmpty()
  tokenURL: string;

  @ApiProperty({
    description: 'The user info URL of the provider',
    example: 'https://sso.example.com/auth/realms/example/protocol/openid-connect/userinfo',
  })
  @IsString()
  @IsNotEmpty()
  userInfoURL: string;

  @ApiProperty({
    description: 'The client ID of the provider',
    example: 'attraccess-client',
  })
  @IsString()
  @IsNotEmpty()
  clientId: string;

  @ApiProperty({
    description: 'The client secret of the provider',
    example: 'client-secret',
  })
  @IsString()
  @IsNotEmpty()
  clientSecret: string;

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
    description: 'Optional mapping between Attraccess permissions and role names',
    required: false,
    type: SSOPermissionMappingsDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => SSOPermissionMappingsDto)
  permissionMappings?: SSOPermissionMappingsDto;
}

export class CreateSAMLConfigurationDto {
  @ApiProperty({
    description: 'Identity Provider SSO entry point URL',
    example: 'https://idp.example.com/realms/master/protocol/saml',
  })
  @IsString()
  @IsNotEmpty()
  entryPoint!: string;

  @ApiProperty({
    description: 'Service Provider issuer that IdP expects',
    example: 'https://api.attraccess.org',
  })
  @IsString()
  @IsNotEmpty()
  issuer!: string;

  @ApiProperty({
    description: 'Base64 encoded IdP certificate without PEM boundaries',
  })
  @IsString()
  @IsNotEmpty()
  certificate!: string;

  @ApiProperty({
    description: 'Audience restriction to validate against, defaults to issuer when omitted',
    required: false,
  })
  @IsOptional()
  @IsString()
  audience?: string;

  @ApiProperty({
    description: 'Whether AuthnRequests should be signed by Attraccess',
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  signRequest?: boolean;

  @ApiProperty({
    description: 'Require signed assertions inside the response',
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  wantAssertionsSigned?: boolean;

  @ApiProperty({
    description: 'Require the overall response to be signed',
    default: true,
  })
  @IsBoolean()
  @IsOptional()
  wantAuthnResponseSigned?: boolean;

  @ApiProperty({
    description: 'Force IdP to re-authenticate the subject',
    default: false,
  })
  @IsBoolean()
  @IsOptional()
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
    description: 'Optional mapping between Attraccess permissions and SAML role values',
    required: false,
    type: SSOPermissionMappingsDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => SSOPermissionMappingsDto)
  permissionMappings?: SSOPermissionMappingsDto;

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

export class CreateSSOProviderDto {
  @ApiProperty({
    description: 'The name of the SSO provider',
    example: 'Company Keycloak',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    description: 'The type of SSO provider',
    enum: SSOProviderType,
    example: SSOProviderType.OIDC,
    enumName: 'SSOProviderType',
  })
  @IsString()
  @IsNotEmpty()
  type: SSOProviderType;

  @ApiProperty({
    description: 'The OIDC configuration for the provider',
    type: CreateOIDCConfigurationDto,
    required: false,
  })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => CreateOIDCConfigurationDto)
  oidcConfiguration?: CreateOIDCConfigurationDto;

  @ApiProperty({
    description: 'The SAML configuration for the provider',
    required: false,
  })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => CreateSAMLConfigurationDto)
  samlConfiguration?: CreateSAMLConfigurationDto;
}
