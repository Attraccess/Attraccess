import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { CsvExportTemplateColumnType, CsvExportType } from '@attraccess/database-entities';

export class CsvExportTemplateColumnDto {
  @ApiProperty({
    description: 'Whether this column outputs a data field or a constant value',
    enum: CsvExportTemplateColumnType,
    enumName: 'CsvExportTemplateColumnType',
    example: CsvExportTemplateColumnType.FIELD,
  })
  @IsEnum(CsvExportTemplateColumnType)
  type: CsvExportTemplateColumnType;

  @ApiProperty({
    description: 'The header written to the first CSV row for this column',
    example: 'Machine',
  })
  @IsString()
  @MaxLength(255)
  header: string;

  @ApiProperty({
    description: 'The key of the data field to output (only for type "field")',
    example: 'resourceName',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  fieldKey?: string;

  @ApiProperty({
    description: 'The constant value written to every row (only for type "constant")',
    example: 'makerspace-bocholt',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(1024)
  value?: string;
}

export class CreateCsvExportTemplateDto {
  @ApiProperty({
    description: 'The display name of the template',
    example: 'Accounting upload',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @ApiProperty({
    description: 'The export type this template applies to',
    enum: CsvExportType,
    enumName: 'CsvExportType',
    example: CsvExportType.RESOURCE_USAGE_HOURS,
  })
  @IsEnum(CsvExportType)
  exportType: CsvExportType;

  @ApiProperty({
    description: 'The ordered column configuration of the template',
    type: [CsvExportTemplateColumnDto],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CsvExportTemplateColumnDto)
  columns: CsvExportTemplateColumnDto[];
}

export class UpdateCsvExportTemplateDto {
  @ApiProperty({
    description: 'The display name of the template',
    example: 'Accounting upload',
    required: false,
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name?: string;

  @ApiProperty({
    description: 'The ordered column configuration of the template',
    type: [CsvExportTemplateColumnDto],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CsvExportTemplateColumnDto)
  columns?: CsvExportTemplateColumnDto[];
}

export class CsvExportTemplateListQueryDto {
  @ApiProperty({
    description: 'Only return templates for this export type',
    enum: CsvExportType,
    enumName: 'CsvExportType',
    required: false,
  })
  @IsOptional()
  @IsEnum(CsvExportType)
  exportType?: CsvExportType;
}
