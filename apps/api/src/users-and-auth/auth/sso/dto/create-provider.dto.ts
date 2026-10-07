import { SSOProviderType } from '@attraccess/database-entities';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNotEmpty, IsObject, IsOptional, IsString, ValidateNested } from 'class-validator';
import { CreateOIDCConfigurationDto } from './create-oidc-configuration.dto';
import { CreateSAMLConfigurationDto } from './create-saml-configuration.dto';

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
