import { ResourceFlowNodeType, ResourceType, ResourceUsageAction } from '@attraccess/application-models';
import type { UsageSessionUser } from '@attraccess/application-models';

import { BadRequestException } from '@nestjs/common';

import { ExternalEffectFailureError } from '../../flows/errors/external-effect-failure.error';

import { FlowExecutionError } from '../../flows/errors/flow-execution.error';

import {
  ResourceSessionStartedEvent,
  ResourceSupervisedUsageEndedEvent,
  ResourceUsageNoteAddedEvent,
  ResourceUsageSessionEndedEvent,
} from '../events/resource-usage.events';

import { arrangeIntroducedUser, InMemoryUsageScope, runningSession } from './fixtures/arrangements.test-fixture';

const emitted = (scope: InMemoryUsageScope, eventName: string) =>
  scope.events.emit.mock.calls.filter(([name]) => name === eventName).map(([, payload]) => payload);

describe('ResourceUsageService', () => {
  let scope: InMemoryUsageScope;
  let owner: UsageSessionUser;

  /** The machine (id 1, or `resourceId`) is being used by `owner` (id 1). */
  const arrange = async (resource: Parameters<typeof arrangeIntroducedUser>[0] = {}) => {
    ({ scope, user: owner } = await arrangeIntroducedUser(resource));
  };

  describe('getActiveSession', () => {
    beforeEach(() => arrange());

    it('should return active session when it exists', async () => {
      runningSession(scope, { id: 1, userId: 1 });

      expect(await scope.service.getActiveSession(1)).toMatchObject({ id: 1, resourceId: 1, userId: 1 });
    });

    it('should return null when no active session exists', async () => {
      expect(await scope.service.getActiveSession(1)).toBeNull();
    });

    it('only counts sessions that are published, running and usages of this machine', async () => {
      scope.store.addSession({ id: 3, resourceId: 1, userId: 1, endTime: new Date() }); // ended
      scope.store.addSession({ id: 4, resourceId: 1, userId: 1, isFinalized: false, lifecyclePending: true }); // pending
      scope.store.addSession({ id: 5, resourceId: 1, userId: 1, usageAction: ResourceUsageAction.DoorUnlock });
      scope.store.addSession({ id: 6, resourceId: 2, userId: 1 }); // another machine

      expect(await scope.service.getActiveSession(1)).toBeNull();

      runningSession(scope, { id: 7, userId: 1 });
      expect(await scope.service.getActiveSession(1)).toMatchObject({ id: 7 });
    });
  });

  describe('endSession', () => {
    beforeEach(() => arrange());

    const ownSession = (fields: { id?: number; supervisorUserId?: number } = {}) =>
      runningSession(scope, { id: 1, userId: 1, ...fields });

    it('should end session successfully', async () => {
      const active = ownSession();
      const end = jest.spyOn(scope.store, 'endSessionIfOpen');

      const result = await scope.service.endSession(1, owner, { notes: 'Session completed' });

      expect(result).toMatchObject({ id: 1, userId: 1, endNotes: 'Session completed' });
      expect(result.endTime).toBeInstanceOf(Date);
      expect(scope.store.sessionById(active.id)).toMatchObject({ endNotes: 'Session completed' });
      expect(scope.store.attempts.size).toBe(0);
      // An end is announced once, as an ended event; never as a session start.
      expect(scope.events.emitAsync).not.toHaveBeenCalledWith(
        ResourceSessionStartedEvent.EVENT_NAME,
        expect.anything(),
      );
      const endedEmits = emitted(scope, ResourceUsageSessionEndedEvent.EVENT_NAME) as ResourceUsageSessionEndedEvent[];
      expect(endedEmits).toHaveLength(1);
      expect(endedEmits[0]).toBeInstanceOf(ResourceUsageSessionEndedEvent);
      expect(endedEmits[0].usage).toMatchObject({ id: 1, userId: 1, endNotes: 'Session completed' });
      // Self-ends carry the owner as actor, so the notification listener stays silent.
      expect(endedEmits[0].endedBy).toEqual({ id: owner.id, username: owner.username });
      // Written in the transaction that ends the session, so it commits or rolls back with it.
      expect(scope.audit.record).toHaveBeenCalledTimes(1);
      expect(scope.audit.record).toHaveBeenCalledWith(
        {
          domain: 'resource',
          action: 'usage_session.ended',
          actor: { id: 1, authenticationMethod: 'session' },
          subject: { type: 'resource', id: 1 },
          details: { usageId: 1, usageUserId: 1 },
        },
        end.mock.calls[0][2],
      );
    });

    it('runs the stopped-session flow after reservation but before usage finalization', async () => {
      ownSession();
      const calls: string[] = [];
      const endIfOpen = scope.store.endSessionIfOpen.bind(scope.store);
      jest.spyOn(scope.store, 'endSessionIfOpen').mockImplementation((...args) => {
        calls.push('update');
        return endIfOpen(...args);
      });
      scope.flows.runFlow.mockImplementation(async () => {
        // The stop reserved the session (committed) and did not end it yet.
        expect(scope.store.inTransaction).toBe(false);
        expect(scope.store.attempts.size).toBe(1);
        expect(scope.store.sessionById(1)?.endTime).toBeNull();
        calls.push('flow');
        return [];
      });

      await scope.service.endSession(1, owner, { notes: 'Auto-ended' });

      expect(calls).toEqual(['flow', 'update']);
      expect(scope.flows.runFlow).toHaveBeenCalledWith(
        1,
        ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STOPPED,
        expect.objectContaining({ endNotes: 'Auto-ended' }),
        undefined,
        { lifecycleAttemptId: expect.any(String), actorUserId: 1 },
      );
    });

    it.each([
      {
        failure: 'an acknowledgement timeout',
        error: new ExternalEffectFailureError(
          'MQTT acknowledgement timed out',
          new Error('MQTT acknowledgement timed out'),
          'acknowledgement-timeout',
        ),
      },
      {
        failure: 'an error node failure',
        error: new FlowExecutionError('Bitte die Tür schließen'),
      },
    ])('leaves the session active when $failure is propagated', async ({ error }) => {
      ownSession();
      const end = jest.spyOn(scope.store, 'endSessionIfOpen');
      scope.flows.runFlow.mockRejectedValueOnce(error);

      await expect(scope.service.endSession(1, owner, { notes: 'Auto-ended' })).rejects.toBe(error);

      expect(scope.events.emitAsync).not.toHaveBeenCalled();
      expect(emitted(scope, ResourceUsageSessionEndedEvent.EVENT_NAME)).toEqual([]);
      expect(scope.metrics.resourceUsageSessionsTotal.inc).not.toHaveBeenCalled();
      expect(end).not.toHaveBeenCalled();
      expect(scope.store.sessionById(1)).toMatchObject({ endTime: null, endNotes: null });
      expect(scope.billing.chargeForResourceUsage).not.toHaveBeenCalled();
      expect(scope.audit.record).not.toHaveBeenCalled();
      expect(scope.store.attempts.size).toBe(0);
      expect(scope.flows.runFlow).toHaveBeenCalledWith(
        1,
        ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STOPPED,
        expect.any(Object),
        undefined,
        { lifecycleAttemptId: expect.any(String), actorUserId: 1 },
      );
    });

    it('returns the no-activity-ended session with its configured end notes in usage history immediately', async () => {
      const configuredEndNotes = 'Ended automatically after 5 minutes of inactivity';
      ownSession({ id: 42 });

      // No-activity flows end a session with configured notes and skip interactive end forms.
      await scope.service.endSession(
        1,
        owner,
        { notes: configuredEndNotes },
        { skipFormSubmissions: true, skipNoteNotification: true },
      );
      const history = await scope.service.getResourceUsageHistory(1, 1, 10, owner.id);

      expect(history.data).toEqual([expect.objectContaining({ id: 42, endNotes: configuredEndNotes })]);
      expect(history.total).toBe(1);
    });

    it('rolls back ending the session when billing fails', async () => {
      ownSession();
      const billingError = new Error('Billing failed');
      scope.billing.chargeForResourceUsage.mockRejectedValueOnce(billingError);
      const end = jest.spyOn(scope.store, 'endSessionIfOpen');

      await expect(scope.service.endSession(1, owner, { notes: 'Auto-ended' })).rejects.toThrow(billingError);

      // The charge saw the ended session inside the transaction that ended it ...
      expect(scope.billing.chargeForResourceUsage).toHaveBeenCalledWith(
        expect.objectContaining({ id: 1, endNotes: 'Auto-ended' }),
        end.mock.calls[0][2],
      );
      // ... and failing it took the end back: the session keeps running, nobody is told.
      expect(scope.store.sessionById(1)).toMatchObject({ endTime: null, endNotes: null });
      expect(scope.store.attempts.size).toBe(0);
      expect(scope.flows.runFlow).toHaveBeenCalledTimes(1);
      expect(scope.events.emitAsync).not.toHaveBeenCalled();
      expect(emitted(scope, ResourceUsageSessionEndedEvent.EVENT_NAME)).toEqual([]);
    });

    describe('ending a session of somebody else', () => {
      const member = { id: 77, username: 'member' };
      const manager = { id: 88, username: 'manager' };

      beforeEach(() => {
        scope.store.addResource({ id: 12, name: 'Laser cutter', type: ResourceType.Machine });
        scope.store.addUser(member);
        scope.store.addUser(manager);
        runningSession(scope, { id: 5, resourceId: 12, userId: member.id });
      });

      it("emits a resource session ended notification event after ending someone else's session", async () => {
        scope.rbac.getEffectivePermissions.mockResolvedValue(new Set(['resources.update']));

        await scope.service.endSession(12, manager, { notes: 'Manager stop' });

        const [payload] = emitted(scope, ResourceUsageSessionEndedEvent.EVENT_NAME) as ResourceUsageSessionEndedEvent[];
        expect(payload).toBeInstanceOf(ResourceUsageSessionEndedEvent);
        expect(payload.usage).toMatchObject({ id: 5, endNotes: '[By #88 - manager] Manager stop' });
        expect(payload.endedBy).toEqual({ id: manager.id, username: manager.username });
      });

      it('emits a system resource session ended notification event for flow-ended sessions', async () => {
        await scope.service.endSession(
          12,
          member,
          { notes: 'Flow stop' },
          { skipFormSubmissions: true, skipNoteNotification: true },
        );

        const [payload] = emitted(scope, ResourceUsageSessionEndedEvent.EVENT_NAME) as ResourceUsageSessionEndedEvent[];
        expect(payload.usage).toMatchObject({ id: 5, endNotes: 'Flow stop' });
        expect(payload.endedBy).toBeNull();
      });

      it('allows users with resources.update permission to end sessions owned by others', async () => {
        scope.rbac.getEffectivePermissions.mockResolvedValue(new Set(['resources.update']));
        scope.introducers.isIntroducer.mockResolvedValue(false);
        const end = jest.spyOn(scope.store, 'endSessionIfOpen');
        const notes = '[By #88 - manager] Manual stop';

        const result = await scope.service.endSession(12, manager, { notes: 'Manual stop' });

        expect(result).toMatchObject({ id: 5, endNotes: notes });
        expect(scope.introducers.canMaintain).not.toHaveBeenCalled();
        expect(scope.billing.chargeForResourceUsage).toHaveBeenCalledWith(
          expect.objectContaining({ id: 5, endNotes: notes }),
          end.mock.calls[0][2],
        );
        expect(scope.events.emit).toHaveBeenCalledWith(
          ResourceUsageSessionEndedEvent.EVENT_NAME,
          expect.any(ResourceUsageSessionEndedEvent),
        );
        expect(scope.flows.runFlow).toHaveBeenCalledWith(
          12,
          ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STOPPED,
          expect.objectContaining({ endNotes: notes }),
          undefined,
          { lifecycleAttemptId: expect.any(String), actorUserId: 88 },
        );
      });

      it('allows resource introducers and maintainers to end sessions owned by others', async () => {
        scope.introducers.canMaintain.mockResolvedValue(true);

        const result = await scope.service.endSession(12, manager, { notes: 'Introducer stop' });

        expect(result).toMatchObject({ id: 5, endNotes: '[By #88 - manager] Introducer stop' });
        expect(scope.introducers.canMaintain).toHaveBeenCalledWith(12, 88, true);
        expect(scope.flows.runFlow).toHaveBeenCalledWith(
          12,
          ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STOPPED,
          expect.objectContaining({ endNotes: '[By #88 - manager] Introducer stop' }),
          undefined,
          { lifecycleAttemptId: expect.any(String), actorUserId: 88 },
        );
      });

      it('allows group introducers to end sessions owned by others', async () => {
        scope.introducers.canMaintain.mockImplementation(async (_resourceId, _userId, includeGroupIntroducers) =>
          Boolean(includeGroupIntroducers),
        );

        const result = await scope.service.endSession(12, manager, { notes: 'Group introducer stop' });

        expect(result).toMatchObject({ id: 5, endNotes: '[By #88 - manager] Group introducer stop' });
        expect(scope.introducers.canMaintain).toHaveBeenCalledWith(12, 88, true);
        await expect(scope.introducers.canMaintain.mock.results.at(-1)?.value).resolves.toBe(true);
        expect(scope.flows.runFlow).toHaveBeenCalledWith(
          12,
          ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STOPPED,
          expect.objectContaining({ endNotes: '[By #88 - manager] Group introducer stop' }),
          undefined,
          { lifecycleAttemptId: expect.any(String), actorUserId: 88 },
        );
      });

      it('refuses a user who is neither owner, supervisor, resource manager nor maintainer', async () => {
        await expect(scope.service.endSession(12, manager, { notes: 'Stop' })).rejects.toThrow(
          'You are not authorized to end this session',
        );

        expect(scope.store.sessionById(5)).toMatchObject({ endTime: null });
        expect(scope.store.attempts.size).toBe(0);
        expect(scope.flows.runFlow).not.toHaveBeenCalled();
      });
    });

    describe('supervised sessions', () => {
      const student = { id: 60, username: 'student' };
      const supervisor = { id: 61, username: 'supervisor' };

      beforeEach(() => {
        scope.store.addUser(student);
        scope.store.addUser(supervisor);
        scope.store.addResource({ id: 40, type: ResourceType.Machine });
      });

      it('allows the supervisor of a supervised session to end it without an introducer role', async () => {
        runningSession(scope, { id: 9, resourceId: 40, userId: student.id, supervisorUserId: supervisor.id });

        const result = await scope.service.endSession(40, supervisor, { notes: 'Supervisor stop' });

        expect(result).toMatchObject({ id: 9, endNotes: '[By #61 - supervisor] Supervisor stop' });
        // The supervisor short-circuits the authorization check; no introducer lookup needed.
        expect(scope.introducers.canMaintain).not.toHaveBeenCalled();
        expect(scope.flows.runFlow).toHaveBeenCalledWith(
          40,
          ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STOPPED,
          expect.objectContaining({ endNotes: '[By #61 - supervisor] Supervisor stop' }),
          undefined,
          { lifecycleAttemptId: expect.any(String), actorUserId: 61 },
        );
      });

      it('emits the auto-promotion counter event when a supervised session ends', async () => {
        runningSession(scope, { id: 9, resourceId: 40, userId: student.id, supervisorUserId: supervisor.id });

        await scope.service.endSession(40, supervisor, {});

        const [payload] = emitted(scope, ResourceSupervisedUsageEndedEvent.EVENT_NAME);
        expect(payload).toBeInstanceOf(ResourceSupervisedUsageEndedEvent);
        expect(payload).toMatchObject({ resourceId: 40, userId: 60, supervisorUserId: 61, usageId: 9 });
      });

      it('does not emit the auto-promotion counter event for an unsupervised session end', async () => {
        runningSession(scope, { id: 9, resourceId: 40, userId: student.id });

        await scope.service.endSession(40, student, {});

        expect(emitted(scope, ResourceSupervisedUsageEndedEvent.EVENT_NAME)).toEqual([]);
      });
    });

    it('emits ResourceUsageNoteAddedEvent when a user note is present', async () => {
      ownSession();

      await scope.service.endSession(1, owner, { notes: 'note text' });

      const [payload] = emitted(scope, ResourceUsageNoteAddedEvent.EVENT_NAME);
      expect(payload).toMatchObject({ resourceId: 1, note: 'note text', phase: 'end' });
    });

    it('does not emit the note event when skipNoteNotification is set (flow-ended session)', async () => {
      ownSession();

      await scope.service.endSession(1, owner, { notes: 'auto note' }, { skipNoteNotification: true });

      expect(emitted(scope, ResourceUsageNoteAddedEvent.EVENT_NAME)).toEqual([]);
    });

    it('should throw error when no active session exists', async () => {
      await expect(scope.service.endSession(1, owner, { notes: 'Session completed' })).rejects.toThrow(
        new BadRequestException('No active session found'),
      );
      expect(scope.store.attempts.size).toBe(0);
    });

    it('looks up the active session inside the stop transaction', async () => {
      ownSession();
      const lookups: boolean[] = [];
      const lookup = scope.store.findActiveSessions.bind(scope.store);
      jest.spyOn(scope.store, 'findActiveSessions').mockImplementation((...args) => {
        lookups.push(scope.store.inTransaction);
        return lookup(...args);
      });

      await scope.service.endSession(1, owner, { notes: 'Session completed' });

      expect(lookups[0]).toBe(true);
      expect(scope.flows.runFlow).toHaveBeenCalledTimes(1);
      expect(scope.billing.chargeForResourceUsage).toHaveBeenCalledTimes(1);
    });
  });
});
