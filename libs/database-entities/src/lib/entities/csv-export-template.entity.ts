import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';

export enum CsvExportType {
  RESOURCE_USAGE_HOURS = 'resourceUsageHours',
  BILLING_TRANSACTIONS = 'billingTransactions',
}

export enum CsvExportTemplateColumnType {
  FIELD = 'field',
  CONSTANT = 'constant',
}

export class CsvExportTemplateColumn {
  @ApiProperty({
    description: 'Whether this column outputs a data field or a constant value',
    enum: CsvExportTemplateColumnType,
    enumName: 'CsvExportTemplateColumnType',
    example: CsvExportTemplateColumnType.FIELD,
  })
  type!: CsvExportTemplateColumnType;

  @ApiProperty({
    description: 'The header written to the first CSV row for this column',
    example: 'Machine',
  })
  header!: string;

  @ApiProperty({
    description: 'The key of the data field to output (only for type "field")',
    example: 'resourceName',
    required: false,
    nullable: true,
  })
  fieldKey?: string | null;

  @ApiProperty({
    description: 'The constant value written to every row (only for type "constant")',
    example: 'makerspace-bocholt',
    required: false,
    nullable: true,
  })
  value?: string | null;
}

@Entity()
@Unique('csv_export_template_name_per_type', ['exportType', 'name'])
export class CsvExportTemplate {
  @PrimaryGeneratedColumn()
  @ApiProperty({
    description: 'The unique identifier of the CSV export template',
    example: 1,
  })
  id!: number;

  @Column({ type: 'text' })
  @ApiProperty({
    description: 'The display name of the template',
    example: 'Accounting upload',
  })
  name!: string;

  @Column({ type: 'text' })
  @ApiProperty({
    description: 'The export type this template applies to',
    enum: CsvExportType,
    enumName: 'CsvExportType',
    example: CsvExportType.RESOURCE_USAGE_HOURS,
  })
  exportType!: CsvExportType;

  @Column({ type: 'json' })
  @ApiProperty({
    description: 'The ordered column configuration of the template',
    type: [CsvExportTemplateColumn],
  })
  columns!: CsvExportTemplateColumn[];

  @CreateDateColumn()
  @ApiProperty({ description: 'When the template was created' })
  createdAt!: Date;

  @UpdateDateColumn()
  @ApiProperty({ description: 'When the template was last updated' })
  updatedAt!: Date;
}
