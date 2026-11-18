import { DataSource } from 'typeorm';
import { entities, Resource, User } from '@attraccess/database-entities';
import { IntroductionHistoryAction, ResourceIntroducerType, ResourceType } from '@attraccess/application-models';
import { TypeOrmResourceGroupIntroducerStore, TypeOrmResourceGroupStore } from './resource-group-store.adapter';
import { TypeOrmResourceIntroductionStore } from './resource-introduction-store.adapter';
import { legacyEngineTransactionScope } from '../common/legacy-engine-transaction';

describe('resource group stores on real SQLite', () => {
  let source: DataSource;
  let groups: TypeOrmResourceGroupStore;
  let introducers: TypeOrmResourceGroupIntroducerStore;
  let resourceId: number;
  let userId: number;

  const newGroup = (name: string, isHidden = false) =>
    groups.create({
      name,
      description: null,
      retrainingMaxAgeDays: null,
      retrainingMaxInactivityDays: null,
      retrainingBlocksAccess: false,
      isHidden,
    });

  beforeEach(async () => {
    source = await new DataSource({
      type: 'better-sqlite3',
      invalidWhereValuesBehavior: { null: 'ignore', undefined: 'ignore' },
      database: ':memory:',
      synchronize: true,
      entities: Object.values(entities),
    }).initialize();
    groups = new TypeOrmResourceGroupStore(source);
    introducers = new TypeOrmResourceGroupIntroducerStore(source);
    const resources = source.getRepository(Resource);
    resourceId = (await resources.save(resources.create({ name: 'Laser', type: ResourceType.Machine }))).id;
    const users = source.getRepository(User);
    userId = (await users.save(users.create({ username: 'alice', email: 'alice@example.test' }))).id;
  });

  afterEach(async () => {
    await source.destroy();
  });

  it('creates, updates and deletes groups', async () => {
    const group = await newGroup('Wood');
    expect(group).toMatchObject({ name: 'Wood', isHidden: false, retrainingBlocksAccess: false });

    const updated = await groups.update(group.id, {
      name: 'Metal',
      description: 'Hot',
      retrainingMaxAgeDays: 30,
      retrainingMaxInactivityDays: null,
      retrainingBlocksAccess: true,
      isHidden: true,
    });
    expect(updated).toMatchObject({ name: 'Metal', retrainingMaxAgeDays: 30, isHidden: true });
    expect(await groups.findById(group.id)).toMatchObject({ name: 'Metal' });
    expect(await groups.findById(group.id)).not.toHaveProperty('resources');

    expect(await groups.delete(group.id)).toBe(1);
    expect(await groups.delete(group.id)).toBe(0);
    expect(await groups.findById(group.id)).toBeNull();
  });

  it('adds and removes group members and finds the groups of a resource', async () => {
    const group = await newGroup('Wood');
    expect(await groups.resourceExists(resourceId)).toBe(true);
    expect(await groups.resourceExists(999)).toBe(false);

    await groups.addResource(group.id, resourceId);
    expect((await groups.findById(group.id, true))?.resources).toEqual([{ id: resourceId }]);
    expect((await groups.groupsOfResource(resourceId)).map((item) => item.id)).toEqual([group.id]);
    await source.transaction(async (manager) => {
      expect(await groups.groupsOfResource(resourceId, legacyEngineTransactionScope(manager))).toHaveLength(1);
    });

    await groups.removeResource(group.id, resourceId);
    expect((await groups.findById(group.id, true))?.resources).toEqual([]);
    expect(await groups.groupsOfResource(resourceId)).toEqual([]);
  });

  it('shows hidden groups only to members: an introducer grant or a granted introduction', async () => {
    const visible = await newGroup('Open');
    const hidden = await newGroup('Secret', true);
    const visibility = { userId, canUpdateResources: false };

    expect((await groups.listVisible(visibility)).map((item) => item.id)).toEqual([visible.id]);
    expect((await groups.listVisible({ userId, canUpdateResources: true })).map((item) => item.id)).toEqual([
      visible.id,
      hidden.id,
    ]);
    expect(await groups.userIsPartOfGroup(hidden.id, userId)).toBe(false);

    await introducers.insert(hidden.id, userId, ResourceIntroducerType.MAINTAINER);
    expect(await groups.userIsPartOfGroup(hidden.id, userId)).toBe(true);
    expect((await groups.listVisible(visibility)).map((item) => item.id).sort()).toEqual(
      [visible.id, hidden.id].sort(),
    );
  });

  it('counts a granted introduction as membership and a later revoke as none', async () => {
    const hidden = await newGroup('Secret', true);
    const introductions = new TypeOrmResourceIntroductionStore(source);
    const introduction = await introductions.createForGroup(hidden.id, userId);
    await introductions.addHistoryItem(introduction.id, IntroductionHistoryAction.GRANT, undefined, userId);
    expect(await groups.userIsPartOfGroup(hidden.id, userId)).toBe(true);
    expect(await introductions.findOfGroupUser(hidden.id, userId)).toMatchObject({ id: introduction.id });
    expect((await introductions.listForGroup(hidden.id))[0].history).toHaveLength(1);

    await introductions.addHistoryItem(introduction.id, IntroductionHistoryAction.REVOKE, undefined, userId);
    expect(await groups.userIsPartOfGroup(hidden.id, userId)).toBe(false);
    expect(await introductions.historyOfGroupUser(hidden.id, userId)).toHaveLength(2);
  });

  it('keeps one grant per introducer role and lists them with their users', async () => {
    const group = await newGroup('Wood');
    const grant = await introducers.insert(group.id, userId, ResourceIntroducerType.INTRODUCER);

    expect(await introducers.find(group.id, userId, ResourceIntroducerType.INTRODUCER)).toMatchObject({ id: grant.id });
    expect(await introducers.find(group.id, userId, ResourceIntroducerType.MAINTAINER)).toBeNull();
    const [listed] = await introducers.list(group.id);
    expect(listed.user?.username).toBe('alice');
    expect(JSON.stringify(listed)).not.toContain('example.test');

    await introducers.remove(grant.id);
    expect(await introducers.list(group.id)).toEqual([]);
  });
});
