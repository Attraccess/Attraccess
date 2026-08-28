import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { FormFieldType } from '@attraccess/database-entities';

export class FormFieldBaseDto {
  @ApiProperty({ description: 'Field display name', example: 'Project name' })
  @IsString()
  name!: string;

  @ApiProperty({ description: 'Position of the field within the form', example: 0 })
  @IsInt()
  @Min(0)
  position!: number;

  @ApiProperty({
    description: 'Field type',
    enum: FormFieldType,
    enumName: 'FormFieldType',
    example: FormFieldType.TEXT,
  })
  @IsEnum(FormFieldType)
  type!: FormFieldType;

  @ApiProperty({ description: 'Whether the field is required', example: true })
  @IsBoolean()
  isRequired!: boolean;

  @ApiProperty({ description: 'Optional description shown below the label', required: false })
  @IsOptional()
  @IsString()
  description?: string | null;

  @ApiProperty({
    description: 'Arbitrary options payload (e.g. select choices)',
    required: false,
    oneOf: [{ type: 'object', additionalProperties: true }, { type: 'array', items: { type: 'string' } }],
  })
  @IsOptional()
  options?: Record<string, unknown> | string[] | null;
}

export class CreateFormFieldDto extends FormFieldBaseDto {}

export class UpdateFormFieldDto extends FormFieldBaseDto {
  @ApiProperty({ description: 'Existing field identifier', required: false })
  @IsOptional()
  @IsInt()
  @Min(1)
  id?: number;
}

export class FormFieldResponseDto extends FormFieldBaseDto {
  @ApiProperty({ description: 'Field identifier', example: 42 })
  id!: number;
}
