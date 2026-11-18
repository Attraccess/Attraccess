import type { CsvExportTemplateColumnType, CsvExportType } from './csv-export-template';

/** One configured column of a CSV export template. */
export interface CsvExportTemplateColumnRecord {
  type: CsvExportTemplateColumnType;
  header: string;
  fieldKey?: string | null;
  value?: string | null;
}

export interface CsvExportTemplateRecord {
  id: number;
  name: string;
  exportType: CsvExportType;
  columns: CsvExportTemplateColumnRecord[];
  createdAt: Date;
  updatedAt: Date;
}

export interface NewCsvExportTemplate {
  name: string;
  exportType: CsvExportType;
  columns: CsvExportTemplateColumnRecord[];
}
