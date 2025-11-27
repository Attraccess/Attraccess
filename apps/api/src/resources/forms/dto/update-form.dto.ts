import { ApiProperty } from '@nestjs/swagger';
import { IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { UpdateFormFieldDto } from './form-field.dto';
import { BaseFormDto } from './create-form.dto';

export class UpdateFormDto extends BaseFormDto {
  @ApiProperty({ type: () => UpdateFormFieldDto, isArray: true })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateFormFieldDto)
  fields!: UpdateFormFieldDto[];
}
