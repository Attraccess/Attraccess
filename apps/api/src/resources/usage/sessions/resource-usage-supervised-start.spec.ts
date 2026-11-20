import { SupervisionMode } from '@attraccess/application-models';
import type { UsageSessionUser } from '@attraccess/application-models';

import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';

import { ResourceSupervisedUsageStartedEvent } from '../events/resource-usage.events';

import { arrangeIntroducedUser, InMemoryUsageScope } from './fixtures/arrangements.test-fixture';

describe('ResourceUsageService', () => {
  describe('supervised start', () => {
    let scope: InMemoryUsageScope;
    let requester: UsageSessionUser;
    const supervisor: UsageSessionUser = { id: 2, username: 'supervisor' };

    /** A machine with the given supervision mode; the supervisor exists and is an introducer unless told otherwise. */
    const arrange = async (mode: SupervisionMode, supervisorIsIntroducer = true) => {
      ({ scope, user: requester } = await arrangeIntroducedUser(
        { name: 'Supervised Resource', supervisionMode: mode },
        { id: 1, username: 'requester' },
      ));
      scope.store.addUser(supervisor);
      scope.introducers.isIntroducer.mockResolvedValue(supervisorIsIntroducer);
    };
    const supervisedStart = (supervisorUserId = supervisor.id) =>
      scope.service.startSession(1, requester, {}, { supervisorUserId });

    it('starts a supervised session, sets supervisorUserId, and emits the auto-promotion counter event', async () => {
      await arrange(SupervisionMode.SUPERVISION_ALLOWED);
      const reserve = jest.spyOn(scope.store, 'createPendingSession');

      const result = await scope.service.startSession(
        1,
        requester,
        { notes: 'Supervised run' },
        { supervisorUserId: 2 },
      );

      expect(result).toMatchObject({ resourceId: 1, userId: 1, supervisorUserId: 2, isFinalized: true, endTime: null });
      expect(reserve).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 1, supervisorUserId: 2 }),
        expect.anything(),
      );
      expect(scope.store.sessionById(result.id)).toMatchObject({ supervisorUserId: 2, lifecyclePending: false });

      const counterEmit = scope.events.emit.mock.calls.find(
        ([name]) => name === ResourceSupervisedUsageStartedEvent.EVENT_NAME,
      );
      expect(counterEmit).toBeDefined();
      const payload = counterEmit?.[1] as ResourceSupervisedUsageStartedEvent;
      expect(payload).toBeInstanceOf(ResourceSupervisedUsageStartedEvent);
      expect(payload).toMatchObject({ resourceId: 1, userId: 1, supervisorUserId: 2 });
    });

    it('rejects a resource manager who is not also an introducer', async () => {
      await arrange(SupervisionMode.SUPERVISION_ALLOWED, false);
      scope.rbac.getEffectivePermissions.mockResolvedValue(new Set(['resources.update']));

      await expect(supervisedStart()).rejects.toBeInstanceOf(ForbiddenException);
      expect(scope.store.sessions).toEqual([]);
    });

    it('allows a supervised start on SUPERVISION_REQUIRED even for an introduced user', async () => {
      await arrange(SupervisionMode.SUPERVISION_REQUIRED);

      await expect(supervisedStart()).resolves.toMatchObject({ supervisorUserId: 2 });
    });

    it('rejects self-supervision', async () => {
      await arrange(SupervisionMode.SUPERVISION_ALLOWED);

      await expect(supervisedStart(requester.id)).rejects.toThrow(
        new BadRequestException('You cannot supervise your own session'),
      );
      expect(scope.store.sessions).toEqual([]);
    });

    it('rejects a maintainer who is not also an introducer', async () => {
      await arrange(SupervisionMode.SUPERVISION_ALLOWED, false);

      await expect(supervisedStart()).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('accepts an applicable Resource Group introducer', async () => {
      await arrange(SupervisionMode.SUPERVISION_ALLOWED);

      await expect(supervisedStart()).resolves.toMatchObject({ supervisorUserId: 2 });
      expect(scope.introducers.isIntroducer).toHaveBeenCalledWith(1, 2, true, expect.anything());
    });

    it('rejects a supervised start when the resource does not allow supervision', async () => {
      await arrange(SupervisionMode.INTRODUCTION_REQUIRED);

      await expect(supervisedStart()).rejects.toThrow(
        new BadRequestException('This resource does not support supervised sessions'),
      );
      expect(scope.store.sessions).toEqual([]);
    });

    it('rejects an unknown supervisor', async () => {
      await arrange(SupervisionMode.SUPERVISION_ALLOWED);

      await expect(supervisedStart(999)).rejects.toThrow(new NotFoundException('Supervisor with ID 999 not found'));
      expect(scope.store.sessions).toEqual([]);
    });

    it('blocks a solo start on SUPERVISION_REQUIRED even for an introduced user', async () => {
      await arrange(SupervisionMode.SUPERVISION_REQUIRED);

      await expect(scope.service.startSession(1, requester, {})).rejects.toThrow(
        new BadRequestException('This resource requires a supervisor; request a supervised session instead'),
      );
      expect(scope.store.sessions).toEqual([]);
    });
  });
});
