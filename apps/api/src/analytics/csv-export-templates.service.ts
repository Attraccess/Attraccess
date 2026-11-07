import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { CsvExportTemplate, CsvExportType } from '@attraccess/database-entities';
import { CreateCsvExportTemplateDto, UpdateCsvExportTemplateDto } from './dtos/csvExportTemplate.dto';

@Injectable()
export class CsvExportTemplatesService {
  public constructor(
    @InjectRepository(CsvExportTemplate)
    private readonly templateRepository: Repository<CsvExportTemplate>,
  ) {}

  public async findAll(exportType?: CsvExportType): Promise<CsvExportTemplate[]> {
    return await this.templateRepository.find({
      where: exportType ? { exportType } : {},
      order: { name: 'ASC' },
    });
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
      columns: dto.columns,
    });
    return await this.save(template);
  }

  public async update(id: number, dto: UpdateCsvExportTemplateDto): Promise<CsvExportTemplate> {
    const template = await this.findOne(id);
    if (dto.name !== undefined) {
      template.name = dto.name;
    }
    if (dto.columns !== undefined) {
      template.columns = dto.columns;
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
      if (
        error instanceof QueryFailedError &&
        (/UNIQUE constraint failed/i.test(error.message) || error.message.includes('csv_export_template_name_per_type'))
      ) {
        throw new ConflictException(
          `A CSV export template named "${template.name}" already exists for this export type`,
        );
      }
      throw error;
    }
  }
}
