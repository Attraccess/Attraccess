import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  CsvExportTemplateColumnRecord,
  CsvExportTemplateColumnType,
  CsvExportTemplateRecord,
  CsvExportType,
} from '@attraccess/application-models';
import {
  CreateCsvExportTemplateDto,
  CsvExportTemplateColumnDto,
  UpdateCsvExportTemplateDto,
} from './dtos/csvExportTemplate.dto';
import {
  CSV_EXPORT_TEMPLATE_STORE,
  CsvExportTemplateNameTakenError,
  CsvExportTemplateStore,
} from './csv-export-template-store.port';

// Store only the properties that belong to the column type (the DTO allows e.g. a `fieldKey` on a constant).
function toStoredColumns(columns: CsvExportTemplateColumnDto[]): CsvExportTemplateColumnRecord[] {
  return columns.map(({ type, header, fieldKey, value }) =>
    type === CsvExportTemplateColumnType.FIELD ? { type, header, fieldKey } : { type, header, value: value ?? '' },
  );
}

@Injectable()
export class CsvExportTemplatesService {
  public constructor(
    @Inject(CSV_EXPORT_TEMPLATE_STORE)
    private readonly store: CsvExportTemplateStore,
  ) {}

  public async findAll(exportType?: CsvExportType): Promise<CsvExportTemplateRecord[]> {
    const templates = await this.store.list(exportType);
    // The database orders by binary collation ("Z" before "a"); users expect "a, B, c". The list is small.
    return templates.sort(
      (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) || (a.name < b.name ? -1 : 1),
    );
  }

  public async findOne(id: number): Promise<CsvExportTemplateRecord> {
    const template = await this.store.find(id);
    if (!template) {
      throw new NotFoundException(`CSV export template ${id} not found`);
    }
    return template;
  }

  public async create(dto: CreateCsvExportTemplateDto): Promise<CsvExportTemplateRecord> {
    return await this.guardNameConflict(() =>
      this.store.create({
        name: dto.name,
        exportType: dto.exportType,
        columns: toStoredColumns(dto.columns),
      }),
    );
  }

  public async update(id: number, dto: UpdateCsvExportTemplateDto): Promise<CsvExportTemplateRecord> {
    await this.findOne(id);
    const updated = await this.guardNameConflict(() =>
      this.store.update(id, {
        name: dto.name,
        columns: dto.columns === undefined ? undefined : toStoredColumns(dto.columns),
      }),
    );
    if (!updated) {
      throw new NotFoundException(`CSV export template ${id} not found`);
    }
    return updated;
  }

  public async remove(id: number): Promise<void> {
    await this.findOne(id);
    await this.store.remove(id);
  }

  private async guardNameConflict<T>(save: () => Promise<T>): Promise<T> {
    try {
      return await save();
    } catch (error) {
      if (error instanceof CsvExportTemplateNameTakenError) {
        throw new ConflictException(error.message);
      }
      throw error;
    }
  }
}
