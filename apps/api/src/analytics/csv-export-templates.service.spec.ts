import { ConflictException, NotFoundException } from '@nestjs/common';
import { CsvExportTemplateColumnType, CsvExportTemplateRecord, CsvExportType } from '@attraccess/application-models';
import { CsvExportTemplatesService } from './csv-export-templates.service';
import { CsvExportTemplateNameTakenError, CsvExportTemplateStore } from './csv-export-template-store.port';

/** In-memory store with the port's contract: names are unique per export type. */
class FakeCsvExportTemplateStore implements CsvExportTemplateStore {
  rows: CsvExportTemplateRecord[] = [];
  private nextId = 1;
  readonly listCalls: Array<CsvExportType | undefined> = [];
  failNextWrite: Error | null = null;

  async list(exportType?: CsvExportType) {
    this.listCalls.push(exportType);
    return this.rows
      .filter((row) => !exportType || row.exportType === exportType)
      .map((row) => ({ ...row }))
      .sort((a, b) => (a.name < b.name ? -1 : 1));
  }

  async find(id: number) {
    const row = this.rows.find((candidate) => candidate.id === id);
    return row ? { ...row } : null;
  }

  async create(template: Pick<CsvExportTemplateRecord, 'name' | 'exportType' | 'columns'>) {
    this.assertWritable(undefined, template.exportType, template.name);
    const row = { id: this.nextId++, ...template, createdAt: new Date(0), updatedAt: new Date(0) };
    this.rows.push(row);
    return { ...row };
  }

  async update(id: number, changes: { name?: string; columns?: CsvExportTemplateRecord['columns'] }) {
    const row = this.rows.find((candidate) => candidate.id === id);
    if (!row) return null;
    this.assertWritable(id, row.exportType, changes.name ?? row.name);
    if (changes.name !== undefined) row.name = changes.name;
    if (changes.columns !== undefined) row.columns = changes.columns;
    return { ...row };
  }

  async remove(id: number) {
    this.rows = this.rows.filter((row) => row.id !== id);
  }

  private assertWritable(id: number | undefined, exportType: CsvExportType, name: string) {
    if (this.failNextWrite) {
      const error = this.failNextWrite;
      this.failNextWrite = null;
      throw error;
    }
    if (this.rows.some((row) => row.id !== id && row.exportType === exportType && row.name === name)) {
      throw new CsvExportTemplateNameTakenError(name);
    }
  }
}

describe('CsvExportTemplatesService', () => {
  let service: CsvExportTemplatesService;
  let store: FakeCsvExportTemplateStore;

  const columns = [
    { type: CsvExportTemplateColumnType.FIELD, header: 'Machine', fieldKey: 'resourceName' },
    { type: CsvExportTemplateColumnType.CONSTANT, header: 'Org', value: 'makerspace' },
  ];
  const input = { name: 'Accounting upload', exportType: CsvExportType.RESOURCE_USAGE_HOURS, columns };

  // A constant with a stray fieldKey, a field with a stray value and a constant without value.
  const mixedColumns = [
    { type: CsvExportTemplateColumnType.CONSTANT, header: 'Org', value: 'x', fieldKey: 'resourceName' },
    { type: CsvExportTemplateColumnType.FIELD, header: '', fieldKey: 'userId', value: 'stray' },
    { type: CsvExportTemplateColumnType.CONSTANT, header: 'Empty' },
  ];
  const cleanColumns = [
    { type: CsvExportTemplateColumnType.CONSTANT, header: 'Org', value: 'x' },
    { type: CsvExportTemplateColumnType.FIELD, header: '', fieldKey: 'userId' },
    { type: CsvExportTemplateColumnType.CONSTANT, header: 'Empty', value: '' },
  ];

  beforeEach(() => {
    store = new FakeCsvExportTemplateStore();
    service = new CsvExportTemplatesService(store);
  });

  describe('findAll', () => {
    it('returns all templates', async () => {
      const created = await store.create(input);

      await expect(service.findAll()).resolves.toEqual([created]);
      expect(store.listCalls).toEqual([undefined]);
    });

    it('sorts names case-insensitively', async () => {
      for (const name of ['Zeta', 'alpha', 'Beta']) await store.create({ ...input, name });

      const result = await service.findAll();

      expect(result.map((entry) => entry.name)).toEqual(['alpha', 'Beta', 'Zeta']);
    });

    it('filters by export type when given', async () => {
      await service.findAll(CsvExportType.BILLING_TRANSACTIONS);

      expect(store.listCalls).toEqual([CsvExportType.BILLING_TRANSACTIONS]);
    });
  });

  describe('findOne', () => {
    it('returns the template', async () => {
      const created = await store.create(input);

      await expect(service.findOne(created.id)).resolves.toEqual(created);
    });

    it('throws NotFoundException for unknown id', async () => {
      await expect(service.findOne(999)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('create', () => {
    it('returns the created template', async () => {
      const result = await service.create(input);

      expect(result).toMatchObject(input);
      expect(await store.find(result.id)).toEqual(result);
    });

    it('throws ConflictException on duplicate name per export type', async () => {
      await service.create(input);

      await expect(service.create(input)).rejects.toBeInstanceOf(ConflictException);
    });

    it('allows the same name for another export type', async () => {
      await service.create(input);

      await expect(service.create({ ...input, exportType: CsvExportType.BILLING_TRANSACTIONS })).resolves.toMatchObject(
        { name: input.name },
      );
    });

    it('rethrows other failures unchanged', async () => {
      const error = new Error('no such table');
      store.failNextWrite = error;

      await expect(service.create(input)).rejects.toBe(error);
    });

    it('stores only the properties that belong to each column type', async () => {
      const result = await service.create({ ...input, columns: mixedColumns });

      expect(result.columns).toStrictEqual(cleanColumns);
    });
  });

  describe('update', () => {
    it('stores only the properties that belong to each column type', async () => {
      const { id } = await store.create(input);

      const result = await service.update(id, { columns: mixedColumns });

      expect(result.columns).toStrictEqual(cleanColumns);
    });

    it('updates name and columns', async () => {
      const { id } = await store.create(input);

      const result = await service.update(id, {
        name: 'Renamed',
        columns: [{ type: CsvExportTemplateColumnType.CONSTANT, header: 'Only', value: 'x' }],
      });

      expect(result.name).toBe('Renamed');
      expect(result.columns).toEqual([{ type: CsvExportTemplateColumnType.CONSTANT, header: 'Only', value: 'x' }]);
    });

    it('keeps existing values for omitted fields', async () => {
      const { id } = await store.create(input);

      const result = await service.update(id, { name: 'Renamed' });

      expect(result.name).toBe('Renamed');
      expect(result.columns).toEqual(columns);
    });

    it('throws ConflictException when the new name is taken', async () => {
      await store.create({ ...input, name: 'Taken' });
      const { id } = await store.create(input);

      await expect(service.update(id, { name: 'Taken' })).rejects.toBeInstanceOf(ConflictException);
    });

    it('throws NotFoundException for unknown id', async () => {
      await expect(service.update(999, { name: 'x' })).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('remove', () => {
    it('removes the template', async () => {
      const { id } = await store.create(input);

      await service.remove(id);

      expect(await store.find(id)).toBeNull();
    });

    it('throws NotFoundException for unknown id', async () => {
      await expect(service.remove(999)).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
