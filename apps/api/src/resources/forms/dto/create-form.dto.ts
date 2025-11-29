import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { CreateFormFieldDto } from './form-field.dto';

export class BaseFormDto {
  @ApiProperty({ description: 'Form name', example: 'Machine start checklist' })
  @IsString()
  name!: string;

  @ApiProperty({
    description: 'Require before resource usage start',
    default: false,
  })
  @IsBoolean()
  isRequiredOnResourceUsageStart!: boolean;

  @ApiProperty({
    description: 'Require before taking over an active usage',
    default: false,
  })
  @IsBoolean()
  isRequiredOnResourceUsageTakeOver!: boolean;

  @ApiProperty({
    description: 'Require when ending a usage session',
    default: false,
  })
  @IsBoolean()
  isRequiredOnResourceUsageEnd!: boolean;
}

export class CreateFormDto extends BaseFormDto {
  @ApiProperty({ type: () => CreateFormFieldDto, isArray: true })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateFormFieldDto)
  fields!: CreateFormFieldDto[];
}
