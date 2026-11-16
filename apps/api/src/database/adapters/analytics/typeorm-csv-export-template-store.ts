import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CsvExportTemplate } from '@attraccess/database-entities';
import {
  CsvExportTemplateColumnRecord,
  CsvExportTemplateRecord,
  CsvExportType,
  NewCsvExportTemplate,
} from '@attraccess/application-models';
import {
  CsvExportTemplateNameTakenError,
  CsvExportTemplateStore,
} from '../../../analytics/csv-export-template-store.port';
import { isUniqueViolation } from '../../persistence-errors';

const toRecord = (row: CsvExportTemplate): CsvExportTemplateRecord => ({
  id: row.id,
  name: row.name,
  exportType: row.exportType,
  columns: row.columns,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

@Injectable()
export class TypeOrmCsvExportTemplateStore implements CsvExportTemplateStore {
  constructor(@InjectRepository(CsvExportTemplate) private readonly templates: Repository<CsvExportTemplate>) {}

  async list(exportType?: CsvExportType): Promise<CsvExportTemplateRecord[]> {
    const rows = await this.templates.find({
      where: exportType ? { exportType } : {},
      order: { name: 'ASC' },
    });
    return rows.map(toRecord);
  }

  async find(id: number): Promise<CsvExportTemplateRecord | null> {
    const row = await this.templates.findOne({ where: { id } });
    return row ? toRecord(row) : null;
  }

  async create(template: NewCsvExportTemplate): Promise<CsvExportTemplateRecord> {
    return this.save(this.templates.create(template));
  }

  async update(
    id: number,
    changes: { name?: string; columns?: CsvExportTemplateColumnRecord[] },
  ): Promise<CsvExportTemplateRecord | null> {
    const row = await this.templates.findOne({ where: { id } });
    if (!row) {
      return null;
    }
    if (changes.name !== undefined) {
      row.name = changes.name;
    }
    if (changes.columns !== undefined) {
      row.columns = changes.columns;
    }
    return this.save(row);
  }

  async remove(id: number): Promise<void> {
    const row = await this.templates.findOne({ where: { id } });
    if (row) {
      await this.templates.remove(row);
    }
  }

  private async save(row: CsvExportTemplate): Promise<CsvExportTemplateRecord> {
    try {
      return toRecord(await this.templates.save(row));
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new CsvExportTemplateNameTakenError(row.name);
      }
      throw error;
    }
  }
}
