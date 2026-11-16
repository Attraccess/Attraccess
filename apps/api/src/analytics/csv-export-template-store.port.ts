import type {
  CsvExportTemplateColumnRecord,
  CsvExportTemplateRecord,
  CsvExportType,
  NewCsvExportTemplate,
} from '@attraccess/application-models';

/** Persistence of the CSV export templates shared by the whole installation. */
export const CSV_EXPORT_TEMPLATE_STORE = Symbol.for('attraccess.analytics.csv-export-template-store');

/** Another template of the same export type already has this name. */
export class CsvExportTemplateNameTakenError extends Error {
  constructor(readonly templateName: string) {
    super(`A CSV export template named "${templateName}" already exists for this export type`);
    this.name = 'CsvExportTemplateNameTakenError';
  }
}

export interface CsvExportTemplateStore {
  /** Templates ordered by name, of one export type when given. */
  list(exportType?: CsvExportType): Promise<CsvExportTemplateRecord[]>;
  find(id: number): Promise<CsvExportTemplateRecord | null>;
  /** @throws CsvExportTemplateNameTakenError when the name is taken for the export type. */
  create(template: NewCsvExportTemplate): Promise<CsvExportTemplateRecord>;
  /** @throws CsvExportTemplateNameTakenError when the new name is taken for the export type. */
  update(
    id: number,
    changes: { name?: string; columns?: CsvExportTemplateColumnRecord[] },
  ): Promise<CsvExportTemplateRecord | null>;
  remove(id: number): Promise<void>;
}
