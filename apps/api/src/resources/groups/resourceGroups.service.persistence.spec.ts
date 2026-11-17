import { DataSource } from 'typeorm';
import { entities, ResourceGroup } from '@attraccess/database-entities';
import { ResourceGroupsService } from './resourceGroups.service';
import { TypeOrmResourceGroupStore } from '../../database/adapters/resources/resource-group-store.adapter';

describe('ResourceGroupsService partial updates', () => {
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  let source: DataSource;
  let service: ResourceGroupsService;

  beforeEach(async () => {
    source = await new DataSource({
      type: 'sqlite',
      database: ':memory:',
      entities: Object.values(entities),
      synchronize: true,
    }).initialize();
    service = new ResourceGroupsService(
      new TypeOrmResourceGroupStore(source),
      { emit: jest.fn() } as never,
      { resourceGroupsTotal: { inc: jest.fn(), dec: jest.fn() } } as never,
      audit as never,
    );
    audit.record.mockClear();
  });

  afterEach(async () => {
    await source.destroy();
  });

  it('preserves omitted fields with SQLite persistence and skips no-op audits', async () => {
    const repository = source.getRepository(ResourceGroup);
    const group = await repository.save({
      name: 'Workshop',
      description: 'Original description',
      retrainingBlocksAccess: false,
      isHidden: false,
    });

    await service.updateOneById(group.id, { isHidden: true }, { id: 9 });

    expect(await repository.findOneByOrFail({ id: group.id })).toEqual(
      expect.objectContaining({
        name: 'Workshop',
        description: 'Original description',
        isHidden: true,
      }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        domain: 'resource',
        details: { 'before.isHidden': 0, 'after.isHidden': 1, changedFields: '["isHidden"]' },
      }),
    );

    audit.record.mockClear();
    await service.updateOneById(group.id, { isHidden: true }, { id: 9 });
    expect(audit.record).not.toHaveBeenCalled();
  });
});
