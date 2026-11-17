import { DataSource } from 'typeorm';
import { entities, Resource, ResourceGroup, User } from '@attraccess/database-entities';
import { IntroductionHistoryAction, ResourceType } from '@attraccess/application-models';
import { TypeOrmResourceIntroductionStore } from './resource-introduction-store.adapter';
import { TypeOrmMassIntroductionTargetStore, TypeOrmRetrainingStore } from './retraining-store.adapter';
import { legacyEngineTransactionScope } from '../common/legacy-engine-transaction';

describe('introduction stores on real SQLite', () => {
  let source: DataSource;
  let store: TypeOrmResourceIntroductionStore;
  let resourceId: number;
  let userId: number;
  let tutorId: number;

  beforeEach(async () => {
    source = await new DataSource({
      type: 'sqlite',
      database: ':memory:',
      synchronize: true,
      entities: Object.values(entities),
    }).initialize();
    store = new TypeOrmResourceIntroductionStore(source);
    const resources = source.getRepository(Resource);
    resourceId = (
      await resources.save(resources.create({ name: 'Laser', type: ResourceType.Machine, retrainingMaxAgeDays: 30 }))
    ).id;
    const users = source.getRepository(User);
    userId = (await users.save(users.create({ username: 'alice', email: 'alice@example.test' }))).id;
    tutorId = (await users.save(users.create({ username: 'tutor', email: 'tutor@example.test' }))).id;
  });

  afterEach(async () => {
    await source.destroy();
  });

  it('creates an introduction with a tutor, tracks history newest first and answers from a transaction', async () => {
    const created = await store.create(resourceId, userId, tutorId);
    expect(created).toMatchObject({ resourceId, receiverUserId: userId, tutorUserId: tutorId, resourceGroupId: null });

    const grant = await store.addHistoryItem(created.id, IntroductionHistoryAction.GRANT, 'Welcome', tutorId);
    const revoke = await store.addHistoryItem(created.id, IntroductionHistoryAction.REVOKE, undefined, tutorId);

    expect(grant).toMatchObject({ introductionId: created.id, comment: 'Welcome', performedByUserId: tutorId });
    expect(revoke.comment).toBeNull();
    expect((await store.lastHistoryItem(created.id))?.id).toBe(revoke.id);
    expect((await store.latestGrant(created.id))?.id).toBe(grant.id);
    expect(await store.findOfUser(resourceId, userId)).toMatchObject({ id: created.id });
    expect(await store.findOfUser(resourceId, tutorId)).toBeNull();
    expect((await store.historyOfUser(resourceId, userId)).map((item) => item.action).sort()).toEqual([
      IntroductionHistoryAction.GRANT,
      IntroductionHistoryAction.REVOKE,
    ]);

    await expect(
      source.transaction(async (manager) => {
        // A read with the caller's transaction sees the state of that connection.
        expect((await store.lastHistoryItem(created.id, legacyEngineTransactionScope(manager)))?.action).toBe(
          IntroductionHistoryAction.REVOKE,
        );
        throw new Error('roll back');
      }),
    ).rejects.toThrow('roll back');
  });

  it('lists introductions with people and history, changes the tutor and tracks retraining markers', async () => {
    const created = await store.create(resourceId, userId);
    await store.addHistoryItem(created.id, IntroductionHistoryAction.GRANT, undefined, userId);
    await store.setTutor(created.id, tutorId);

    const [listed] = await store.listForResource(resourceId, false);
    expect(listed.tutorUser?.username).toBe('tutor');
    expect(listed.receiverUser?.username).toBe('alice');
    expect(listed.history).toHaveLength(1);
    expect(JSON.stringify(listed)).not.toContain('example.test');

    const at = new Date('2030-01-01T00:00:00Z');
    await store.markRetrainingRequiredAudited(created.id, at);
    await store.markRetrainingNotified(created.id, at);
    expect(await store.findById(created.id)).toMatchObject({
      retrainingRequiredAuditedAt: at,
      retrainingNotifiedAt: at,
    });

    const due = await store.listWithRetrainingRule();
    expect(due.map((item) => item.id)).toEqual([created.id]);
    expect(due[0].receiver).toEqual({ id: userId, username: 'alice', email: 'alice@example.test', locale: 'en' });
  });

  it('reads retraining targets, last use and the targets of a mass introduction', async () => {
    const groups = source.getRepository(ResourceGroup);
    const group = await groups.save(groups.create({ name: 'Wood shop' }));
    const resource = await source
      .getRepository(Resource)
      .findOneOrFail({ where: { id: resourceId }, relations: ['groups'] });
    resource.groups = [group];
    await source.getRepository(Resource).save(resource);
    const retraining = new TypeOrmRetrainingStore(source);
    const targets = new TypeOrmMassIntroductionTargetStore(source);

    expect(await retraining.findResourceTarget(resourceId)).toMatchObject({ name: 'Laser', retrainingMaxAgeDays: 30 });
    expect(await retraining.findGroupTarget(group.id)).toMatchObject({ name: 'Wood shop', retrainingMaxAgeDays: null });
    expect(await retraining.findResourceTarget(999)).toBeNull();
    expect(await retraining.lastResourceUseAt(resourceId, userId)).toBeNull();
    expect(await retraining.lastGroupUseAt(group.id, userId)).toBeNull();
    expect(await targets.resourceIdsOfGroup(group.id)).toEqual([resourceId]);
    expect(await targets.findResourceName(resourceId)).toEqual({ id: resourceId, name: 'Laser' });
    expect(await targets.findGroupName(999)).toBeNull();
  });
});
