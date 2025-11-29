import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsDate, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { FormSubmissionRequestDto } from '../../forms/dto';

export class EndUsageSessionDto {
  @ApiProperty({
    description: 'Additional notes about the completed session',
    required: false,
    example: 'Print completed successfully',
  })
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiProperty({
    description:
      'The end time of the session. If not provided, current time will be used.',
    required: false,
    type: Date,
  })
  @IsDate()
  @IsOptional()
  @Type(() => Date)
  endTime?: Date;

  @ApiProperty({
    description: 'Form submissions associated with ending the usage session',
    required: false,
    type: () => FormSubmissionRequestDto,
    isArray: true,
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FormSubmissionRequestDto)
  formSubmissions?: FormSubmissionRequestDto[];
}
