import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import {
  CsvExportTemplate,
  CsvExportTemplateColumn,
  CsvExportTemplateColumnType,
  CsvExportType,
} from '@attraccess/database-entities';
import {
  CreateCsvExportTemplateDto,
  CsvExportTemplateColumnDto,
  UpdateCsvExportTemplateDto,
} from './dtos/csvExportTemplate.dto';

// Store only the properties that belong to the column type (the DTO allows e.g. a `fieldKey` on a constant).
function toStoredColumns(columns: CsvExportTemplateColumnDto[]): CsvExportTemplateColumn[] {
  return columns.map(({ type, header, fieldKey, value }) =>
    type === CsvExportTemplateColumnType.FIELD ? { type, header, fieldKey } : { type, header, value: value ?? '' },
  );
}

function isUniqueViolation(error: unknown): boolean {
  if (!(error instanceof QueryFailedError)) {
    return false;
  }
  // '23505' = Postgres unique; SQLite reuses SQLITE_CONSTRAINT for FK/CHECK/NOT NULL too, so narrow by message
  const code = (error as QueryFailedError & { code?: string | number }).code;
  return code === '23505' || (code === 'SQLITE_CONSTRAINT' && error.message.includes('UNIQUE constraint failed'));
}

@Injectable()
export class CsvExportTemplatesService {
  public constructor(
    @InjectRepository(CsvExportTemplate)
    private readonly templateRepository: Repository<CsvExportTemplate>,
  ) {}

  public async findAll(exportType?: CsvExportType): Promise<CsvExportTemplate[]> {
    const templates = await this.templateRepository.find({
      where: exportType ? { exportType } : {},
      order: { name: 'ASC' },
    });
    // The database orders by binary collation ("Z" before "a"); users expect "a, B, c". The list is small.
    return templates.sort(
      (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) || (a.name < b.name ? -1 : 1),
    );
  }

  public async findOne(id: number): Promise<CsvExportTemplate> {
    const template = await this.templateRepository.findOne({ where: { id } });
    if (!template) {
      throw new NotFoundException(`CSV export template ${id} not found`);
    }
    return template;
  }

  public async create(dto: CreateCsvExportTemplateDto): Promise<CsvExportTemplate> {
    const template = this.templateRepository.create({
      name: dto.name,
      exportType: dto.exportType,
      columns: toStoredColumns(dto.columns),
    });
    return await this.save(template);
  }

  public async update(id: number, dto: UpdateCsvExportTemplateDto): Promise<CsvExportTemplate> {
    const template = await this.findOne(id);
    if (dto.name !== undefined) {
      template.name = dto.name;
    }
    if (dto.columns !== undefined) {
      template.columns = toStoredColumns(dto.columns);
    }
    return await this.save(template);
  }

  public async remove(id: number): Promise<void> {
    const template = await this.findOne(id);
    await this.templateRepository.remove(template);
  }

  private async save(template: CsvExportTemplate): Promise<CsvExportTemplate> {
    try {
      return await this.templateRepository.save(template);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          `A CSV export template named "${template.name}" already exists for this export type`,
        );
      }
      throw error;
    }
  }
}
