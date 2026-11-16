import { ApiProperty } from '@nestjs/swagger';
import { CsvExportTemplateColumnType, CsvExportType } from '@attraccess/application-models';

/** Response shape of a template column. The class name is the schema name of the published API description. */
export class CsvExportTemplateColumn {
  @ApiProperty({
    description: 'Whether this column outputs a data field or a constant value',
    enum: CsvExportTemplateColumnType,
    enumName: 'CsvExportTemplateColumnType',
    example: CsvExportTemplateColumnType.FIELD,
  })
  type!: CsvExportTemplateColumnType;

  @ApiProperty({
    description: "The header written to the first CSV row. Empty means: use the field's default label.",
    example: 'Machine',
    maxLength: 255,
  })
  header!: string;

  @ApiProperty({
    description:
      'The key of the data field to output (only for type "field"). Field keys are stable identifiers, they are persisted and must not be renamed.',
    example: 'resourceName',
    required: false,
    nullable: true,
    maxLength: 255,
  })
  fieldKey?: string | null;

  @ApiProperty({
    description: 'The constant value written to every row (only for type "constant", may be an empty string)',
    example: 'makerspace-bocholt',
    required: false,
    nullable: true,
    maxLength: 1024,
  })
  value?: string | null;
}

/** Response shape of a CSV export template. The class name is the schema name of the published API description. */
export class CsvExportTemplate {
  @ApiProperty({
    description: 'The unique identifier of the CSV export template',
    example: 1,
  })
  id!: number;

  @ApiProperty({
    description: 'The display name of the template (unique per export type)',
    example: 'Accounting upload',
    maxLength: 120,
  })
  name!: string;

  @ApiProperty({
    description: 'The export type this template applies to',
    enum: CsvExportType,
    enumName: 'CsvExportType',
    example: CsvExportType.RESOURCE_USAGE_HOURS,
  })
  exportType!: CsvExportType;

  @ApiProperty({
    description: 'The ordered column configuration of the template',
    type: [CsvExportTemplateColumn],
  })
  columns!: CsvExportTemplateColumn[];

  @ApiProperty({ description: 'When the template was created' })
  createdAt!: Date;

  @ApiProperty({ description: 'When the template was last updated' })
  updatedAt!: Date;
}
