import { findRelations } from '../find-options';
import { BillingTransaction, FormSubmission, Resource, ResourceUsage, User } from '@attraccess/database-entities';
import {
  BillingTransactionStatus,
  ResourceFormAction,
  ResourceType,
  ResourceUsageAction,
  SupervisionMode,
} from '@attraccess/application-models';
import type { UsageSession } from '@attraccess/application-models';
import { instanceToPlain } from 'class-transformer';
import type { DataSource } from 'typeorm';
import { toUsageSessionResponse } from '../../../resources/usage/dtos/usage-session-response';
import { createMigratedUsageDatabase, insertProject, insertRow, userRow } from './migrated-usage-database.test-fixture';
import { ACTIVE_RELATIONS, DETAIL_RELATIONS, type TypeOrmUsageSessionStore } from './typeorm-usage-session.store';

jest.setTimeout(30_000);

/** What the client received before sessions were mapped: the entity through the global ClassSerializerInterceptor. */
const entityJson = (row: unknown) => JSON.parse(JSON.stringify(instanceToPlain(row)));
const responseJson = (session: UsageSession) => JSON.parse(JSON.stringify(toUsageSessionResponse(session)));

/** Values of the private user columns the seed sets; none of them may appear in a response. */
const PRIVATE_VALUES = ['@example.test', 'reset-token', 'verify-token', 'delete-token', 'nfc-seed-token'];
const PRIVATE_KEYS = [
  'email',
  'passwordResetToken',
  'emailVerificationToken',
  'deleteAccountToken',
  'nfcKeySeedToken',
  'failedLoginAttempts',
  'lockedUntil',
];

function expectNoPrivateUserData(json: unknown): void {
  const text = JSON.stringify(json);
  for (const value of PRIVATE_VALUES) expect(text).not.toContain(value);
  for (const key of PRIVATE_KEYS) expect(text).not.toContain(`"${key}"`);
}

/**
 * The store maps sessions and their relations field by field instead of handing out ORM entities. These specs pin
 * that the response a client gets is the same JSON the entity produced through class-transformer, and that the
 * session user's mail address (which the mapped session keeps for flows and notifications) never reaches it.
 */
describe('usage session mapping against the migrated schema', () => {
  let database: Awaited<ReturnType<typeof createMigratedUsageDatabase>>;
  let source: DataSource;
  let store: TypeOrmUsageSessionStore;
  const at = (minute: number) => new Date(Date.UTC(2026, 7, 28, 10, minute));

  beforeEach(async () => {
    database = await createMigratedUsageDatabase('attraccess-usage-mapping-');
    ({ source, store } = await database.connect());
    await source.getRepository(Resource).save({
      id: 1,
      name: 'Printer',
      type: ResourceType.Machine,
      description: 'Prints',
      supervisionMode: SupervisionMode.INTRODUCTION_REQUIRED,
      metadata: { room: 'A' },
    });
    const secrets = {
      passwordResetToken: 'reset-token',
      emailVerificationToken: 'verify-token',
      deleteAccountToken: 'delete-token',
      nfcKeySeedToken: 'nfc-seed-token',
    };
    await source.getRepository(User).save([1, 2, 3].map((id) => userRow(id, secrets)));
    await insertProject(source, { id: 9, name: 'Thesis', ownerId: 1 });
    await source.getRepository(ResourceUsage).save([
      {
        id: 1,
        resourceId: 1,
        userId: 1,
        supervisorUserId: 3,
        projectId: 9,
        usageAction: ResourceUsageAction.Usage,
        startTime: at(0),
        endTime: at(30),
        startNotes: 'first',
        endNotes: 'done',
        isFinalized: true,
        lifecyclePending: false,
        meterRates: [{ meterId: 1, name: 'Energy', creditsPerUnit: 4 }],
      },
      {
        id: 2,
        resourceId: 1,
        userId: 2,
        usageAction: ResourceUsageAction.Usage,
        startTime: at(40),
        endTime: null,
        isFinalized: true,
        lifecyclePending: false,
      },
    ] as ResourceUsage[]);
    await source.getRepository(BillingTransaction).save({
      userId: 2,
      resourceUsageId: 2,
      amount: 0,
      status: BillingTransactionStatus.Pending,
    });
    await insertRow(source, 'form', { id: 11, name: 'Checklist', resourceId: 1 });
    await source.getRepository(FormSubmission).save({
      formId: 11,
      userId: 2,
      resourceUsageId: 1,
      action: ResourceFormAction.END,
      data: { '5': { value: 'ok', fieldDefinition: { id: 5, name: 'Clean?' } } },
    } as unknown as FormSubmission);
  });

  afterEach(async () => {
    await database.close();
  });

  const entityRows = (ids: number[], relations: string[]) =>
    source
      .getRepository(ResourceUsage)
      .find({ where: ids.map((id) => ({ id })), relations: findRelations(relations), order: { id: 'ASC' } });

  it('answers running sessions with the JSON of their entities, without the users mail address or tokens', async () => {
    const sessions = await store.findActiveSessions(1);
    const responses = sessions.map(responseJson);

    expect(responses).toEqual((await entityRows([2], ACTIVE_RELATIONS)).map(entityJson));
    expect(responses[0].billingTransaction).toMatchObject({ resourceUsageId: 2 });
    expectNoPrivateUserData(responses);
    // The mapped session itself keeps the address for flows and notifications.
    expect(sessions[0].user?.email).toBe('user-2@example.test');
  });

  it('answers session details and history with the JSON of their entities', async () => {
    const [entity] = await entityRows([1], DETAIL_RELATIONS);
    const details = responseJson((await store.findPublishedSession(1, 1)) as UsageSession);
    const history = (await store.findHistory(1, 1, 10)).data.map(responseJson);

    expect(details).toEqual(entityJson(entity));
    expect(details.formSubmissions[0]).toMatchObject({ form: { name: 'Checklist' }, user: { username: 'user-2' } });
    expect(details.supervisorUser).toMatchObject({ id: 3, username: 'user-3' });
    expect(history).toEqual((await entityRows([2, 1], DETAIL_RELATIONS)).reverse().map(entityJson));
    expectNoPrivateUserData([details, history]);
  });

  it('answers the started, ended and project-changed shapes with the JSON of their entities', async () => {
    const started = await store.findSessionWithRelations(1, 'started');
    const ended = await store.findSessionWithRelations(2, 'ended');
    expect(responseJson(started)).toEqual(entityJson((await entityRows([1], ['resource', 'user', 'project']))[0]));
    expect(responseJson(ended)).toEqual(entityJson((await entityRows([2], ['user', 'resource']))[0]));

    const moved = await store.assignProject(1, null);
    expect(responseJson(moved)).toMatchObject({ id: 1, projectId: null, project: null });
    expect(responseJson(moved)).toEqual(entityJson((await entityRows([1], ['resource', 'user', 'project']))[0]));
    expectNoPrivateUserData([responseJson(started), responseJson(ended), responseJson(moved)]);
  });

  it('keeps a deleted user as null and a relation that was not read absent', async () => {
    await source.query('UPDATE resource_usage SET "userId" = NULL WHERE id = 2');
    const [running] = await store.findActiveSessions(1);
    const [entity] = await entityRows([2], ACTIVE_RELATIONS);

    expect(responseJson(running)).toEqual(entityJson(entity));
    expect(responseJson(running)).toMatchObject({ userId: null, user: null, project: null, supervisorUser: null });
    expect(responseJson(running)).not.toHaveProperty('formSubmissions');
  });

  it('answers a door action with the JSON of its entity', async () => {
    await source.getRepository(Resource).save({
      id: 3,
      name: 'Door',
      type: ResourceType.Door,
      supervisionMode: SupervisionMode.INTRODUCTION_REQUIRED,
    });
    const action = await store.recordDoorAction({ resourceId: 3, userId: 1, action: ResourceUsageAction.DoorUnlock });

    expect(responseJson(action)).toEqual(entityJson((await entityRows([action.id], ['user', 'resource']))[0]));
    expectNoPrivateUserData(responseJson(action));
  });
});
