import { ApiProperty } from '@nestjs/swagger';
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

  @ApiProperty({ description: 'Whether required before starting a usage session' })
  isRequiredOnResourceUsageStart!: boolean;

  @ApiProperty({ description: 'Whether required before taking over a usage session' })
  isRequiredOnResourceUsageTakeOver!: boolean;

  @ApiProperty({ description: 'Whether required when ending a usage session' })
  isRequiredOnResourceUsageEnd!: boolean;

  @ApiProperty({ description: 'Owning resource identifier', example: 5 })
  resourceId!: number;

  @ApiProperty({ type: () => FormFieldResponseDto, isArray: true })
  fields!: FormFieldResponseDto[];
}
