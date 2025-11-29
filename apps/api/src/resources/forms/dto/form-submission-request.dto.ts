import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsDefined, IsInt, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class FormSubmissionFieldAnswerDto {
  @ApiProperty({ description: 'Field identifier', example: 101 })
  @IsInt()
  @Type(() => Number)
  fieldId!: number;

  @ApiProperty({
    description: 'Submitted value',
    oneOf: [{ type: 'string' }, { type: 'number' }, { type: 'boolean' }],
  })
  @IsDefined()
  value!: string | number | boolean;
}

export class FormSubmissionRequestDto {
  @ApiProperty({ description: 'Form identifier', example: 12 })
  @IsInt()
  @Type(() => Number)
  formId!: number;

  @ApiProperty({ type: () => FormSubmissionFieldAnswerDto, isArray: true })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FormSubmissionFieldAnswerDto)
  answers!: FormSubmissionFieldAnswerDto[];
}

