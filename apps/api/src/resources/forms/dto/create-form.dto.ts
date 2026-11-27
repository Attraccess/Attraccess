import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { FORM_SCOPES, type FormScope } from '@attraccess/application-models';
import { Type } from 'class-transformer';
import { CreateFormFieldDto } from './form-field.dto';
import { rawValue } from './raw-value.transform';

export class BaseFormDto {
  @ApiProperty({ description: 'Form name', example: 'Machine start checklist' })
  @IsString()
  name!: string;

  @ApiProperty({
    description: 'Where the form applies: one resource, every resource of a resource group, or every resource',
    enum: FORM_SCOPES,
    enumName: 'FormScope',
    example: 'resource',
  })
  @IsIn(FORM_SCOPES)
  scope!: FormScope;

  @ApiProperty({
    description: 'The resource of a resource form; must be empty for other scopes',
    required: false,
    nullable: true,
    type: Number,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @Min(1)
  resourceId?: number | null;

  @ApiProperty({
    description: 'The resource group of a group form; must be empty for other scopes',
    required: false,
    nullable: true,
    type: Number,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @Min(1)
  groupId?: number | null;

  @ApiProperty({
    description: 'Default: require before resource usage start (a resource can override it)',
    default: false,
  })
  @rawValue()
  @IsBoolean()
  isRequiredOnResourceUsageStart!: boolean;

  @ApiProperty({
    description: 'Default: require before taking over an active usage (a resource can override it)',
    default: false,
  })
  @rawValue()
  @IsBoolean()
  isRequiredOnResourceUsageTakeOver!: boolean;

  @ApiProperty({
    description: 'Default: require when ending a usage session (a resource can override it)',
    default: false,
  })
  @rawValue()
  @IsBoolean()
  isRequiredOnResourceUsageEnd!: boolean;

  @ApiProperty({
    description: 'Default: require when a running session switches its project (a resource can override it)',
    default: false,
    required: false,
  })
  @rawValue()
  @IsOptional()
  @IsBoolean()
  isRequiredOnResourceUsageProjectSwitch?: boolean;
}

export class CreateFormDto extends BaseFormDto {
  @ApiProperty({ type: () => CreateFormFieldDto, isArray: true })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateFormFieldDto)
  fields!: CreateFormFieldDto[];
}
