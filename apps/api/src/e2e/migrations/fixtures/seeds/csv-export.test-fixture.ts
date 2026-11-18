import type { DataSource } from 'typeorm';
import { CsvExportTemplate } from '@attraccess/database-entities';
import { CsvExportTemplateColumnType, CsvExportType } from '@attraccess/application-models';
import { ensureEntity } from '../seed-storage.test-fixture';

export async function migrationCsvExportSeeds(dataSource: DataSource, seedTag: string) {
  await ensureEntity(dataSource.getRepository(CsvExportTemplate), () => ({
    name: `Seed template ${seedTag}`,
    exportType: CsvExportType.RESOURCE_USAGE_HOURS,
    columns: [
      { type: CsvExportTemplateColumnType.FIELD, header: '', fieldKey: 'resourceName' },
      { type: CsvExportTemplateColumnType.CONSTANT, header: 'Org', value: 'makerspace' },
    ],
  }));
}
