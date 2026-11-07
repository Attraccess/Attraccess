import { Attractap, entities, Resource, ResourceType } from '@attraccess/database-entities';
import { DataSource } from 'typeorm';
import * as migrations from '../database/migrations';
import { AttractapService } from './attractap.service';

/**
 * Readers that are not paired yet exist for the pairing session only. This runs the real queries
 * against the real schema: every list the rest of the product reads has to leave them out.
 */
describe('reader listings and pairing state', () => {
  let source: DataSource;
  let service: AttractapService;
  let resource: Resource;

  const addReader = (name: string, pairingState: 'unpaired' | 'paired' | 'revoked') =>
    source.getRepository(Attractap).save({
      name,
      pairingState,
      apiTokenHash: `hash-${name}`,
      resources: [resource],
    } as Attractap);

  beforeAll(async () => {
    source = await new DataSource({
      type: 'sqlite',
      database: ':memory:',
      entities: Object.values(entities),
      migrations: Object.values(migrations),
    }).initialize();
    await source.runMigrations();
    resource = await source.getRepository(Resource).save({ name: 'Lathe', type: ResourceType.Machine });
    await addReader('paired', 'paired');
    await addReader('never paired', 'unpaired');
    await addReader('pairing removed', 'revoked');
    service = Object.assign(Object.create(AttractapService.prototype), {
      readerRepository: source.getRepository(Attractap),
    });
  }, 60_000);

  afterAll(async () => {
    if (source?.isInitialized) await source.destroy();
  });

  it('lists only paired readers', async () => {
    const readers = await service.getPairedReaders({ relations: ['resources'] });
    expect(readers.map((reader) => reader.name)).toEqual(['paired']);
    expect(readers[0].resources).toHaveLength(1);
  });

  it('keeps a caller condition and still leaves out readers that are not paired', async () => {
    const readers = await service.getPairedReaders({ where: { resources: { id: resource.id } } });
    expect(readers.map((reader) => reader.name)).toEqual(['paired']);
  });

  it('applies the pairing condition to every alternative of an OR condition', async () => {
    const readers = await service.getPairedReaders({
      where: [{ name: 'paired' }, { name: 'never paired' }, { name: 'pairing removed' }],
    });
    expect(readers.map((reader) => reader.name)).toEqual(['paired']);
  });

  it('gives the pairing session the readers that are not paired, and only those', async () => {
    const readers = await service.getReadersToPair();
    expect(readers.map((reader) => reader.name).sort()).toEqual(['never paired', 'pairing removed']);
  });
});
