import { Attractap, Resource } from '@attraccess/database-entities';
import { ResourceType } from '@attraccess/application-models';
import { DataSource } from 'typeorm';
import { TypeOrmAttractapReaderStore } from '../database/adapters/attractap/typeorm-reader.store';
import { AttractapService } from './attractap.service';
import { createTestDataSource, closeTestDataSource } from '../test-utils/test-database';

/**
 * Readers that are not paired yet exist for the pairing session only. This runs the real queries
 * against a real database: every list the rest of the product reads has to leave them out.
 *
 * Each run gets a private database cloned from the migrated template.
 */
describe('reader listings and pairing state', () => {
  let source: DataSource;
  let service: AttractapService;
  let resource: Resource;

  const addReader = (name: string, pairingState: 'paired' | 'revoked') =>
    source.getRepository(Attractap).save({
      name,
      pairingState,
      resources: [resource],
    } as Attractap);

  beforeAll(async () => {
    source = await createTestDataSource();
    resource = await source.getRepository(Resource).save({ name: 'Lathe', type: ResourceType.Machine });
    await addReader('paired', 'paired');
    await addReader('pairing removed', 'revoked');
    const store = new TypeOrmAttractapReaderStore(source.getRepository(Attractap), source.getRepository(Resource));
    service = Object.assign(Object.create(AttractapService.prototype), { readerStore: store });
  });

  afterAll(async () => {
    await closeTestDataSource(source);
  });

  it('lists only paired readers', async () => {
    const readers = await service.getPairedReaders({ withResources: true });
    expect(readers.map((reader) => reader.name)).toEqual(['paired']);
    expect(readers[0].resources).toHaveLength(1);
  });

  it('keeps a caller condition and still leaves out readers that are not paired', async () => {
    const readers = await service.getPairedReaders({ resourceId: resource.id });
    expect(readers.map((reader) => reader.name)).toEqual(['paired']);
  });

  it('leaves the resources out of a list that did not ask for them', async () => {
    const [reader] = await service.getPairedReaders();
    expect(reader.name).toBe('paired');
    expect(reader).not.toHaveProperty('resources');
  });

  it('keeps the paired condition when the caller can only ask for paired readers', async () => {
    const readers = await service.getPairedReaders({ paired: false, resourceId: resource.id });
    expect(readers.map((reader) => reader.name)).toEqual(['paired']);
  });

  it('gives the pairing session the readers whose pairing was removed, and only those', async () => {
    const readers = await service.getReadersToPair();
    expect(readers.map((reader) => reader.name).sort()).toEqual(['pairing removed']);
    expect(readers[0].resources).toHaveLength(1);
  });
});
