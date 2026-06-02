import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { ResourceIntroducerType } from '@attraccess/database-entities';

export class GrantIntroducerDto {
  @ApiPropertyOptional({
    description:
      "The kind of access to grant. 'introducer' (default) can give introductions and do maintenance; 'maintainer' can only do maintenance and control the machine",
    enum: ResourceIntroducerType,
    enumName: 'ResourceIntroducerType',
    default: ResourceIntroducerType.INTRODUCER,
  })
  @IsOptional()
  @IsEnum(ResourceIntroducerType)
  type?: ResourceIntroducerType;
}
