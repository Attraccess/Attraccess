import { closeTestDataSource, createTestDataSource } from '../../../test-utils/test-database';
import type { DataSource } from 'typeorm';
import {
  DashboardPin,
  entities,
  Resource,
  ResourceGroup,
  ResourceIntroducer,
  ResourceIntroduction,
  ResourceIntroductionHistoryItem,
  ResourceUsage,
  User,
} from '@attraccess/database-entities';
import {
  IntroductionHistoryAction,
  ResourceIntroducerType,
  ResourceType,
  ResourceUsageAction,
  SupervisionMode,
} from '@attraccess/application-models';
import { TypeOrmResourceStore } from './resource-store.adapter';
import type { NewResource } from '../../../resources/resource-store.port';

describe('TypeOrmResourceStore on real PostgreSQL', () => {
  let source: DataSource;
  let store: TypeOrmResourceStore;

  const base = (name: string, overrides: Partial<NewResource> = {}): NewResource => ({
    name,
    description: `${name} description`,
    documentationType: null,
    documentationMarkdown: null,
    documentationUrl: null,
    allowTakeOver: false,
    maxParallelSessions: 1,
    type: ResourceType.Machine,
    separateUnlockAndUnlatch: false,
    metadata: null,
    retrainingMaxAgeDays: null,
    retrainingMaxInactivityDays: null,
    retrainingBlocksAccess: false,
    supervisionMode: SupervisionMode.INTRODUCTION_REQUIRED,
    supervisedUsagesUntilIntroduction: null,
    autoIntroductionTarget: null,
    autoIntroductionGroupId: null,
    ...overrides,
  });

  const newUser = async (username: string) => {
    const users = source.getRepository(User);
    return users.save(users.create({ username, email: `${username}@example.test` }));
  };

  beforeEach(async () => {
    source = await createTestDataSource();
    store = new TypeOrmResourceStore(source);
  });

  afterEach(async () => {
    await closeTestDataSource(source);
  });

  it('creates, saves, counts and deletes resources', async () => {
    const created = await store.create(base('Laser', { metadata: { room: 1 } }));
    expect(created).toMatchObject({ name: 'Laser', maxParallelSessions: 1, metadata: { room: 1 } });
    expect(await store.count()).toBe(1);

    const [detailed] = await store.findDetailed([created.id]);
    const saved = await store.save({ ...detailed, name: 'Laser 2', maxParallelSessions: 3, description: null });
    expect(saved).toMatchObject({ id: created.id, name: 'Laser 2', maxParallelSessions: 3, description: null });
    // The relations the caller loaded come back as given instead of being read again.
    expect(saved.groups).toBe(detailed.groups);
    expect(saved.usages).toBe(detailed.usages);
    expect(saved.introductions).toBe(detailed.introductions);
    expect(saved.createdAt).toEqual(detailed.createdAt);
    expect((await store.findDetailed([created.id]))[0]).toMatchObject({ name: 'Laser 2', maxParallelSessions: 3 });

    await store.setImageFilename(created.id, 'laser.png');
    expect((await store.findDetailed([created.id]))[0].imageFilename).toBe('laser.png');
    expect(await store.findCapacity(created.id)).toEqual({ type: ResourceType.Machine, maxParallelSessions: 3 });
    expect(await store.findCapacity(999)).toBeNull();

    expect(await store.softDelete(created.id)).toBe(1);
    expect(await store.count()).toBe(0);
    expect(await store.softDelete(999)).toBe(0);

    const other = await store.create(base('Mill'));
    await store.hardDelete(other.id);
    expect(await store.existingIds([other.id, created.id])).toEqual([]);
  });

  it('deletes the dashboard pins of a soft-deleted resource only', async () => {
    const [user] = await source.getRepository(User).save([{ username: 'pinner', email: 'pinner@example.com' } as User]);
    const laser = await store.create(base('Laser'));
    const mill = await store.create(base('Mill'));
    const pins = source.getRepository(DashboardPin);
    await pins.insert([
      { userId: user.id, itemType: 'resource', itemId: String(laser.id), position: 0 },
      { userId: user.id, itemType: 'resource', itemId: String(mill.id), position: 1 },
      { userId: user.id, itemType: 'page', itemId: '/projects', position: 2 },
    ]);

    expect(await store.softDelete(999)).toBe(0);
    expect(await pins.count()).toBe(3);

    expect(await store.softDelete(laser.id)).toBe(1);
    expect((await pins.find({ order: { position: 'ASC' } })).map(({ itemId }) => itemId)).toEqual([
      String(mill.id),
      '/projects',
    ]);
  });

  it('counts the flow parts of a resource and reports existing ids', async () => {
    const created = await store.create(base('Laser'));

    expect(await store.countFlowParts(created.id)).toEqual({ nodes: 0, edges: 0 });
    expect(await store.existingIds([created.id, 999])).toEqual([created.id]);
  });

  describe('list', () => {
    let wood: ResourceGroup;
    const page = (query: Partial<Parameters<TypeOrmResourceStore['list']>[0]> = {}) =>
      store.list({ page: 1, limit: 10, ...query });
    const names = async (query: Partial<Parameters<TypeOrmResourceStore['list']>[0]> = {}) =>
      (await page(query)).data.map((resource) => resource.name);

    beforeEach(async () => {
      const groups = source.getRepository(ResourceGroup);
      wood = await groups.save(groups.create({ name: 'Wood' }));
      const [saw, laser, printer] = [
        await store.create(base('Saw', { description: 'Cuts wood' })),
        await store.create(base('Laser', { description: 'Burns' })),
        await store.create(base('3D printer', { description: null })),
      ];
      const sawEntity = await source
        .getRepository(Resource)
        .findOneOrFail({ where: { id: saw.id }, relations: { groups: true } });
      sawEntity.groups = [wood];
      await source.getRepository(Resource).save(sawEntity);
      expect([laser.id, printer.id]).toHaveLength(2);
    });

    it('orders by name, pages and counts', async () => {
      expect(await names()).toEqual(['3D printer', 'Laser', 'Saw']);
      const second = await page({ page: 2, limit: 2 });
      expect(second.data.map((resource) => resource.name)).toEqual(['Saw']);
      expect(second.total).toBe(3);
    });

    it('filters by search term in name and description, ids, and group', async () => {
      expect(await names({ search: 'WOOD' })).toEqual(['Saw']);
      expect(await names({ search: 'las' })).toEqual(['Laser']);
      const ids = (await page()).data.map((resource) => resource.id);
      expect(await names({ ids: [ids[0], ids[1]] })).toEqual(['3D printer', 'Laser']);
      expect(await names({ ids: [] })).toHaveLength(3);
      expect(await names({ groupId: wood.id })).toEqual(['Saw']);
      expect(await names({ groupId: -1 })).toEqual(['3D printer', 'Laser']);
      expect((await page({ groupId: wood.id })).data[0].groups?.map((group) => group.name)).toEqual(['Wood']);
    });

    it('filters by running sessions and embeds the sessions with their users', async () => {
      const user = await newUser('alice');
      const laser = (await page({ search: 'Laser' })).data[0];
      const usages = source.getRepository(ResourceUsage);
      await usages.save(
        usages.create({
          usageAction: ResourceUsageAction.Usage,
          resourceId: laser.id,
          userId: user.id,
          startTime: new Date(),
          isFinalized: true,
        }),
      );

      expect(await names({ onlyInUse: true })).toEqual(['Laser']);
      expect(await names({ onlyInUseByUserId: user.id })).toEqual(['Laser']);
      expect(await names({ onlyInUseByUserId: user.id + 1 })).toEqual([]);

      const embedded = (await page({ onlyInUse: true, returnUsingUser: true })).data[0];
      expect(embedded.usages).toHaveLength(1);
      expect((embedded.usages?.[0] as unknown as { user: User }).user.username).toBe('alice');
      expect(await store.countActiveSessions(laser.id)).toBe(1);
      expect(await store.countActiveSessions(laser.id + 1)).toBe(0);
    });

    it('lists only resources a user may use: introducer, group introducer or a granted introduction', async () => {
      const [direct, viaGroup, introduced, revoked, stranger] = await Promise.all(
        ['direct', 'group', 'introduced', 'revoked', 'stranger'].map(newUser),
      );
      const [laser, printer, saw] = await Promise.all(
        ['Laser', '3D printer', 'Saw'].map(async (name) => (await page({ search: name })).data[0]),
      );
      const introducers = source.getRepository(ResourceIntroducer);
      await introducers.save(
        introducers.create({ resourceId: laser.id, userId: direct.id, type: ResourceIntroducerType.INTRODUCER }),
      );
      await introducers.save(
        introducers.create({ resourceGroupId: wood.id, userId: viaGroup.id, type: ResourceIntroducerType.MAINTAINER }),
      );
      const introductions = source.getRepository(ResourceIntroduction);
      const history = source.getRepository(ResourceIntroductionHistoryItem);
      for (const [receiver, actions] of [
        [introduced, [IntroductionHistoryAction.GRANT]],
        [revoked, [IntroductionHistoryAction.GRANT, IntroductionHistoryAction.REVOKE]],
      ] as const) {
        const introduction = await introductions.save(
          introductions.create({ resource: { id: printer.id }, receiverUser: { id: receiver.id } }),
        );
        for (const [index, action] of actions.entries()) {
          await history.save(
            history.create({
              introduction: { id: introduction.id },
              action,
              performedByUser: { id: receiver.id },
              createdAt: new Date(2030, 0, 1 + index),
            }),
          );
        }
      }

      expect(await names({ onlyWithPermissionForUserId: direct.id })).toEqual(['Laser']);
      expect(await names({ onlyWithPermissionForUserId: viaGroup.id })).toEqual(['Saw']);
      expect(await names({ onlyWithPermissionForUserId: introduced.id })).toEqual(['3D printer']);
      expect(await names({ onlyWithPermissionForUserId: revoked.id })).toEqual([]);
      expect(await names({ onlyWithPermissionForUserId: stranger.id })).toEqual([]);
      expect(saw.name).toBe('Saw');
    });
  });
});
