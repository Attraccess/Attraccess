import { ResourceUsage } from '@attraccess/database-entities';
import { SystemEvent } from '@attraccess/plugins-backend-sdk';
import {
  closeLifecycleFixture,
  resetTestFixture,
} from '../../../database/adapters/usage/lifecycle-fixtures/setup.test-fixture';
import { createUsageLifecyclePersistenceAroundExternalFlowsFixture } from '../../../database/adapters/usage/lifecycle-fixtures/state.test-fixture';

/** Plugin SystemEvents for session start, takeover and end, driven through the real lifecycle. */
describe('Plugin session SystemEvents', () => {
  const scope = createUsageLifecyclePersistenceAroundExternalFlowsFixture();
  const emitted = (event: SystemEvent) =>
    scope.pluginEvents.emit.mock.calls.filter(([name]) => name === event).map(([, payload]) => payload);

  beforeEach(async () => {
    await resetTestFixture(scope);
  });

  afterEach(async () => {
    await closeLifecycleFixture(scope);
  });

  it('emits RESOURCE_USAGE_SESSION_STARTED with ids after a committed start', async () => {
    const session = await scope.usage.startSession(1, scope.users[0], {});

    expect(emitted(SystemEvent.RESOURCE_USAGE_SESSION_STARTED)).toEqual([
      {
        resourceId: 1,
        usageId: session.id,
        userId: scope.users[0].id,
        startTime: session.startTime,
        supervisorUserId: null,
      },
    ]);
    expect(emitted(SystemEvent.RESOURCE_USAGE_SESSION_TAKEN_OVER)).toEqual([]);
    expect(emitted(SystemEvent.RESOURCE_USAGE_SESSION_ENDED)).toEqual([]);
  });

  it('emits RESOURCE_USAGE_SESSION_TAKEN_OVER for the new user and ENDED for the replaced session', async () => {
    const previous = await scope.seedActiveSession();

    const session = await scope.usage.startSession(1, scope.users[1], { forceTakeOver: true });

    expect(emitted(SystemEvent.RESOURCE_USAGE_SESSION_TAKEN_OVER)).toEqual([
      {
        resourceId: 1,
        usageId: session.id,
        userId: scope.users[1].id,
        startTime: session.startTime,
        previousUsageId: previous.id,
        previousUserId: previous.userId,
      },
    ]);
    expect(emitted(SystemEvent.RESOURCE_USAGE_SESSION_ENDED)).toEqual([
      expect.objectContaining({ usageId: previous.id, userId: previous.userId, reason: 'taken_over' }),
    ]);
    expect(emitted(SystemEvent.RESOURCE_USAGE_SESSION_STARTED)).toEqual([]);
  });

  it('emits RESOURCE_USAGE_SESSION_ENDED with the end time when a session ends', async () => {
    const seeded = await scope.seedActiveSession();

    await scope.usage.endSession(1, scope.users[0], {});

    const ended = await scope.source.getRepository(ResourceUsage).findOneByOrFail({ id: seeded.id });
    expect(emitted(SystemEvent.RESOURCE_USAGE_SESSION_ENDED)).toEqual([
      {
        resourceId: 1,
        usageId: seeded.id,
        userId: seeded.userId,
        startTime: ended.startTime,
        endTime: ended.endTime,
        reason: 'ended',
      },
    ]);
  });
});
