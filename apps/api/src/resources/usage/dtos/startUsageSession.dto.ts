import { ApiProperty } from '@nestjs/swagger';
import { ToBoolean } from '../../../common/request-transformers';
import {
  IsString,
  IsOptional,
  IsBoolean,
  IsInt,
  IsPositive,
  IsArray,
  ValidateNested,
  ArrayMaxSize,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { FormSubmissionRequestDto } from '../../forms/dto';

export class StartUsageSessionDto {
  @ApiProperty({
    description: 'Optional notes about the usage session',
    required: false,
    example: 'Printing a prototype case',
  })
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiProperty({
    description: 'Whether to force takeover of an existing session (only works if resource allows takeover)',
    required: false,
    example: false,
    default: false,
  })
  @IsBoolean()
  @ToBoolean()
  @IsOptional()
  forceTakeOver?: boolean;

  @ApiProperty({
    description: 'The project to assign this usage to',
    required: false,
    example: 35,
  })
  @IsInt()
  @IsPositive()
  @IsOptional()
  projectId?: number;

  @ApiProperty({
    description: 'Form submissions required for this action',
    required: false,
    type: () => FormSubmissionRequestDto,
    isArray: true,
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FormSubmissionRequestDto)
  formSubmissions?: FormSubmissionRequestDto[];

  @ApiProperty({
    description:
      'Step ids of plugin confirmations the user accepted for this start attempt. Returned by a 409 CONFIRMATION_REQUIRED response; single-use.',
    required: false,
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  confirmedStepIds?: string[];
}
