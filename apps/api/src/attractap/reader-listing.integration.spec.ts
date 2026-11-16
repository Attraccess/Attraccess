import { Attractap, entities, Resource, ResourceType } from '@attraccess/database-entities';
import { DataSource, Table } from 'typeorm';
import { AttractapService } from './attractap.service';

/**
 * Readers that are not paired yet exist for the pairing session only. This runs the real queries
 * against a real database: every list the rest of the product reads has to leave them out.
 *
 * Only the tables these queries touch are created, from the real entity metadata. Replaying every
 * migration (or syncing all entities) made setup slow enough to time out on loaded coverage runs;
 * the pairing migration has its own spec.
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
    }).initialize();
    const readers = source.getMetadata(Attractap);
    const tables = [
      source.getMetadata(Resource),
      readers,
      ...readers.manyToManyRelations.flatMap((relation) => relation.junctionEntityMetadata ?? []),
    ];
    const queryRunner = source.createQueryRunner();
    try {
      for (const table of tables) await queryRunner.createTable(Table.create(table, source.driver));
    } finally {
      await queryRunner.release();
    }
    resource = await source.getRepository(Resource).save({ name: 'Lathe', type: ResourceType.Machine });
    await addReader('paired', 'paired');
    await addReader('never paired', 'unpaired');
    await addReader('pairing removed', 'revoked');
    service = Object.assign(Object.create(AttractapService.prototype), {
      readerRepository: source.getRepository(Attractap),
    });
  });

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
