import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  RequestTimeoutException,
} from '@nestjs/common';
import { ResourceUsage, User } from '@attraccess/database-entities';
import { SupervisionService } from './supervision.service';
import { SupervisionLiveService } from './supervision-live.service';
import { ResourceUsageService } from '../usage/resourceUsage.service';
import { ResourceIntroducersService } from '../introducers/resourceIntroducers.service';
import { RbacService } from '../../users-and-auth/rbac/rbac.service';
import { RequestSupervisedSessionDto } from './dtos/requestSupervisedSession.dto';
import { SupervisionLiveEventType } from './dtos/supervisionLiveEvent.dto';
// Lets pending request promises settle/flush without depending on real timers.
const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('SupervisionService', () => {
  let service: SupervisionService;
  let resourceUsageService: {
    validateSupervisedStart: jest.Mock;
    startSession: jest.Mock;
    assertSupportsSupervision: jest.Mock;
  };
  let introducers: { getMany: jest.Mock };
  let live: { emitToSupervisor: jest.Mock; getSupervisorSubject: jest.Mock };
  let rbac: { getUserIdsWithPermission: jest.Mock };
  const requester: User = { id: 1, username: 'requester' } as User;
  const supervisor: User = { id: 2, username: 'supervisor' } as User;
  const dto: RequestSupervisedSessionDto = { supervisorUserId: 2, notes: 'please supervise' };
  const startedSession = { id: 99, resourceId: 5, userId: 1, supervisorUserId: 2 } as ResourceUsage;

  beforeEach(async () => {
    resourceUsageService = {
      validateSupervisedStart: jest.fn().mockResolvedValue(undefined),
      startSession: jest.fn().mockResolvedValue(startedSession),
      assertSupportsSupervision: jest.fn().mockResolvedValue({ id: 5 }),
    };
    introducers = {
      getMany: jest.fn().mockResolvedValue([{ userId: 1, user: {} }, { userId: 2, user: {} }, { userId: 3, user: {} }]),
    };
    live = {
      emitToSupervisor: jest.fn(),
      getSupervisorSubject: jest.fn(),
    };
    rbac = {
      getUserIdsWithPermission: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SupervisionService,
        { provide: ResourceUsageService, useValue: resourceUsageService },
        { provide: ResourceIntroducersService, useValue: introducers },
        { provide: SupervisionLiveService, useValue: live },
        { provide: RbacService, useValue: rbac },
      ],
    }).compile();

    service = module.get(SupervisionService);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  const createRequest = async () => {
    const pending = service.requestSupervisedSession(5, requester, dto);
    // attach a no-op catch so unsettled/late rejections never surface as unhandled
    pending.catch(() => undefined);
    await flush();
    const requestedEvent = live.emitToSupervisor.mock.calls.find(
      (c) => c[1].type === SupervisionLiveEventType.REQUESTED,
    );
    return { pending, requestId: requestedEvent?.[1].requestId as string };
  };

  it('validates eagerly and emits a REQUESTED event to the selected supervisor', async () => {
    const { requestId } = await createRequest();

    expect(resourceUsageService.validateSupervisedStart).toHaveBeenCalledWith(5, requester, 2);
    expect(requestId).toBeDefined();

    const [supervisorId, event] = live.emitToSupervisor.mock.calls[0];
    expect(supervisorId).toBe(2);
    expect(event).toMatchObject({
      type: SupervisionLiveEventType.REQUESTED,
      requestId,
      request: expect.objectContaining({ resourceId: 5, requesterUserId: 1, supervisorUserId: 2, notes: 'please supervise' }),
    });
  });

  it('propagates validation errors without creating a pending request', async () => {
    resourceUsageService.validateSupervisedStart.mockRejectedValueOnce(new ForbiddenException('nope'));

    await expect(service.requestSupervisedSession(5, requester, dto)).rejects.toBeInstanceOf(ForbiddenException);
    expect(service.listPendingForSupervisor(2)).toHaveLength(0);
    expect(live.emitToSupervisor).not.toHaveBeenCalled();
  });

  it('starts the session on approval and resolves the requester', async () => {
    const { pending, requestId } = await createRequest();

    const approved = await service.approve(requestId, supervisor);

    expect(resourceUsageService.startSession).toHaveBeenCalledWith(5, requester, dto, { supervisorUserId: 2 });
    expect(approved).toBe(startedSession);
    await expect(pending).resolves.toBe(startedSession);
    expect(service.listPendingForSupervisor(2)).toHaveLength(0);
    expect(
      live.emitToSupervisor.mock.calls.some((c) => c[1].type === SupervisionLiveEventType.RESOLVED),
    ).toBe(true);
  });

  it('rejects the requester when the supervisor rejects the request', async () => {
    const { pending, requestId } = await createRequest();

    const result = service.reject(requestId, supervisor);

    expect(result).toEqual({ status: 'rejected', requestId });
    await expect(pending).rejects.toBeInstanceOf(ForbiddenException);
    expect(resourceUsageService.startSession).not.toHaveBeenCalled();
    expect(
      live.emitToSupervisor.mock.calls.some((c) => c[1].type === SupervisionLiveEventType.REJECTED),
    ).toBe(true);
  });

  it('expires the request after 30s and times out the requester', async () => {
    jest.useFakeTimers();
    const pending = service.requestSupervisedSession(5, requester, dto);
    pending.catch(() => undefined);
    await Promise.resolve();

    jest.advanceTimersByTime(SupervisionService.APPROVAL_TTL_MS);

    await expect(pending).rejects.toBeInstanceOf(RequestTimeoutException);
    expect(service.listPendingForSupervisor(2)).toHaveLength(0);

    const expiredEvent = live.emitToSupervisor.mock.calls.find(
      (c) => c[1].type === SupervisionLiveEventType.EXPIRED,
    );
    expect(expiredEvent).toBeDefined();
  });

  it('rejects approval from someone other than the requested supervisor', async () => {
    const { requestId } = await createRequest();
    const stranger = { id: 3, username: 'stranger' } as User;

    await expect(service.approve(requestId, stranger)).rejects.toBeInstanceOf(ForbiddenException);
    expect(resourceUsageService.startSession).not.toHaveBeenCalled();
    // the request remains pending for the real supervisor
    expect(service.listPendingForSupervisor(2)).toHaveLength(1);
  });

  it('throws NotFound for an unknown or already-settled request', async () => {
    await expect(service.approve('does-not-exist', supervisor)).rejects.toBeInstanceOf(NotFoundException);
    expect(() => service.reject('does-not-exist', supervisor)).toThrow(NotFoundException);
  });

  it('propagates a failed session start to both supervisor and requester', async () => {
    resourceUsageService.startSession.mockRejectedValueOnce(new Error('resource in use'));
    const { pending, requestId } = await createRequest();

    await expect(service.approve(requestId, supervisor)).rejects.toThrow('resource in use');
    await expect(pending).rejects.toThrow('resource in use');
  });

  it('allows multiple parallel pending requests for the same supervisor (no limit)', async () => {
    await createRequest();
    await createRequest();

    expect(service.listPendingForSupervisor(2)).toHaveLength(2);
  });

  describe('reader-originated requests (ATT-493)', () => {
    const eligibleSupervisorIds = [2, 3];

    const createReaderRequest = (overrides?: { onResolved?: jest.Mock; onFailed?: jest.Mock }) => {
      const onResolved = overrides?.onResolved ?? jest.fn();
      const onFailed = overrides?.onFailed ?? jest.fn();
      const { requestId, expiresAt } = service.createReaderRequest({
        resourceId: 5,
        requester,
        dto: {},
        eligibleSupervisorIds,
        callbacks: { onResolved, onFailed },
      });
      return { requestId, expiresAt, onResolved, onFailed };
    };

    it('broadcasts a REQUESTED event to every eligible supervisor', () => {
      const { requestId } = createReaderRequest();

      const requestedTargets = live.emitToSupervisor.mock.calls
        .filter((c) => c[1].type === SupervisionLiveEventType.REQUESTED && c[1].requestId === requestId)
        .map((c) => c[0]);
      expect(requestedTargets.sort()).toEqual([2, 3]);
      // The pending request is visible to either supervisor (initial SSE state on reconnect).
      expect(service.listPendingForSupervisor(2)).toHaveLength(1);
      expect(service.listPendingForSupervisor(3)).toHaveLength(1);
    });

    it('lets any eligible supervisor approve: starts the session and notifies the reader + all popups', async () => {
      const { requestId, onResolved } = createReaderRequest();
      const otherSupervisor = { id: 3, username: 'other' } as User;

      const session = await service.approve(requestId, otherSupervisor);

      expect(resourceUsageService.startSession).toHaveBeenCalledWith(5, requester, {}, { supervisorUserId: 3 });
      expect(session).toBe(startedSession);
      expect(onResolved).toHaveBeenCalledWith(startedSession, { id: 3, username: 'other' });
      const resolvedTargets = live.emitToSupervisor.mock.calls
        .filter((c) => c[1].type === SupervisionLiveEventType.RESOLVED && c[1].requestId === requestId)
        .map((c) => c[0]);
      expect(resolvedTargets.sort()).toEqual([2, 3]);
      expect(service.listPendingForSupervisor(2)).toHaveLength(0);
    });

    // Not being on the broadcast list is no longer decisive on its own — the resource gets the final
    // say, so that a global resources.update holder whose card the reader accepts can also approve.
    it('rejects approval from a supervisor the resource does not authorize', async () => {
      resourceUsageService.validateSupervisedStart.mockRejectedValueOnce(new ForbiddenException('nope'));
      const { requestId } = createReaderRequest();
      const stranger = { id: 9, username: 'stranger' } as User;

      await expect(service.approve(requestId, stranger)).rejects.toBeInstanceOf(ForbiddenException);
      expect(resourceUsageService.startSession).not.toHaveBeenCalled();
    });

    it('settleByCard closes the web popups without starting a session again', () => {
      const { requestId, onResolved, onFailed } = createReaderRequest();

      service.settleByCard(requestId);

      expect(resourceUsageService.startSession).not.toHaveBeenCalled();
      expect(onResolved).not.toHaveBeenCalled();
      expect(onFailed).not.toHaveBeenCalled();
      const resolvedTargets = live.emitToSupervisor.mock.calls
        .filter((c) => c[1].type === SupervisionLiveEventType.RESOLVED && c[1].requestId === requestId)
        .map((c) => c[0]);
      expect(resolvedTargets.sort()).toEqual([2, 3]);
      // A subsequent web approval is a no-op (already settled).
      expect(service.listPendingForSupervisor(2)).toHaveLength(0);
    });

    it('cancelReaderRequest expires the request and dismisses popups without failing callbacks', () => {
      const { requestId, onFailed } = createReaderRequest();

      service.cancelReaderRequest(requestId);

      expect(onFailed).not.toHaveBeenCalled();
      const expiredTargets = live.emitToSupervisor.mock.calls
        .filter((c) => c[1].type === SupervisionLiveEventType.EXPIRED && c[1].requestId === requestId)
        .map((c) => c[0]);
      expect(expiredTargets.sort()).toEqual([2, 3]);
    });

    it('notifies the reader (onFailed) when the request expires after 30s', () => {
      jest.useFakeTimers();
      const { onFailed } = createReaderRequest();

      jest.advanceTimersByTime(SupervisionService.APPROVAL_TTL_MS);

      expect(onFailed).toHaveBeenCalledWith(expect.any(RequestTimeoutException));
    });

    // ATT-867: a resource with no introducers falls back to the managers, who are then on the
    // broadcast list like anyone else — so they get the popup, can reject as well as approve, and
    // are named to the requester. A hidden fallback would have given them none of that.
    it('treats a stand-in manager as a full supervisor: SSE, approve and reject', async () => {
      const manager = { id: 42, username: 'manager' } as User;
      service.createReaderRequest({
        resourceId: 5,
        requester,
        dto: {},
        eligibleSupervisorIds: [manager.id],
        callbacks: { onResolved: jest.fn(), onFailed: jest.fn() },
      });

      const requestId = live.emitToSupervisor.mock.calls.find(
        (c) => c[1].type === SupervisionLiveEventType.REQUESTED,
      )?.[1].requestId as string;
      // Popped over SSE, and visible on reconnect — no special-casing needed on the pull.
      expect(live.emitToSupervisor).toHaveBeenCalledWith(manager.id, expect.objectContaining({ requestId }));
      expect(service.listPendingForSupervisor(manager.id)).toHaveLength(1);
      // Nobody else sees it.
      expect(service.listPendingForSupervisor(7)).toHaveLength(0);

      // Rejecting used to 403 for a manager, silently leaving the requester to wait out the TTL.
      expect(service.reject(requestId, manager)).toEqual({ status: 'rejected', requestId });
      expect(service.listPendingForSupervisor(manager.id)).toHaveLength(0);
    });

    it('lets a stand-in manager approve', async () => {
      const manager = { id: 42, username: 'manager' } as User;
      const { requestId } = service.createReaderRequest({
        resourceId: 5,
        requester,
        dto: {},
        eligibleSupervisorIds: [manager.id],
        callbacks: { onResolved: jest.fn(), onFailed: jest.fn() },
      });

      await service.approve(requestId, manager);

      expect(resourceUsageService.startSession).toHaveBeenCalledWith(5, requester, {}, { supervisorUserId: 42 });
    });
  });

  describe('web-initiated reader requests (ATT-816)', () => {
    let armer: { arm: jest.Mock };
    let readerCallbacks: { onResolved: jest.Mock; onFailed: jest.Mock };
    const readerDto: RequestSupervisedSessionDto = { readerId: 7, notes: 'at the machine' };

    beforeEach(() => {
      readerCallbacks = { onResolved: jest.fn(), onFailed: jest.fn() };
      armer = { arm: jest.fn().mockResolvedValue(readerCallbacks) };
      service.setReaderArmer(armer);
    });

    const requestAtReader = async () => {
      const pending = service.requestSupervisedSession(5, requester, readerDto);
      pending.catch(() => undefined);
      await flush();
      const requestedEvent = live.emitToSupervisor.mock.calls.find(
        (c) => c[1].type === SupervisionLiveEventType.REQUESTED,
      );
      return { pending, requestId: requestedEvent?.[1].requestId as string };
    };

    it('arms the reader and broadcasts to every eligible supervisor except the requester', async () => {
      const { requestId } = await requestAtReader();

      expect(armer.arm).toHaveBeenCalledWith({
        readerId: 7,
        resourceId: 5,
        requester,
        requestId,
      });
      const notified = live.emitToSupervisor.mock.calls
        .filter((c) => c[1].type === SupervisionLiveEventType.REQUESTED)
        .map((c) => c[0]);
      expect(notified.sort()).toEqual([2, 3]);
    });

    it('starts the session and resolves the requester when a supervisor taps at the reader', async () => {
      const { pending, requestId } = await requestAtReader();

      await service.approve(requestId, supervisor);

      await expect(pending).resolves.toBe(startedSession);
      expect(resourceUsageService.startSession).toHaveBeenCalledWith(5, requester, readerDto, {
        supervisorUserId: 2,
      });
      // The reader is told through the callbacks the armer handed back.
      expect(readerCallbacks.onResolved).toHaveBeenCalledWith(startedSession, { id: 2, username: 'supervisor' });
    });

    it('fails the waiting requester when the reader cancels, instead of hanging', async () => {
      const { pending, requestId } = await requestAtReader();

      service.cancelReaderRequest(requestId);

      await expect(pending).rejects.toBeInstanceOf(RequestTimeoutException);
    });

    it('times the requester out after 30s', async () => {
      // The reader path awaits validation, eligibility and arming before the timer is armed, so the
      // request must be fully created before time is advanced — keep setImmediate real to flush it.
      jest.useFakeTimers({ doNotFake: ['setImmediate'] });
      const pending = service.requestSupervisedSession(5, requester, readerDto);
      pending.catch(() => undefined);
      await flush();

      jest.advanceTimersByTime(SupervisionService.APPROVAL_TTL_MS);

      await expect(pending).rejects.toBeInstanceOf(RequestTimeoutException);
      expect(readerCallbacks.onFailed).toHaveBeenCalled();
    });

    // ATT-867: the broadcast list holds introducers/maintainers only, so a resource whose sole
    // possible supervisor is a resource manager (the usual case for a freshly created machine, and
    // the requester is often that manager's only colleague) refused the request outright — even
    // though a manager can walk up to the reader and tap.
    it('arms the reader when only a resource manager could supervise', async () => {
      introducers.getMany.mockResolvedValue([{ userId: requester.id, user: {} }]);
      rbac.getUserIdsWithPermission.mockResolvedValue([requester.id, 42]);

      await requestAtReader();

      expect(armer.arm).toHaveBeenCalled();
    });

    // The managers are a fallback, not an addition: a resource that has introducers must not pop a
    // request at every admin.
    it('falls back to managers only when the resource has no introducer left', async () => {
      rbac.getUserIdsWithPermission.mockResolvedValue([requester.id, 42]);

      introducers.getMany.mockResolvedValue([{ userId: requester.id, user: {} }, { userId: 3, user: {} }]);
      expect(await service.getEligibleSupervisorIds(5, requester.id)).toEqual([3]);

      introducers.getMany.mockResolvedValue([{ userId: requester.id, user: {} }]);
      expect(await service.getEligibleSupervisorIds(5, requester.id)).toEqual([42]);
    });

    // The grant outlives the account, so the sole introducer having left must not hold off the
    // fallback and broadcast the request to a user who cannot log in (`user` is null once the
    // account is soft-deleted).
    it('ignores an introducer whose account was deleted', async () => {
      rbac.getUserIdsWithPermission.mockResolvedValue([42]);
      introducers.getMany.mockResolvedValue([{ userId: 9, user: null }]);

      expect(await service.getEligibleSupervisorIds(5, requester.id)).toEqual([42]);
    });

    it('refuses when nobody but the requester could supervise', async () => {
      introducers.getMany.mockResolvedValue([{ userId: requester.id, user: {} }]);
      rbac.getUserIdsWithPermission.mockResolvedValue([requester.id]);

      await expect(service.requestSupervisedSession(5, requester, readerDto)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(armer.arm).not.toHaveBeenCalled();
    });

    it('rejects when neither channel is given', async () => {
      await expect(service.requestSupervisedSession(5, requester, {})).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects when both channels are given', async () => {
      await expect(
        service.requestSupervisedSession(5, requester, { supervisorUserId: 2, readerId: 7 }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    // Review finding: settleByCard cleared the expiry timer but only marked the request settled, so
    // a web-initiated caller waited forever. Reachable whenever the reader starts a session on its
    // own during the window — old firmware ignoring the arm, or a tap already in flight.
    it('fails the waiting requester when the reader starts a session of its own instead', async () => {
      const { pending, requestId } = await requestAtReader();

      service.settleByCard(requestId);

      await expect(pending).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('refuses a second reader arm while one is already waiting', async () => {
      await requestAtReader();

      await expect(service.requestSupervisedSession(5, requester, { readerId: 9 })).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    // The guard exists to stop someone deliberately claiming several screens, and that person fires
    // requests in parallel rather than one after another — the case the sequential test never covers.
    it('refuses concurrent reader arms from the same requester', async () => {
      const rejections: unknown[] = [];
      // The winner's promise stays pending by design (it is waiting for approval), so collect
      // rejections as they land rather than awaiting all three.
      [7, 8, 9].forEach((readerId) => {
        service.requestSupervisedSession(5, requester, { readerId }).catch((error) => rejections.push(error));
      });
      await flush();

      expect(armer.arm).toHaveBeenCalledTimes(1);
      expect(rejections).toHaveLength(2);
      expect(rejections[0]).toBeInstanceOf(ConflictException);
    });

    // Arming can take seconds (ACK retries). The request has to be resolvable for that whole window,
    // or a disconnect/tap during it hits an empty map and no-ops, stranding the requester for the TTL.
    it('settles a request cancelled while the reader was still being armed', async () => {
      let capturedId: string | undefined;
      armer.arm.mockImplementationOnce(async ({ requestId }: { requestId: string }) => {
        capturedId = requestId;
        // Stands in for the reader disconnecting mid-arm.
        service.cancelReaderRequest(requestId);
        return readerCallbacks;
      });

      const pending = service.requestSupervisedSession(5, requester, { readerId: 7 });

      await expect(pending).rejects.toBeInstanceOf(RequestTimeoutException);
      expect(capturedId).toBeDefined();
      // The reader is told to stop waiting rather than being left on a live-looking screen.
      expect(readerCallbacks.onFailed).toHaveBeenCalled();
    });

    it('unwinds the registration when arming fails, so the requester can try again', async () => {
      armer.arm.mockRejectedValueOnce(new BadRequestException('The selected reader is offline'));

      await expect(service.requestSupervisedSession(5, requester, { readerId: 7 })).rejects.toBeInstanceOf(
        BadRequestException,
      );

      // No orphan left behind: a retry is not blocked by the one-arm-per-requester guard.
      await expect(requestAtReader()).resolves.toBeDefined();
    });

    // The reader accepts a global resources.update holder's card (validateSupervisedStart does), but
    // they are not in the broadcast list — so approval has to accept them too, or the card beeps
    // success and then nothing happens.
    it('accepts an approval from an authorized supervisor who was not broadcast to', async () => {
      const { pending, requestId } = await requestAtReader();
      const globalManager = { id: 99, username: 'admin' } as User;

      await service.approve(requestId, globalManager);

      await expect(pending).resolves.toBe(startedSession);
      expect(resourceUsageService.validateSupervisedStart).toHaveBeenCalledWith(5, requester, 99);
    });

    // The authorization fallback hits the DB, which is long enough for the 30s timer to fire. If it
    // does, the request has already been failed for both the requester and the reader — starting a
    // session anyway would leave a physical machine unlocked with nobody aware of it.
    it('does not start a session when the request expires during the authorization check', async () => {
      const { pending, requestId } = await requestAtReader();
      const globalManager = { id: 99, username: 'admin' } as User;
      resourceUsageService.validateSupervisedStart.mockImplementationOnce(async () => {
        service.cancelReaderRequest(requestId); // stands in for expire() firing mid-query
      });

      await expect(service.approve(requestId, globalManager)).rejects.toBeInstanceOf(NotFoundException);
      expect(resourceUsageService.startSession).not.toHaveBeenCalled();
      await expect(pending).rejects.toBeInstanceOf(RequestTimeoutException);
    });

    it('still refuses an approval from someone the resource does not authorize', async () => {
      resourceUsageService.validateSupervisedStart.mockRejectedValueOnce(new ForbiddenException('nope'));
      const { requestId } = await requestAtReader();
      const stranger = { id: 98, username: 'stranger' } as User;

      await expect(service.approve(requestId, stranger)).rejects.toBeInstanceOf(ForbiddenException);
      expect(resourceUsageService.startSession).not.toHaveBeenCalled();
    });

    it('rejects before arming when the resource has no other eligible supervisor', async () => {
      introducers.getMany.mockResolvedValueOnce([{ userId: requester.id, user: {} }]);

      await expect(service.requestSupervisedSession(5, requester, readerDto)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(armer.arm).not.toHaveBeenCalled();
    });

    it('propagates an arming failure (offline/busy reader) without leaving a pending request', async () => {
      armer.arm.mockRejectedValueOnce(new BadRequestException('The selected reader is offline'));

      await expect(service.requestSupervisedSession(5, requester, readerDto)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(live.emitToSupervisor).not.toHaveBeenCalled();
    });
  });
});
