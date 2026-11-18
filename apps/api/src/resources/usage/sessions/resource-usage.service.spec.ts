import { ResourceFlowNodeType, ResourceType, ResourceUsageAction } from '@attraccess/application-models';
import type { UsageSessionUser } from '@attraccess/application-models';

import { AuthenticatedUser } from '@attraccess/plugins-backend-sdk';

import { BadRequestException, NotFoundException } from '@nestjs/common';

import { InsufficientBalanceError } from '../../../billing/errors/insufficient-balance.error';

import { ResourceUsageImpossibleMaintenanceInProgressException } from '../../../exceptions/resource.maintenance.inUse.exception';

import { ResourceNotFoundException } from '../../../exceptions/resource.notFound.exception';

import { ResourceUnhealthyException } from '../../../exceptions/resource.unhealthy.exception';

import { ExternalEffectFailureError } from '../../flows/errors/external-effect-failure.error';

import { StartUsageSessionDto } from '../dtos/startUsageSession.dto';

import { ResourceInUseError } from '../errors/resource-in-use.error';

import { ResourceSessionStartedEvent, ResourceUsageSessionTakenOverEvent } from '../events/resource-usage.events';

import { arrangeIntroducedUser, InMemoryUsageScope, runningSession } from './fixtures/arrangements.test-fixture';

const BASE_FLOW_ARGS = { lifecycleAttemptId: expect.any(String), actorUserId: 1 };

describe('ResourceUsageService', () => {
  describe('the project of a completed session', () => {
    let scope: InMemoryUsageScope;
    const owner: UsageSessionUser = { id: 7 };

    beforeEach(async () => {
      ({ scope } = await arrangeIntroducedUser({ id: 1 }, owner));
      scope.projects.findOneById.mockImplementation(async (_userId: number, projectId: number) => ({ id: projectId }));
    });

    const ended = (fields: Record<string, unknown> = {}) =>
      scope.store.addSession({ id: 8, resourceId: 1, userId: 7, endTime: new Date(), ...fields });

    it('assigns and clears the project of a completed session through the owning user', async () => {
      ended();

      const assigned = await scope.service.updateSessionProject(1, 8, owner, { projectId: 9 });
      expect(scope.projects.findOneById).toHaveBeenCalledWith(7, 9);
      expect(assigned).toMatchObject({ id: 8, projectId: 9 });
      expect(scope.store.sessionById(8)).toMatchObject({ projectId: 9 });

      const cleared = await scope.service.updateSessionProject(1, 8, owner, { projectId: null });
      expect(cleared).toMatchObject({ id: 8, projectId: null, project: null });
      expect(scope.store.sessionById(8)).toMatchObject({ projectId: null, project: null });
    });

    it('rejects invalid or unauthorized project assignments without writing the session', async () => {
      const assign = jest.spyOn(scope.store, 'assignProject');
      await expect(scope.service.updateSessionProject(1, 8, owner, { projectId: 9 })).rejects.toThrow('not found');

      scope.store.addSession({ id: 8, resourceId: 1, userId: 7 });
      await expect(scope.service.updateSessionProject(1, 8, owner, { projectId: 9 })).rejects.toThrow('still active');

      scope.store.sessions = [];
      ended({ usageAction: ResourceUsageAction.DoorUnlock });
      await expect(scope.service.updateSessionProject(1, 8, owner, { projectId: 9 })).rejects.toThrow(
        'Only usage sessions',
      );

      scope.store.sessions = [];
      ended({ userId: 99 });
      await expect(scope.service.updateSessionProject(1, 8, owner, { projectId: 9 })).rejects.toThrow('not authorized');

      scope.store.sessions = [];
      ended();
      await expect(scope.service.updateSessionProject(1, 8, owner, {} as never)).rejects.toThrow('required');

      expect(assign).not.toHaveBeenCalled();
      expect(scope.store.sessionById(8)).toMatchObject({ projectId: null });
    });
  });

  describe('getSessionDetails', () => {
    const requester = { id: 1, effectivePermissions: new Set<string>() } as AuthenticatedUser;
    let scope: InMemoryUsageScope;

    beforeEach(async () => {
      ({ scope } = await arrangeIntroducedUser({ id: 5 }));
    });

    it('loads the requested session for the owner without checking any project', async () => {
      scope.store.addSession({ id: 8, resourceId: 5, userId: 1 });
      const read = jest.spyOn(scope.store, 'findPublishedSession');

      expect(await scope.service.getSessionDetails(5, 8, requester)).toMatchObject({ id: 8, userId: 1 });

      expect(read).toHaveBeenCalledWith(5, 8);
      expect(scope.projects.findOneById).not.toHaveBeenCalled();
    });

    it('skips the project check when the viewer’s activity access covers other users', async () => {
      scope.store.addSession({ id: 8, resourceId: 5, userId: 2 });

      expect(await scope.service.getSessionDetails(5, 8, requester, true)).toMatchObject({ id: 8, userId: 2 });
      expect(scope.projects.findOneById).not.toHaveBeenCalled();
    });

    it('requires project access before returning another member’s usage', async () => {
      scope.store.addSession({ id: 8, resourceId: 5, userId: 2, projectId: 3 });
      scope.projects.findOneById.mockResolvedValue({ id: 3 });

      expect(await scope.service.getSessionDetails(5, 8, requester)).toMatchObject({ id: 8, projectId: 3 });
      expect(scope.projects.findOneById).toHaveBeenCalledWith(1, 3);

      scope.projects.findOneById.mockRejectedValue(new NotFoundException('Project not found'));
      await expect(scope.service.getSessionDetails(5, 8, requester)).rejects.toThrow(NotFoundException);
    });

    it.each([
      ['a session that does not exist', undefined],
      ['another member’s session without a project', { id: 8, userId: 2, projectId: null }],
    ])('rejects %s', async (_name, stored) => {
      if (stored) scope.store.addSession({ resourceId: 5, ...stored });
      await expect(scope.service.getSessionDetails(5, 8, requester)).rejects.toThrow(NotFoundException);
    });

    it('does not show a session of another machine or one that is still a pending reservation', async () => {
      scope.store.addSession({ id: 8, resourceId: 6, userId: 1 });
      scope.store.addSession({ id: 9, resourceId: 5, userId: 1, isFinalized: false, lifecyclePending: true });

      await expect(scope.service.getSessionDetails(5, 8, requester)).rejects.toThrow(NotFoundException);
      await expect(scope.service.getSessionDetails(5, 9, requester)).rejects.toThrow(NotFoundException);
    });
  });

  describe('startSession', () => {
    let scope: InMemoryUsageScope;
    let user: UsageSessionUser;
    const dto: StartUsageSessionDto = { notes: 'Test session' };
    const takeOver: StartUsageSessionDto = { notes: 'Test session', forceTakeOver: true };

    const arrange = async (resource: Parameters<typeof arrangeIntroducedUser>[0] = {}) => {
      ({ scope, user } = await arrangeIntroducedUser(resource));
    };
    const outgoingUser = { id: 9, username: 'previous', billingFactor: 100 };
    /** The machine allows take-overs and user 9 is working on it. */
    const arrangeTakeOver = async () => {
      await arrange({ allowTakeOver: true });
      scope.store.addUser(outgoingUser);
      return runningSession(scope, { id: 10, userId: 9 });
    };
    const startedSession = () => scope.store.sessions.find((stored) => stored.userId === user.id);

    it('rolls back the start when an HTTP transport failure is propagated', async () => {
      await arrange();
      const reserved: Array<{ pending: number; attempts: number; inTransaction: boolean }> = [];
      scope.flows.runFlow.mockImplementationOnce(async () => {
        reserved.push({
          pending: scope.store.sessions.filter((stored) => stored.lifecyclePending).length,
          attempts: scope.store.attempts.size,
          inTransaction: scope.store.inTransaction,
        });
        throw new ExternalEffectFailureError(
          'HTTP dispatch failed',
          new Error('HTTP dispatch failed'),
          'transport-dispatch',
        );
      });
      const reserve = jest.spyOn(scope.store, 'createPendingSession');

      await expect(scope.service.startSession(1, user, dto)).rejects.toThrow('HTTP dispatch failed');

      // The machine was reserved (committed, outside of any transaction) while the flow ran ...
      expect(reserved).toEqual([{ pending: 1, attempts: 1, inTransaction: false }]);
      expect(reserve).toHaveBeenCalledWith(
        {
          resourceId: 1,
          userId: 1,
          startNotes: 'Test session',
          startTime: expect.any(Date),
          sessionDurationCreditsPerMinute: 0,
          operatingDurationCreditsPerMinute: 0,
          creditsPerUsage: 0,
          meterRates: [],
        },
        expect.anything(),
      );
      // ... and a failed start leaves neither the tentative session nor the reservation behind.
      expect(scope.store.sessions).toEqual([]);
      expect(scope.store.attempts.size).toBe(0);
      expect(scope.events.emitAsync).not.toHaveBeenCalled();
      expect(scope.flows.trackResourceActivity).not.toHaveBeenCalled();
      expect(scope.flows.runFlow).toHaveBeenCalledWith(
        1,
        ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STARTED,
        expect.any(Object),
        undefined,
        BASE_FLOW_ARGS,
      );
    });

    it('should throw error when resource does not exist', async () => {
      await arrange();
      scope.store.resources.clear();

      await expect(scope.service.startSession(1, user, dto)).rejects.toThrow(ResourceNotFoundException);
    });

    it('should throw error when user has not completed introduction', async () => {
      await arrange();
      scope.introductions.hasValidIntroduction.mockResolvedValue(false);

      await expect(scope.service.startSession(1, user, dto)).rejects.toThrow(BadRequestException);

      expect(scope.introductions.hasValidIntroduction).toHaveBeenCalledWith(1, 1, expect.anything());
      expect(scope.store.sessions).toEqual([]);
      expect(scope.store.attempts.size).toBe(0);
    });

    it('should throw error when active session exists and no takeover requested', async () => {
      await arrange();
      runningSession(scope, { id: 1, userId: 2 });

      await expect(scope.service.startSession(1, user, dto)).rejects.toBeInstanceOf(ResourceInUseError);

      expect(scope.store.sessions).toHaveLength(1);
      expect(scope.store.attempts.size).toBe(0);
    });

    it('should throw error when takeover requested but resource does not allow it', async () => {
      await arrange({ allowTakeOver: false });
      runningSession(scope, { id: 1, userId: 2 });

      await expect(scope.service.startSession(1, user, takeOver)).rejects.toThrow(
        new BadRequestException('This resource does not allow overtaking'),
      );
      expect(scope.store.sessionById(1)).toMatchObject({ endTime: null });
    });

    it('rolls back the takeover when an MQTT controller rejection is propagated', async () => {
      const previous = await arrangeTakeOver();
      scope.flows.runFlow.mockRejectedValueOnce(
        new ExternalEffectFailureError(
          'MQTT controller rejected takeover',
          new Error('MQTT controller rejected takeover'),
          'controller-rejection',
        ),
      );

      await expect(scope.service.startSession(1, user, takeOver)).rejects.toThrow('MQTT controller rejected takeover');

      // The previous user keeps working, nobody was charged or announced, and the reservation is gone.
      expect(scope.store.sessions).toHaveLength(1);
      expect(scope.store.sessionById(previous.id)).toMatchObject({ endTime: null, userId: 9 });
      expect(scope.store.attempts.size).toBe(0);
      expect(scope.billing.chargeForResourceUsage).not.toHaveBeenCalled();
      expect(scope.billing.handleResourceUsageStart).not.toHaveBeenCalled();
      expect(scope.events.emitAsync).not.toHaveBeenCalled();
      expect(scope.events.emit).not.toHaveBeenCalledWith(
        ResourceUsageSessionTakenOverEvent.EVENT_NAME,
        expect.any(Object),
      );
      expect(scope.flows.trackResourceActivity).not.toHaveBeenCalled();
      expect(scope.flows.runFlow).toHaveBeenCalledWith(
        1,
        ResourceFlowNodeType.INPUT_RESOURCE_USAGE_TAKEOVER,
        expect.any(Object),
        undefined,
        BASE_FLOW_ARGS,
      );
    });

    it('triggers only the TAKEOVER flow on a takeover and not STARTED/STOPPED; billing unchanged', async () => {
      const previous = await arrangeTakeOver();

      await scope.service.startSession(1, user, takeOver);

      expect(scope.flows.runFlow).toHaveBeenCalledTimes(1);
      const [resourceId, nodeType, payload] = scope.flows.runFlow.mock.calls[0];
      expect(resourceId).toBe(1);
      expect(nodeType).toBe(ResourceFlowNodeType.INPUT_RESOURCE_USAGE_TAKEOVER);
      expect(payload).toMatchObject({ newUser: { id: user.id }, oldUser: { id: previous.user.id } });

      // The new session is billed once, the outgoing one is charged once (and the new one never is).
      expect(scope.billing.handleResourceUsageStart).toHaveBeenCalledTimes(1);
      expect(scope.billing.chargeForResourceUsage).toHaveBeenCalledTimes(1);
      const charged = scope.billing.chargeForResourceUsage.mock.calls[0][0];
      expect(charged).toMatchObject({ id: previous.id, user: { id: 9 } });
      expect(charged.endTime).toBeInstanceOf(Date);
      expect(scope.flows.trackResourceActivity).toHaveBeenCalledTimes(1);
      expect(scope.flows.trackResourceActivity).toHaveBeenCalledWith(1);

      // The old session ended because of the takeover, the new one is the only running session.
      expect(scope.store.sessionById(previous.id)).toMatchObject({
        endNotes: 'Session ended due to takeover by user 1',
      });
      expect(scope.store.sessionById(previous.id)?.endTime).toBeInstanceOf(Date);
      expect(startedSession()).toMatchObject({ isFinalized: true, lifecyclePending: false, endTime: null });
      expect(await scope.service.getActiveSession(1)).toMatchObject({ userId: 1 });
      expect(scope.store.attempts.size).toBe(0);
    });

    it('audits the take-over as the old session ending and the new one starting, inside the start transaction', async () => {
      const previous = await arrangeTakeOver();
      const publish = jest.spyOn(scope.store, 'publishSession');
      const end = jest.spyOn(scope.store, 'endSessionIfOpen');

      await scope.service.startSession(1, user, takeOver);

      const newId = startedSession()?.id;
      const actor = { id: 1, authenticationMethod: 'session' };
      expect(scope.audit.record.mock.calls.map(([event]) => event)).toEqual([
        {
          domain: 'resource',
          action: 'usage_session.ended',
          actor,
          subject: { type: 'resource', id: 1 },
          details: { usageId: previous.id, usageUserId: 9 },
        },
        {
          domain: 'resource',
          action: 'usage_session.started',
          actor,
          subject: { type: 'resource', id: 1 },
          details: { usageId: newId, usageUserId: 1 },
        },
      ]);
      // Both rows are written in the transaction that ends the old session and publishes the new one, so the
      // take-over and its audit trail commit or roll back together.
      const transaction = publish.mock.calls[0][1];
      expect(transaction).toBeDefined();
      expect(end.mock.calls[0][2]).toBe(transaction);
      expect(scope.audit.record.mock.calls.map(([, writtenIn]) => writtenIn)).toEqual([transaction, transaction]);
    });

    it('should throw ResourceMaintenanceInUseException when resource is under maintenance and user cannot manage maintenance', async () => {
      await arrange();
      scope.maintenance.hasActiveMaintenance.mockResolvedValue(true);
      scope.maintenance.canManageMaintenance.mockResolvedValue(false);

      await expect(scope.service.startSession(1, user, dto)).rejects.toThrow(
        ResourceUsageImpossibleMaintenanceInProgressException,
      );
      expect(scope.maintenance.hasActiveMaintenance).toHaveBeenCalledWith(1, expect.anything());
      expect(scope.maintenance.canManageMaintenance).toHaveBeenCalledWith(user, 1, expect.anything());
      expect(scope.store.sessions).toEqual([]);
    });

    it('should block non-maintenance users when active maintenance exists including schedule-triggered (same as manual)', async () => {
      await arrange();
      // hasActiveMaintenance does not filter by origin: schedule-created maintenances use the same
      // table and criteria (startTime <= now, endTime IS NULL), so they block the same as manual ones
      scope.maintenance.hasActiveMaintenance.mockResolvedValue(true);
      scope.maintenance.canManageMaintenance.mockResolvedValue(false);

      await expect(scope.service.startSession(1, user, dto)).rejects.toThrow(
        ResourceUsageImpossibleMaintenanceInProgressException,
      );
      expect(scope.maintenance.hasActiveMaintenance).toHaveBeenCalledWith(1, expect.anything());
      expect(scope.maintenance.canManageMaintenance).toHaveBeenCalledWith(user, 1, expect.anything());
    });

    it('should throw ResourceUnhealthyException when resource is unhealthy and user cannot manage maintenance', async () => {
      await arrange();
      scope.health.isResourceUnhealthy.mockResolvedValueOnce(true);
      scope.maintenance.canManageMaintenance.mockResolvedValue(false);

      await expect(scope.service.startSession(1, user, dto)).rejects.toBeInstanceOf(ResourceUnhealthyException);
      // Reads through the start's transaction, not the main connection that may wait for its lock.
      expect(scope.health.isResourceUnhealthy).toHaveBeenCalledWith(1, expect.anything());
      expect(scope.maintenance.canManageMaintenance).toHaveBeenCalled();
    });

    it('should allow maintenance users to start a session even when resource is unhealthy', async () => {
      await arrange();
      scope.health.isResourceUnhealthy.mockResolvedValueOnce(true);
      scope.maintenance.canManageMaintenance.mockResolvedValue(true);

      const result = await scope.service.startSession(1, user, dto);

      expect(result).toMatchObject({ resourceId: 1, userId: 1, isFinalized: true, endTime: null });
      expect(scope.store.sessionById(result.id)).toMatchObject({ lifecyclePending: false });
    });

    it('should allow usage when resource is under maintenance but user can manage maintenance', async () => {
      await arrange();
      scope.maintenance.hasActiveMaintenance.mockResolvedValue(true);
      scope.maintenance.canManageMaintenance.mockResolvedValue(true);

      const result = await scope.service.startSession(1, user, dto);

      expect(result).toMatchObject({ resourceId: 1, userId: 1, isFinalized: true });
      expect(scope.maintenance.hasActiveMaintenance).toHaveBeenCalledWith(1, expect.anything());
      expect(scope.maintenance.canManageMaintenance).toHaveBeenCalledWith(user, 1, expect.anything());
      expect(scope.flows.trackResourceActivity).toHaveBeenCalledWith(1);
    });

    it('should reject start when billing is enabled and balance is insufficient', async () => {
      await arrange();
      scope.billing.handleResourceUsageStart.mockRejectedValue(new InsufficientBalanceError());

      await expect(scope.service.startSession(1, user, dto)).rejects.toBeInstanceOf(InsufficientBalanceError);

      expect(scope.billing.handleResourceUsageStart).toHaveBeenCalled();
      // Not even the tentative session survives, and nobody is told about a start.
      expect(scope.store.sessions).toEqual([]);
      expect(scope.store.attempts.size).toBe(0);
      expect(scope.events.emitAsync).not.toHaveBeenCalled();
    });

    it('should start when billing is enabled and balance is sufficient', async () => {
      await arrange();
      const publish = jest.spyOn(scope.store, 'publishSession');

      const result = await scope.service.startSession(1, user, dto);

      expect(result).toMatchObject({ resourceId: 1, userId: 1, endTime: null, isFinalized: true });
      expect(scope.billing.handleResourceUsageStart).toHaveBeenCalledWith(
        1,
        expect.anything(),
        user,
        expect.anything(),
      );
      expect(scope.store.sessionById(result.id)).toMatchObject({ isFinalized: true, lifecyclePending: false });
      expect(scope.store.attempts.size).toBe(0);
      expect(scope.events.emitAsync).toHaveBeenCalledWith(ResourceSessionStartedEvent.EVENT_NAME, expect.any(Object));
      expect(scope.flows.trackResourceActivity).toHaveBeenCalledWith(1);
      // Written inside the session's transaction, so the row commits or rolls back with it.
      expect(scope.audit.record).toHaveBeenCalledTimes(1);
      expect(scope.audit.record).toHaveBeenCalledWith(
        {
          domain: 'resource',
          action: 'usage_session.started',
          actor: { id: 1, authenticationMethod: 'session' },
          subject: { type: 'resource', id: 1 },
          details: { usageId: result.id, usageUserId: 1 },
        },
        publish.mock.calls[0][1],
      );
    });

    it('starts a machine as a usage session of the user that can be found as the machine’s only active session', async () => {
      await arrange();

      const result = await scope.service.startSession(1, user, dto);

      expect(await scope.service.getActiveSession(1)).toMatchObject({ id: result.id, userId: 1 });
      expect(result.resource).toMatchObject({ type: ResourceType.Machine });
    });
  });
});
