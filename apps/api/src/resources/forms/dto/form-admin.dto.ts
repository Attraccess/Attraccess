import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Min, ValidateIf } from 'class-validator';
import { FORM_SCOPES, ResourceFormAction, type FormScope } from '@attraccess/application-models';
import { PaginationOptionsDto } from '../../../types/request';
import { PaginatedResponse } from '../../../types/response';
import { FormResponseDto } from './form-response.dto';
import { rawValue } from './raw-value.transform';

const toNumber = ({ value }: { value: unknown }) =>
  value === undefined || value === '' ? undefined : typeof value === 'string' ? Number(value) : value;

export class FormListQueryDto extends PaginationOptionsDto {
  @ApiPropertyOptional({ description: 'Only forms of this scope', enum: FORM_SCOPES, enumName: 'FormScope' })
  @IsOptional()
  @IsIn(FORM_SCOPES)
  scope?: FormScope;

  @ApiPropertyOptional({ description: 'Only resource forms of this resource', type: Number })
  @IsOptional()
  @Transform(toNumber)
  @IsInt()
  resourceId?: number;

  @ApiPropertyOptional({ description: 'Only group forms of this resource group', type: Number })
  @IsOptional()
  @Transform(toNumber)
  @IsInt()
  groupId?: number;

  @ApiPropertyOptional({ description: 'Only forms whose name contains this text' })
  @IsOptional()
  @IsString()
  search?: string;
}

export class FormListItemDto extends FormResponseDto {
  @ApiProperty({ description: 'The number of resources the form currently applies to' })
  appliesToResourceCount!: number;

  @ApiProperty({ description: 'The name of the resource of a resource form', nullable: true, type: String })
  resourceName!: string | null;

  @ApiProperty({ description: 'The name of the resource group of a group form', nullable: true, type: String })
  groupName!: string | null;
}

export class PaginatedFormsResponseDto extends PaginatedResponse<FormListItemDto> {
  @ApiProperty({ type: () => FormListItemDto, isArray: true })
  data!: FormListItemDto[];
}

export class FormRequiredFlagsDto {
  @ApiProperty({ description: 'Required before starting a usage session' })
  isRequiredOnResourceUsageStart!: boolean;

  @ApiProperty({ description: 'Required before taking over a usage session' })
  isRequiredOnResourceUsageTakeOver!: boolean;

  @ApiProperty({ description: 'Required when ending a usage session' })
  isRequiredOnResourceUsageEnd!: boolean;
}

const flagOverride = (description: string) =>
  ApiProperty({ description: `${description}; null inherits the form's default`, nullable: true, type: Boolean });

/** How one resource deviates from a form: switched off, or other required flags. */
export class FormResourceOverrideDto {
  @ApiProperty({ description: 'The form is switched off for this resource' })
  @rawValue()
  @IsBoolean()
  disabled!: boolean;

  @flagOverride('Required before starting a usage session')
  @rawValue()
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsBoolean()
  isRequiredOnResourceUsageStart!: boolean | null;

  @flagOverride('Required before taking over a usage session')
  @rawValue()
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsBoolean()
  isRequiredOnResourceUsageTakeOver!: boolean | null;

  @flagOverride('Required when ending a usage session')
  @rawValue()
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsBoolean()
  isRequiredOnResourceUsageEnd!: boolean | null;
}

export class FormAppliedResourceDto {
  @ApiProperty({ description: 'Resource identifier' })
  resourceId!: number;

  @ApiProperty({ description: 'Resource name' })
  resourceName!: string;

  @ApiProperty({ type: () => FormResourceOverrideDto, nullable: true })
  override!: FormResourceOverrideDto | null;

  @ApiProperty({ description: 'The form is switched off for this resource' })
  disabled!: boolean;

  @ApiProperty({ type: () => FormRequiredFlagsDto, description: 'The flags in effect for this resource' })
  effective!: FormRequiredFlagsDto;
}

/** A form as it applies to one resource. */
export class ResourceApplicableFormDto {
  @ApiProperty({ type: () => FormResponseDto })
  form!: FormResponseDto;

  @ApiProperty({
    description: 'Where the form comes from: the resource itself, one of its groups, or global',
    enum: FORM_SCOPES,
    enumName: 'FormScope',
  })
  source!: FormScope;

  @ApiProperty({ description: 'The group a group form comes from', nullable: true, type: String })
  groupName!: string | null;

  @ApiProperty({ type: () => FormResourceOverrideDto, nullable: true })
  override!: FormResourceOverrideDto | null;

  @ApiProperty({ description: 'The form is switched off for this resource' })
  disabled!: boolean;

  @ApiProperty({ type: () => FormRequiredFlagsDto, description: 'The flags in effect for this resource' })
  effective!: FormRequiredFlagsDto;
}

export class FormSubmissionsQueryDto extends PaginationOptionsDto {
  @ApiPropertyOptional({ description: 'Only submissions given for this resource', type: Number })
  @IsOptional()
  @Transform(toNumber)
  @IsInt()
  @Min(1)
  resourceId?: number;
}

export class FormSubmissionUserDto {
  @ApiProperty()
  id!: number;

  @ApiProperty({ description: 'The name shown for the user' })
  username!: string;
}

export class FormSubmissionResourceDto {
  @ApiProperty()
  id!: number;

  @ApiProperty()
  name!: string;
}

export class FormSubmissionListItemDto {
  @ApiProperty()
  id!: number;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty({ description: 'The usage action the form was submitted for', enum: ResourceFormAction })
  action!: ResourceFormAction;

  @ApiProperty({ type: () => FormSubmissionUserDto, nullable: true })
  user!: FormSubmissionUserDto | null;

  @ApiProperty({ type: () => FormSubmissionResourceDto, nullable: true })
  resource!: FormSubmissionResourceDto | null;

  @ApiProperty({
    description: 'The answers by field id, each with a snapshot of the field as it was when submitted',
    type: 'object',
    additionalProperties: true,
  })
  data!: Record<string, { value: string; fieldDefinition: Record<string, unknown> }>;
}

export class PaginatedFormSubmissionsResponseDto extends PaginatedResponse<FormSubmissionListItemDto> {
  @ApiProperty({ type: () => FormSubmissionListItemDto, isArray: true })
  data!: FormSubmissionListItemDto[];
}
