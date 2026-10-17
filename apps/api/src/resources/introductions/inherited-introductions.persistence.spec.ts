import { DataSource, EntitySchema } from 'typeorm';
import {
  ResourceIntroduction,
  ResourceGroup,
  Resource,
  User,
  ResourceIntroductionHistoryItem,
  IntroductionHistoryAction,
} from '@attraccess/database-entities';
import { ResourceIntroductionsService } from './resouceIntroductions.service';
import { ResourceGroupsIntroductionsService } from '../groups/introductions/resourceGroups.introductions.service';
import { ResourceRetrainingService } from '../retraining/resourceRetraining.service';

const user = new EntitySchema<User>({ name: 'User', target: User, columns: { id: { type: Number, primary: true } } });
const resource = new EntitySchema<Resource>({
  name: 'Resource',
  target: Resource,
  columns: { id: { type: Number, primary: true } },
  relations: { groups: { type: 'many-to-many', target: 'ResourceGroup', inverseSide: 'resources', joinTable: true } },
});
const group = new EntitySchema<ResourceGroup>({
  name: 'ResourceGroup',
  target: ResourceGroup,
  columns: { id: { type: Number, primary: true }, name: { type: String } },
  relations: { resources: { type: 'many-to-many', target: 'Resource', inverseSide: 'groups' } },
});
const introduction = new EntitySchema<ResourceIntroduction>({
  name: 'ResourceIntroduction',
  target: ResourceIntroduction,
  columns: { id: { type: Number, primary: true } },
  relations: {
    resource: { type: 'many-to-one', target: 'Resource' },
    resourceGroup: { type: 'many-to-one', target: 'ResourceGroup' },
    receiverUser: { type: 'many-to-one', target: 'User' },
    tutorUser: { type: 'many-to-one', target: 'User' },
    history: { type: 'one-to-many', target: 'ResourceIntroductionHistoryItem', inverseSide: 'introduction' },
  },
});
const history = new EntitySchema<ResourceIntroductionHistoryItem>({
  name: 'ResourceIntroductionHistoryItem',
  target: ResourceIntroductionHistoryItem,
  columns: { id: { type: Number, primary: true }, action: { type: String }, createdAt: { type: Date } },
  relations: { introduction: { type: 'many-to-one', target: 'ResourceIntroduction', inverseSide: 'history' } },
});

describe('inherited introduction query', () => {
  let source: DataSource;
  let service: ResourceIntroductionsService;
  beforeEach(async () => {
    source = await new DataSource({
      type: 'sqlite',
      database: ':memory:',
      entities: [user, resource, group, introduction, history],
      synchronize: true,
    }).initialize();
    service = new ResourceIntroductionsService(
      source.getRepository(ResourceIntroduction),
      source.getRepository(ResourceIntroductionHistoryItem),
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    await source.getRepository(User).save({ id: 1 });
    await source.getRepository(ResourceGroup).save([
      { id: 10, name: 'Etch' },
      { id: 11, name: 'Deposition' },
      { id: 12, name: 'Unrelated' },
    ]);
    await source.getRepository(Resource).save([
      { id: 2, groups: [{ id: 10 }, { id: 11 }] },
      { id: 3, groups: [{ id: 12 }] },
    ]);
    await source
      .getRepository(ResourceIntroduction)
      .save([
        { id: 100, resource: { id: 2 }, receiverUser: { id: 1 } },
        ...[10, 11, 12].map((id) => ({ id, resourceGroup: { id }, receiverUser: { id: 1 } })),
      ]);
    await source.getRepository(ResourceIntroductionHistoryItem).save([
      { id: 1, introduction: { id: 10 }, action: IntroductionHistoryAction.GRANT, createdAt: new Date('2026-01-01') },
      { id: 2, introduction: { id: 10 }, action: IntroductionHistoryAction.REVOKE, createdAt: new Date('2026-02-01') },
    ]);
  });
  afterEach(async () => {
    await source.destroy();
  });
  it.each([
    [100, 'resource'],
    [10, 'group'],
  ])('uses the newest event ID when %s %s history timestamps match', async (id, kind) => {
    const historyRepository = source.getRepository(ResourceIntroductionHistoryItem);
    const groups = new ResourceGroupsIntroductionsService(
      source.getRepository(ResourceIntroduction),
      historyRepository,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const retraining = new RetrainingValidityProbe(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      historyRepository,
      {} as never,
      {} as never,
      {} as never,
    );
    const valid = () =>
      kind === 'resource'
        ? service.hasValidIntroduction(2, 1)
        : groups.hasValidIntroduction({ groupId: 10, userId: 1 });
    const createdAt = new Date('2026-03-01');
    await historyRepository.save([
      { id: 20, introduction: { id }, action: IntroductionHistoryAction.GRANT, createdAt },
      { id: 21, introduction: { id }, action: IntroductionHistoryAction.REVOKE, createdAt },
    ]);
    expect(await valid()).toBe(false);
    expect(await retraining.hasValidHistory(id)).toBe(false);
    await historyRepository.save({ id: 22, introduction: { id }, action: IntroductionHistoryAction.GRANT, createdAt });
    expect(await valid()).toBe(true);
    expect(await retraining.hasValidHistory(id)).toBe(true);
  });
  it('keeps the default direct-only and batches introductions from every containing group with history and names', async () => {
    expect((await service.getMany(2)).map((intro) => intro.id)).toEqual([100]);
    const rows = await service.getMany(2, true);
    expect(rows.map((intro) => intro.id).sort((a, b) => a - b)).toEqual([10, 11, 100]);
    expect(rows.find((intro) => intro.id === 10)).toMatchObject({
      resourceGroup: { name: 'Etch' },
      receiverUser: { id: 1 },
    });
    expect(
      rows
        .find((intro) => intro.id === 10)
        ?.history.map((event) => event.action)
        .sort(),
    ).toEqual(['grant', 'revoke']);
    await source.getRepository(Resource).save({ id: 2, groups: [{ id: 11 }] });
    expect((await service.getMany(2, true)).map((intro) => intro.id).sort((a, b) => a - b)).toEqual([11, 100]);
    await source.getRepository(Resource).save({ id: 2, groups: [] });
    expect((await service.getMany(2, true)).map((intro) => intro.id)).toEqual([100]);
  });
});

class RetrainingValidityProbe extends ResourceRetrainingService {
  hasValidHistory(id: number) {
    return this.isValid(id);
  }
}
