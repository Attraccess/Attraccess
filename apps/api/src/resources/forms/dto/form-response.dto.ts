import { ApiProperty, ApiSchema } from '@nestjs/swagger';
import { FORM_SCOPES, type FormScope } from '@attraccess/application-models';
import { FormFieldResponseDto } from './form-field.dto';

export class FormResponseDto {
  @ApiProperty({ description: 'Form identifier', example: 12 })
  id!: number;

  @ApiProperty({ description: 'Creation timestamp' })
  createdAt!: Date;

  @ApiProperty({ description: 'Last update timestamp' })
  updatedAt!: Date;

  @ApiProperty({ description: 'Form name', example: 'Machine safety checklist' })
  name!: string;

  @ApiProperty({ description: 'Where the form applies', enum: FORM_SCOPES, enumName: 'FormScope' })
  scope!: FormScope;

  @ApiProperty({ description: 'Default: whether required before starting a usage session' })
  isRequiredOnResourceUsageStart!: boolean;

  @ApiProperty({ description: 'Default: whether required before taking over a usage session' })
  isRequiredOnResourceUsageTakeOver!: boolean;

  @ApiProperty({ description: 'Default: whether required when ending a usage session' })
  isRequiredOnResourceUsageEnd!: boolean;

  @ApiProperty({ description: 'Whether the form is required when a running session switches its project' })
  isRequiredOnResourceUsageProjectSwitch!: boolean;

  @ApiProperty({ description: 'The resource of a resource form', example: 5, nullable: true, type: Number })
  resourceId!: number | null;

  @ApiProperty({ description: 'The resource group of a group form', nullable: true, type: Number })
  groupId!: number | null;

  @ApiProperty({ type: () => FormFieldResponseDto, isArray: true })
  fields!: FormFieldResponseDto[];
}

/** The form as the resource embeds it. Schema name stays `Form` so the published API description does not change. */
@ApiSchema({ name: 'Form' })
export class ResourceFormDto extends FormResponseDto {}
