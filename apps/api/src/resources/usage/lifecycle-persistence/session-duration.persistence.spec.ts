import { Resource, ResourceUsage, User } from '@attraccess/database-entities';
import { ForbiddenException } from '@nestjs/common';
import { SYSTEM_AUDIT_ACTOR } from '../../../audit/recorder/audit-event';
import {
  closeLifecycleFixture,
  resetTestFixture,
} from '../../../database/adapters/usage/lifecycle-fixtures/setup.test-fixture';
import { createUsageLifecyclePersistenceAroundExternalFlowsFixture } from '../../../database/adapters/usage/lifecycle-fixtures/state.test-fixture';
import { usagePersistenceFor } from '../../../database/adapters/usage/usage-persistence.test-fixture';
import { ResourceUsageSessionExtendedEvent } from '../events/resource-usage.events';
import { SessionAutoEndService } from '../session-duration/session-auto-end.service';
import { SessionDurationErrorCode } from '../session-duration/session-duration.errors';
import { addMinutes } from '../session-duration/session-duration.rules';
import { usageInternals } from '../sessions/fixtures/compose.test-fixture';

jest.setTimeout(30_000);

const MIN = 60_000;

describe('Maximum session time and duration estimates (persistence)', () => {
  const scope = createUsageLifecyclePersistenceAroundExternalFlowsFixture();
  const setResource = (settings: Partial<Resource>) => scope.source.getRepository(Resource).update(1, settings);
  const sessions = () => scope.source.getRepository(ResourceUsage);
  const audit = () => Reflect.get(usageInternals(scope.usage).ends, 'audit') as { record: jest.Mock };
  const auditActions = () => audit().record.mock.calls.map(([event]) => event.action);
  const code = async (promise: Promise<unknown>) => {
    try {
      await promise;
    } catch (error) {
      return (error as { getResponse(): { code?: string } }).getResponse().code;
    }
    return undefined;
  };
  /** The service of the scope with the deadline store of its database and a stand-in for notifications. */
  const autoEnd = () => {
    const notifications = {
      dispatch: jest.fn().mockResolvedValue(undefined),
      sendEmailTemplate: jest.fn().mockResolvedValue(undefined),
    };
    const { deadlines } = usagePersistenceFor({ usage: scope.source.getRepository(ResourceUsage) });
    return { service: new SessionAutoEndService(scope.usage, notifications as never, deadlines), notifications };
  };
  const moveDeadline = (usageId: number, autoEndAt: Date) => sessions().update(usageId, { autoEndAt });

  beforeEach(async () => {
    await resetTestFixture(scope);
    scope.flow.runFlow.mockResolvedValue([]);
  });
  afterEach(async () => {
    await closeLifecycleFixture(scope);
    jest.restoreAllMocks();
  });

  describe('the deadline of a start', () => {
    it('is fixed at the start and unchanged by later settings', async () => {
      await setResource({ maxSessionDurationMinutes: 120 });
      const started = await scope.usage.startSession(1, scope.users[0], {});
      expect(started.autoEndAt?.getTime()).toBe(addMinutes(started.startTime, 120).getTime());
      expect(started.maxAutoEndAt).toEqual(started.autoEndAt);

      await setResource({ maxSessionDurationMinutes: 10, requireSessionDurationEstimate: true });
      const stored = await sessions().findOneByOrFail({ id: started.id });
      expect(stored.autoEndAt).toEqual(started.autoEndAt);
    });

    it('is empty without any setting, like before', async () => {
      const started = await scope.usage.startSession(1, scope.users[0], {});
      expect(started).toMatchObject({ autoEndAt: null, maxAutoEndAt: null, estimatedDurationMinutes: null });
    });

    it('refuses a web start without the required estimate, then stores the given one', async () => {
      await setResource({ requireSessionDurationEstimate: true, maxSessionDurationMinutes: 240 });
      const user = scope.users[0];
      expect(await code(scope.usage.startSession(1, user, {}, { canAskDuration: true }))).toBe(
        SessionDurationErrorCode.ESTIMATE_REQUIRED,
      );
      expect(
        await code(scope.usage.startSession(1, user, { estimatedDurationMinutes: 241 }, { canAskDuration: true })),
      ).toBe(SessionDurationErrorCode.ESTIMATE_EXCEEDS_MAXIMUM);
      expect(await sessions().count()).toBe(0);

      const started = await scope.usage.startSession(
        1,
        user,
        { estimatedDurationMinutes: 45 },
        { canAskDuration: true },
      );
      expect(started).toMatchObject({ estimatedDurationMinutes: 45 });
      expect(started.autoEndAt?.getTime()).toBe(addMinutes(started.startTime, 45).getTime());
      expect(started.maxAutoEndAt?.getTime()).toBe(addMinutes(started.startTime, 240).getTime());
    });

    it('never refuses a reader that cannot ask: it gets the maximum, or the default estimate', async () => {
      await setResource({ requireSessionDurationEstimate: true, maxSessionDurationMinutes: 90 });
      const first = await scope.usage.startSession(1, scope.users[0], {});
      expect(first.autoEndAt?.getTime()).toBe(addMinutes(first.startTime, 90).getTime());
      await scope.usage.endSession(1, scope.users[0], {}, { skipFormSubmissions: true });

      await setResource({ maxSessionDurationMinutes: null, defaultSessionDurationEstimateMinutes: 30 });
      const second = await scope.usage.startSession(1, scope.users[0], {});
      expect(second.autoEndAt?.getTime()).toBe(addMinutes(second.startTime, 30).getTime());
    });

    it('gives a takeover its own fresh deadline and requires the new estimate', async () => {
      await setResource({ requireSessionDurationEstimate: true });
      const first = await scope.usage.startSession(
        1,
        scope.users[0],
        { estimatedDurationMinutes: 600 },
        { canAskDuration: true },
      );
      expect(
        await code(scope.usage.startSession(1, scope.users[1], { forceTakeOver: true }, { canAskDuration: true })),
      ).toBe(SessionDurationErrorCode.ESTIMATE_REQUIRED);
      const taken = await scope.usage.startSession(
        1,
        scope.users[1],
        { forceTakeOver: true, estimatedDurationMinutes: 30 },
        { canAskDuration: true },
      );
      expect(taken.id).not.toBe(first.id);
      expect(taken.autoEndAt?.getTime()).toBe(addMinutes(taken.startTime, 30).getTime());
    });

    it('records the deadline in the audit entry of the start', async () => {
      await setResource({ maxSessionDurationMinutes: 60 });
      await scope.usage.startSession(1, scope.users[0], {});
      const started = audit().record.mock.calls.find(([event]) => event.action === 'usage_session.started')?.[0];
      expect(started.details).toMatchObject({ autoEndAt: expect.any(String) });
    });
  });

  describe('extending', () => {
    const startWithEstimate = async (estimate = 60, max: number | null = 240) => {
      await setResource({ requireSessionDurationEstimate: true, maxSessionDurationMinutes: max });
      return scope.usage.startSession(
        1,
        scope.users[0],
        { estimatedDurationMinutes: estimate },
        { canAskDuration: true },
      );
    };

    it('moves the deadline, writes an audit entry, announces it and re-arms the warnings', async () => {
      const started = await startWithEstimate(10);
      expect((await sessions().findOneByOrFail({ id: started.id })).autoEndWarnedOffsetMinutes).toBe(15);
      const emitted = jest.spyOn(scope.events, 'emit');

      const extended = await scope.usage.extendSession(1, scope.users[0], { extendByMinutes: 120 });

      expect(extended.autoEndAt?.getTime()).toBe(addMinutes(started.startTime, 130).getTime());
      const stored = await sessions().findOneByOrFail({ id: started.id });
      expect(stored.autoEndAt?.getTime()).toBe(addMinutes(started.startTime, 130).getTime());
      expect(stored.autoEndWarnedOffsetMinutes).toBeNull();
      expect(auditActions()).toContain('usage_session.extended');
      expect(emitted).toHaveBeenCalledWith(ResourceUsageSessionExtendedEvent.EVENT_NAME, expect.anything());
    });

    it('refuses what would pass the maximum and extends to it exactly on request', async () => {
      const started = await startWithEstimate(60, 180);
      expect(await code(scope.usage.extendSession(1, scope.users[0], { extendByMinutes: 240 }))).toBe(
        SessionDurationErrorCode.EXTENSION_EXCEEDS_MAXIMUM,
      );
      expect((await sessions().findOneByOrFail({ id: started.id })).autoEndAt?.getTime()).toBe(
        addMinutes(started.startTime, 60).getTime(),
      );
      const extended = await scope.usage.extendSession(1, scope.users[0], { toMax: true });
      expect(extended.autoEndAt?.getTime()).toBe(addMinutes(started.startTime, 180).getTime());
      expect(await code(scope.usage.extendSession(1, scope.users[0], { extendByMinutes: 60 }))).toBe(
        SessionDurationErrorCode.EXTENSION_EXCEEDS_MAXIMUM,
      );
    });

    it('is not possible for a session that is already at its maximum or has no deadline', async () => {
      await setResource({ maxSessionDurationMinutes: 60 });
      await scope.usage.startSession(1, scope.users[0], {});
      expect(await code(scope.usage.extendSession(1, scope.users[0], { extendByMinutes: 60 }))).toBe(
        SessionDurationErrorCode.EXTENSION_EXCEEDS_MAXIMUM,
      );
      await scope.usage.endSession(1, scope.users[0], {}, { skipFormSubmissions: true });
      await setResource({ maxSessionDurationMinutes: null });
      await scope.usage.startSession(1, scope.users[0], {});
      expect(await code(scope.usage.extendSession(1, scope.users[0], { extendByMinutes: 60 }))).toBe(
        SessionDurationErrorCode.EXTENSION_NOT_POSSIBLE,
      );
    });

    it('is allowed to somebody who may end the session and refused to everybody else', async () => {
      await startWithEstimate();
      const stranger = { ...scope.users[1], effectivePermissions: new Set<string>() } as User;
      await expect(scope.usage.extendSession(1, stranger, { extendByMinutes: 60 })).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      const manager = scope.users[1]; // holds resources.update
      const usageId = (await sessions().findOneByOrFail({ userId: scope.users[0].id })).id;
      const extended = await scope.usage.extendSession(1, manager, { usageId, extendByMinutes: 60 });
      expect(extended.userId).toBe(scope.users[0].id);
    });
  });

  describe('the automatic end', () => {
    const startOverdue = async (minutesOver = 1) => {
      await setResource({ maxSessionDurationMinutes: 60 });
      const started = await scope.usage.startSession(1, scope.users[0], {});
      // As if the whole time had passed: the cap moves with the deadline.
      const past = new Date(Date.now() - minutesOver * MIN);
      await sessions().update(started.id, { autoEndAt: past, maxAutoEndAt: past });
      return started;
    };

    it('ends an overdue session as the system through the normal end path', async () => {
      const started = await startOverdue();
      const { service } = autoEnd();
      scope.flow.runFlow.mockClear();

      expect(await service.endOverdueSessions(new Date())).toBe(1);

      const stored = await sessions().findOneByOrFail({ id: started.id });
      expect(stored.endTime).not.toBeNull();
      expect(stored.endNotes).toBe('Automatically ended: maximum session time reached');
      expect(scope.flow.runFlow).toHaveBeenCalled();
      const ended = audit().record.mock.calls.find(([event]) => event.action === 'usage_session.ended')?.[0];
      expect(ended.actor).toEqual(SYSTEM_AUDIT_ACTOR);
      expect(ended.details).toMatchObject({ endReason: 'auto_maximum', usageId: started.id });
    });

    it('names the estimate when that is what elapsed', async () => {
      await setResource({ requireSessionDurationEstimate: true, maxSessionDurationMinutes: 600 });
      const started = await scope.usage.startSession(
        1,
        scope.users[0],
        { estimatedDurationMinutes: 30 },
        { canAskDuration: true },
      );
      await moveDeadline(started.id, new Date(Date.now() - MIN));
      await autoEnd().service.endOverdueSessions(new Date());
      expect((await sessions().findOneByOrFail({ id: started.id })).endNotes).toBe(
        'Automatically ended: estimated duration elapsed',
      );
    });

    it('announces the end with its reason, for the notification to the owner', async () => {
      await startOverdue();
      const emitted = jest.spyOn(scope.events, 'emit');
      await autoEnd().service.endOverdueSessions(new Date());
      const event = emitted.mock.calls.find(([name]) => name === 'resource.usage.session_ended')?.[1] as {
        autoEndReason?: string;
        endedBy: unknown;
      };
      expect(event).toMatchObject({ autoEndReason: 'maximum', endedBy: null });
    });

    it('ends sessions that became overdue while the API was down, on its first run', async () => {
      const started = await startOverdue(600);
      expect(await autoEnd().service.endOverdueSessions(new Date())).toBe(1);
      expect((await sessions().findOneByOrFail({ id: started.id })).endTime).not.toBeNull();
    });

    it('leaves a session that is not due, and ends each overdue session once', async () => {
      await setResource({ maxSessionDurationMinutes: 60 });
      await scope.usage.startSession(1, scope.users[0], {});
      const { service } = autoEnd();
      expect(await service.endOverdueSessions(new Date())).toBe(0);

      const [running] = await sessions().find();
      await moveDeadline(running.id, new Date(Date.now() - MIN));
      expect(await service.endOverdueSessions(new Date())).toBe(1);
      expect(await service.endOverdueSessions(new Date())).toBe(0);
    });

    it('does not end a session that was extended after the job found it', async () => {
      const started = await startOverdue();
      await moveDeadline(started.id, new Date(Date.now() + 30 * MIN));
      expect(await scope.usage.endSessionAutomatically(1, started.id)).toBeNull();
      expect((await sessions().findOneByOrFail({ id: started.id })).endTime).toBeNull();
    });

    it('ends exactly once when a manual stop races it', async () => {
      const started = await startOverdue();
      const results = await Promise.allSettled([
        scope.usage.endSession(1, scope.users[0], {}, { skipFormSubmissions: true }),
        scope.usage.endSessionAutomatically(1, started.id),
      ]);
      const stored = await sessions().findOneByOrFail({ id: started.id });
      expect(stored.endTime).not.toBeNull();
      expect(auditActions().filter((action) => action === 'usage_session.ended')).toHaveLength(1);
      expect(results.filter((result) => result.status === 'fulfilled' && result.value)).toHaveLength(1);
    });

    it('does not end the other sessions of a shared machine', async () => {
      await setResource({ maxSessionDurationMinutes: 60, maxParallelSessions: 2 });
      const first = await scope.usage.startSession(1, scope.users[0], {});
      const second = await scope.usage.startSession(1, scope.users[1], {});
      await moveDeadline(first.id, new Date(Date.now() - MIN));
      await autoEnd().service.endOverdueSessions(new Date());
      expect((await sessions().findOneByOrFail({ id: first.id })).endTime).not.toBeNull();
      expect((await sessions().findOneByOrFail({ id: second.id })).endTime).toBeNull();
    });
  });

  describe('the warnings', () => {
    const startAt = async (minutes: number) => {
      await setResource({ maxSessionDurationMinutes: 600 });
      const started = await scope.usage.startSession(1, scope.users[0], {});
      await moveDeadline(started.id, new Date(Date.now() + minutes * MIN));
      await sessions().update(started.id, { autoEndWarnedOffsetMinutes: null });
      return started;
    };
    const sent = (notifications: { dispatch: jest.Mock }) => notifications.dispatch.mock.calls.length;

    it('warns 15 and 5 minutes before the end, once each', async () => {
      const started = await startAt(14);
      const { service, notifications } = autoEnd();
      await service.sendEndingSoonWarnings(new Date());
      await service.sendEndingSoonWarnings(new Date());
      expect(sent(notifications)).toBe(1);

      await sessions().update(started.id, { autoEndAt: new Date(Date.now() + 4 * MIN) });
      await service.sendEndingSoonWarnings(new Date());
      await service.sendEndingSoonWarnings(new Date());
      expect(sent(notifications)).toBe(2);
      expect(notifications.dispatch.mock.calls[0][0].category).toBe('resource_session_ending_soon');
    });

    it('sends only the smallest due warning after a late run, and nothing for a distant end', async () => {
      const started = await startAt(4);
      const { service, notifications } = autoEnd();
      await service.sendEndingSoonWarnings(new Date());
      expect(sent(notifications)).toBe(1);
      await service.sendEndingSoonWarnings(new Date());
      expect(sent(notifications)).toBe(1);
      await sessions().update(started.id, {
        autoEndAt: new Date(Date.now() + 60 * MIN),
        autoEndWarnedOffsetMinutes: null,
      });
      await service.sendEndingSoonWarnings(new Date());
      expect(sent(notifications)).toBe(1);
    });

    it('lets only one of several API instances send a warning', async () => {
      await startAt(10);
      const instances = [autoEnd(), autoEnd(), autoEnd()];
      await Promise.all(instances.map(({ service }) => service.sendEndingSoonWarnings(new Date())));
      expect(instances.reduce((total, { notifications }) => total + sent(notifications), 0)).toBe(1);
    });

    it('warns again for the new deadline after an extension', async () => {
      const started = await startAt(10);
      const { service, notifications } = autoEnd();
      await service.sendEndingSoonWarnings(new Date());
      expect(sent(notifications)).toBe(1);
      await scope.usage.extendSession(1, scope.users[0], { extendByMinutes: 60 });
      // The new deadline is far away: nothing yet; moving time to 5 minutes before it warns once more.
      await service.sendEndingSoonWarnings(new Date());
      expect(sent(notifications)).toBe(1);
      await sessions().update(started.id, { autoEndAt: new Date(Date.now() + 4 * MIN) });
      await service.sendEndingSoonWarnings(new Date());
      expect(sent(notifications)).toBe(2);
    });
  });
});
