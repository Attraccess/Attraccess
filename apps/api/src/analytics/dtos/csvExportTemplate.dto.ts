import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { CsvExportTemplateColumnType, CsvExportType } from '@attraccess/database-entities';

export const CSV_EXPORT_TEMPLATE_MAX_COLUMNS = 200;

const trimString = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

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
    description: "The header written to the first CSV row. Empty means: use the field's default label.",
    example: 'Machine',
    maxLength: 255,
  })
  @IsString()
  @MaxLength(255)
  header: string;

  @ApiProperty({
    description:
      'The key of the data field to output (required for type "field"). Field keys are stable identifiers, they are persisted and must not be renamed.',
    example: 'resourceName',
    required: false,
    maxLength: 255,
  })
  @ValidateIf(
    (column: CsvExportTemplateColumnDto) =>
      column.type === CsvExportTemplateColumnType.FIELD || column.fieldKey !== undefined,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  fieldKey?: string;

  @ApiProperty({
    description: 'The constant value written to every row (type "constant" only, may be an empty string)',
    example: 'makerspace-bocholt',
    required: false,
    maxLength: 1024,
  })
  @IsOptional()
  @IsString()
  @MaxLength(1024)
  value?: string;
}

export class CreateCsvExportTemplateDto {
  @ApiProperty({
    description: 'The display name of the template (unique per export type)',
    example: 'Accounting upload',
    maxLength: 120,
  })
  @Transform(trimString)
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
    description: 'The ordered column configuration of the template (1 to 200 columns)',
    type: [CsvExportTemplateColumnDto],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(CSV_EXPORT_TEMPLATE_MAX_COLUMNS)
  @ValidateNested({ each: true })
  @Type(() => CsvExportTemplateColumnDto)
  columns: CsvExportTemplateColumnDto[];
}

export class UpdateCsvExportTemplateDto {
  @ApiProperty({
    description: 'The display name of the template',
    example: 'Accounting upload',
    required: false,
    maxLength: 120,
  })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name?: string;

  @ApiProperty({
    description: 'The ordered column configuration of the template (1 to 200 columns)',
    type: [CsvExportTemplateColumnDto],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(CSV_EXPORT_TEMPLATE_MAX_COLUMNS)
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
