import { ApiProperty } from '@nestjs/swagger';
import { Exclude } from 'class-transformer';
import { SSOProvider } from './ssoProvider.dto';
import type { ResponseFields } from '../response-mapper';

export class SSOProviderOIDCConfiguration {
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
  @Exclude()
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

  // ponytail: keeps the legacy 'permissionMappings' DB column — renaming it would need a migration for zero gain

  @ApiProperty({
    description: 'Mapping between Attraccess role keys and IdP role/group claim values',
    required: false,
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
    description: 'When the user was created',
  })
  createdAt!: Date;

  @ApiProperty({
    description: 'When the user was last updated',
  })
  updatedAt!: Date;

  ssoProvider!: SSOProvider;
  static readonly responseFields: ResponseFields = {
    id: null,
    ssoProviderId: null,
    issuer: null,
    authorizationURL: null,
    tokenURL: null,
    userInfoURL: null,
    clientId: null,
    scopes: null,
    usernameClaimPaths: null,
    emailClaimPaths: null,
    roleMappings: null,
    endSessionURL: null,
    jwksURL: null,
    signingAlgorithms: null,
    createdAt: null,
    updatedAt: null,
    ssoProvider: () => SSOProvider,
  };
}
