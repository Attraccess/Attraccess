import { ApiProperty } from '@nestjs/swagger';
import { SSOProviderOIDCConfiguration } from './ssoProvider.oidc.dto';
import { SSOProviderSAMLConfiguration } from './ssoProvider.saml.dto';
import { IsEnum } from 'class-validator';
import { SSOProviderType } from '@attraccess/application-models';
import type { ResponseFields } from '../response-mapper';

export class SSOProvider {
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
  @IsEnum(SSOProviderType)
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
    type: SSOProviderOIDCConfiguration,
    required: false,
  })
  oidcConfiguration?: SSOProviderOIDCConfiguration;

  @ApiProperty({
    description: 'The SAML configuration of the provider',
    type: SSOProviderSAMLConfiguration,
    required: false,
  })
  samlConfiguration?: SSOProviderSAMLConfiguration;
  static readonly responseFields: ResponseFields = {
    id: null,
    name: null,
    type: null,
    createdAt: null,
    updatedAt: null,
    oidcConfiguration: () => SSOProviderOIDCConfiguration,
    samlConfiguration: () => SSOProviderSAMLConfiguration,
  };
}

export { SSOProviderType } from '@attraccess/application-models';
