import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsObject, IsOptional, IsString, ValidateNested, IsArray } from 'class-validator';
import { SSOProviderType } from '@attraccess/database-entities';
import { Type } from 'class-transformer';

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
}
