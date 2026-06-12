import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { QueryFailedError } from 'typeorm';
import {
  CsvExportTemplate,
  CsvExportTemplateColumnType,
  CsvExportType,
} from '@attraccess/database-entities';
import { CsvExportTemplatesService } from './csv-export-templates.service';

describe('CsvExportTemplatesService', () => {
  let service: CsvExportTemplatesService;

  const mockRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    remove: jest.fn(),
  };

  const template: CsvExportTemplate = {
    id: 1,
    name: 'Accounting upload',
    exportType: CsvExportType.RESOURCE_USAGE_HOURS,
    columns: [
      { type: CsvExportTemplateColumnType.FIELD, header: 'Machine', fieldKey: 'resourceName' },
      { type: CsvExportTemplateColumnType.CONSTANT, header: 'Org', value: 'makerspace' },
    ],
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CsvExportTemplatesService,
        {
          provide: getRepositoryToken(CsvExportTemplate),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<CsvExportTemplatesService>(CsvExportTemplatesService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('returns all templates ordered by name', async () => {
      mockRepository.find.mockResolvedValue([template]);

      const result = await service.findAll();

      expect(mockRepository.find).toHaveBeenCalledWith({ where: {}, order: { name: 'ASC' } });
      expect(result).toEqual([template]);
    });

    it('filters by export type when given', async () => {
      mockRepository.find.mockResolvedValue([]);

      await service.findAll(CsvExportType.BILLING_TRANSACTIONS);

      expect(mockRepository.find).toHaveBeenCalledWith({
        where: { exportType: CsvExportType.BILLING_TRANSACTIONS },
        order: { name: 'ASC' },
      });
    });
  });

  describe('findOne', () => {
    it('returns the template', async () => {
      mockRepository.findOne.mockResolvedValue(template);

      await expect(service.findOne(1)).resolves.toEqual(template);
      expect(mockRepository.findOne).toHaveBeenCalledWith({ where: { id: 1 } });
    });

    it('throws NotFoundException for unknown id', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(service.findOne(999)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('create', () => {
    it('saves and returns the created template', async () => {
      mockRepository.create.mockReturnValue(template);
      mockRepository.save.mockResolvedValue(template);

      const result = await service.create({
        name: template.name,
        exportType: template.exportType,
        columns: template.columns,
      });

      expect(mockRepository.create).toHaveBeenCalledWith({
        name: template.name,
        exportType: template.exportType,
        columns: template.columns,
      });
      expect(result).toEqual(template);
    });

    it('throws ConflictException on duplicate name per export type', async () => {
      mockRepository.create.mockReturnValue(template);
      mockRepository.save.mockRejectedValue(
        new QueryFailedError('INSERT', [], new Error('SQLITE_CONSTRAINT: UNIQUE constraint failed')),
      );

      await expect(
        service.create({
          name: template.name,
          exportType: template.exportType,
          columns: template.columns,
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('throws ConflictException on postgres duplicate template names', async () => {
      mockRepository.create.mockReturnValue(template);
      mockRepository.save.mockRejectedValue(
        new QueryFailedError(
          'INSERT',
          [],
          new Error('duplicate key value violates unique constraint "csv_export_template_name_per_type"'),
        ),
      );

      await expect(
        service.create({
          name: template.name,
          exportType: template.exportType,
          columns: template.columns,
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('update', () => {
    it('updates name and columns', async () => {
      mockRepository.findOne.mockResolvedValue({ ...template });
      mockRepository.save.mockImplementation(async (entity) => entity);

      const result = await service.update(1, {
        name: 'Renamed',
        columns: [{ type: CsvExportTemplateColumnType.CONSTANT, header: 'Only', value: 'x' }],
      });

      expect(result.name).toBe('Renamed');
      expect(result.columns).toEqual([{ type: CsvExportTemplateColumnType.CONSTANT, header: 'Only', value: 'x' }]);
    });

    it('keeps existing values for omitted fields', async () => {
      mockRepository.findOne.mockResolvedValue({ ...template });
      mockRepository.save.mockImplementation(async (entity) => entity);

      const result = await service.update(1, { name: 'Renamed' });

      expect(result.name).toBe('Renamed');
      expect(result.columns).toEqual(template.columns);
    });
  });

  describe('remove', () => {
    it('removes the template', async () => {
      mockRepository.findOne.mockResolvedValue(template);
      mockRepository.remove.mockResolvedValue(template);

      await service.remove(1);

      expect(mockRepository.remove).toHaveBeenCalledWith(template);
    });

    it('throws NotFoundException for unknown id', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(service.remove(999)).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
