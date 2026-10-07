import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsObject, IsOptional, IsString, ValidateNested } from 'class-validator';
import { UpdateOIDCConfigurationDto } from './update-oidc-configuration.dto';
import { UpdateSAMLConfigurationDto } from './update-saml-configuration.dto';

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
