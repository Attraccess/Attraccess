import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsDefined, IsInt, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class FormSubmissionFieldAnswerDto {
  @ApiProperty({ description: 'Field identifier', example: 101 })
  @IsInt()
  @Type(() => Number)
  fieldId!: number;

  @ApiProperty({
    description: 'Submitted value. An image field takes the list of the ids of its uploaded images.',
    oneOf: [{ type: 'string' }, { type: 'number' }, { type: 'boolean' }, { type: 'array', items: { type: 'string' } }],
  })
  @IsDefined()
  value!: string | number | boolean | string[];
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
