import { registerSupervisionServiceFixture } from './supervision.service.supervision-service.test-fixture';
import {
  RequestTimeoutException,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { SupervisionService } from './supervision.service';
import { SupervisionLiveEventType } from './dtos/supervisionLiveEvent.dto';
import { User, ResourceIntroducerType } from '@attraccess/database-entities';
import { RequestSupervisedSessionDto } from './dtos/requestSupervisedSession.dto';

describe('SupervisionService', () => {
  const fixture = registerSupervisionServiceFixture();

  it('validates eagerly and emits a REQUESTED event to the selected supervisor', async () => {
    const { requestId } = await fixture.createRequest();

    expect(fixture.resourceUsageService.validateSupervisedStart).toHaveBeenCalledWith(5, fixture.requester, 2);
    expect(requestId).toBeDefined();

    const [supervisorId, event] = fixture.live.emitToSupervisor.mock.calls[0];
    expect(supervisorId).toBe(2);
    expect(event).toMatchObject({
      type: SupervisionLiveEventType.REQUESTED,
      requestId,
      request: expect.objectContaining({
        resourceId: 5,
        requesterUserId: 1,
        supervisorUserId: 2,
        notes: 'please supervise',
      }),
    });
  });

  it('propagates validation errors without creating a pending request', async () => {
    fixture.resourceUsageService.validateSupervisedStart.mockRejectedValueOnce(new ForbiddenException('nope'));

    await expect(fixture.service.requestSupervisedSession(5, fixture.requester, fixture.dto)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(fixture.service.listPendingForSupervisor(2)).toHaveLength(0);
    expect(fixture.live.emitToSupervisor).not.toHaveBeenCalled();
  });

  it('starts the session on approval and resolves the requester', async () => {
    const { pending, requestId } = await fixture.createRequest();

    const approved = await fixture.service.approve(requestId, fixture.supervisor, 'api-token', 9);

    expect(fixture.resourceUsageService.startSession).toHaveBeenCalledWith(5, fixture.requester, fixture.dto, {
      supervisorUserId: 2,
      auditOrigin: { actorId: 2, authenticationMethod: 'api-token', apiTokenId: 9 },
    });
    expect(approved).toBe(fixture.startedSession);
    await expect(pending).resolves.toBe(fixture.startedSession);
    expect(fixture.service.listPendingForSupervisor(2)).toHaveLength(0);
    expect(fixture.live.emitToSupervisor.mock.calls.some((c) => c[1].type === SupervisionLiveEventType.RESOLVED)).toBe(
      true,
    );
    expect(fixture.audit.recordResource).toHaveBeenCalledWith({
      action: 'supervision.approved',
      actorId: 2,
      authenticationMethod: 'api-token',
      apiTokenId: 9,
      subjectId: 5,
      details: expect.objectContaining({ requesterUserId: 1, supervisorUserId: 2 }),
    });
  });

  it('rejects the requester when the supervisor rejects the request', async () => {
    const { pending, requestId } = await fixture.createRequest();

    const result = fixture.service.reject(requestId, fixture.supervisor, 'api-token', 9);

    expect(result).toEqual({ status: 'rejected', requestId });
    await expect(pending).rejects.toBeInstanceOf(ForbiddenException);
    expect(fixture.resourceUsageService.startSession).not.toHaveBeenCalled();
    expect(fixture.live.emitToSupervisor.mock.calls.some((c) => c[1].type === SupervisionLiveEventType.REJECTED)).toBe(
      true,
    );
    expect(fixture.audit.recordResource).toHaveBeenCalledWith({
      action: 'supervision.rejected',
      actorId: 2,
      authenticationMethod: 'api-token',
      apiTokenId: 9,
      subjectId: 5,
      details: expect.objectContaining({ requesterUserId: 1, supervisorUserId: 2 }),
    });
  });

  it('expires the request after 30s and times out the requester', async () => {
    jest.useFakeTimers();
    const pending = fixture.service.requestSupervisedSession(5, fixture.requester, fixture.dto);
    pending.catch(() => undefined);
    await Promise.resolve();

    jest.advanceTimersByTime(SupervisionService.APPROVAL_TTL_MS);

    await expect(pending).rejects.toBeInstanceOf(RequestTimeoutException);
    expect(fixture.service.listPendingForSupervisor(2)).toHaveLength(0);

    const expiredEvent = fixture.live.emitToSupervisor.mock.calls.find(
      (c) => c[1].type === SupervisionLiveEventType.EXPIRED,
    );
    expect(expiredEvent).toBeDefined();
  });

  it('rejects approval from someone other than the requested supervisor', async () => {
    const { requestId } = await fixture.createRequest();
    const stranger = { id: 3, username: 'stranger' } as User;

    await expect(fixture.service.approve(requestId, stranger)).rejects.toBeInstanceOf(ForbiddenException);
    expect(fixture.resourceUsageService.startSession).not.toHaveBeenCalled();
    // the request remains pending for the real supervisor
    expect(fixture.service.listPendingForSupervisor(2)).toHaveLength(1);
  });

  it('throws NotFound for an unknown or already-settled request', async () => {
    await expect(fixture.service.approve('does-not-exist', fixture.supervisor)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(() => fixture.service.reject('does-not-exist', fixture.supervisor)).toThrow(NotFoundException);
  });

  it('propagates a failed session start to both supervisor and requester', async () => {
    fixture.resourceUsageService.startSession.mockRejectedValueOnce(new Error('resource in use'));
    const { pending, requestId } = await fixture.createRequest();

    await expect(fixture.service.approve(requestId, fixture.supervisor)).rejects.toThrow('resource in use');
    await expect(pending).rejects.toThrow('resource in use');
  });

  it('allows multiple parallel pending requests for the same supervisor (no limit)', async () => {
    await fixture.createRequest();
    await fixture.createRequest();

    expect(fixture.service.listPendingForSupervisor(2)).toHaveLength(2);
  });

  describe('reader-originated requests (ATT-493)', () => {
    const eligibleSupervisorIds = [2, 3];

    const createReaderRequest = (overrides?: { onResolved?: jest.Mock; onFailed?: jest.Mock }) => {
      const onResolved = overrides?.onResolved ?? jest.fn();
      const onFailed = overrides?.onFailed ?? jest.fn();
      const { requestId, expiresAt } = fixture.service.createReaderRequest({
        resourceId: 5,
        requester: fixture.requester,
        dto: {},
        eligibleSupervisorIds,
        callbacks: { onResolved, onFailed },
      });
      return { requestId, expiresAt, onResolved, onFailed };
    };

    it('broadcasts a REQUESTED event to every eligible supervisor', () => {
      const { requestId } = createReaderRequest();

      const requestedTargets = fixture.live.emitToSupervisor.mock.calls
        .filter((c) => c[1].type === SupervisionLiveEventType.REQUESTED && c[1].requestId === requestId)
        .map((c) => c[0]);
      expect(requestedTargets.sort()).toEqual([2, 3]);
      // The pending request is visible to either supervisor (initial SSE state on reconnect).
      expect(fixture.service.listPendingForSupervisor(2)).toHaveLength(1);
      expect(fixture.service.listPendingForSupervisor(3)).toHaveLength(1);
    });

    it('lets any eligible supervisor approve: starts the session and notifies the reader + all popups', async () => {
      const { requestId, onResolved } = createReaderRequest();
      const otherSupervisor = { id: 3, username: 'other' } as User;

      const session = await fixture.service.approve(requestId, otherSupervisor);

      expect(fixture.resourceUsageService.startSession).toHaveBeenCalledWith(
        5,
        fixture.requester,
        {},
        {
          supervisorUserId: 3,
          auditOrigin: { actorId: 3, authenticationMethod: 'session' },
        },
      );
      expect(session).toBe(fixture.startedSession);
      expect(onResolved).toHaveBeenCalledWith(fixture.startedSession, { id: 3, username: 'other' });
      const resolvedTargets = fixture.live.emitToSupervisor.mock.calls
        .filter((c) => c[1].type === SupervisionLiveEventType.RESOLVED && c[1].requestId === requestId)
        .map((c) => c[0]);
      expect(resolvedTargets.sort()).toEqual([2, 3]);
      expect(fixture.service.listPendingForSupervisor(2)).toHaveLength(0);
    });

    it('rejects approval from a non-introducer who did not receive the request', async () => {
      const { requestId } = createReaderRequest();
      const stranger = { id: 9, username: 'stranger' } as User;
      fixture.resourceUsageService.validateSupervisedStart.mockRejectedValueOnce(
        new ForbiddenException('not an introducer'),
      );

      await expect(fixture.service.approve(requestId, stranger)).rejects.toBeInstanceOf(ForbiddenException);
      expect(fixture.resourceUsageService.startSession).not.toHaveBeenCalled();
    });

    it('allows an introducer granted after the request was broadcast to approve', async () => {
      const { requestId, onResolved } = createReaderRequest();
      const newlyGrantedIntroducer = { id: 9, username: 'new-introducer' } as User;

      const session = await fixture.service.approve(requestId, newlyGrantedIntroducer);

      expect(fixture.resourceUsageService.validateSupervisedStart).toHaveBeenCalledWith(5, fixture.requester, 9);
      expect(fixture.resourceUsageService.startSession).toHaveBeenCalledWith(
        5,
        fixture.requester,
        {},
        {
          supervisorUserId: 9,
          auditOrigin: { actorId: 9, authenticationMethod: 'session' },
        },
      );
      expect(session).toBe(fixture.startedSession);
      expect(onResolved).toHaveBeenCalledWith(fixture.startedSession, { id: 9, username: 'new-introducer' });
    });

    it('settleByCard closes the web popups without starting a session again', () => {
      const { requestId, onResolved, onFailed } = createReaderRequest();

      fixture.service.settleByCard(requestId);

      expect(fixture.resourceUsageService.startSession).not.toHaveBeenCalled();
      expect(onResolved).not.toHaveBeenCalled();
      expect(onFailed).not.toHaveBeenCalled();
      const resolvedTargets = fixture.live.emitToSupervisor.mock.calls
        .filter((c) => c[1].type === SupervisionLiveEventType.RESOLVED && c[1].requestId === requestId)
        .map((c) => c[0]);
      expect(resolvedTargets.sort()).toEqual([2, 3]);
      // A subsequent web approval is a no-op (already settled).
      expect(fixture.service.listPendingForSupervisor(2)).toHaveLength(0);
    });

    it('cancelReaderRequest expires the request and dismisses popups without failing callbacks', () => {
      const { requestId, onFailed } = createReaderRequest();

      fixture.service.cancelReaderRequest(requestId);

      expect(onFailed).not.toHaveBeenCalled();
      const expiredTargets = fixture.live.emitToSupervisor.mock.calls
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
  });

  describe('web-initiated reader requests (ATT-816)', () => {
    let armer: { arm: jest.Mock };
    let readerCallbacks: { onResolved: jest.Mock; onFailed: jest.Mock };
    const readerDto: RequestSupervisedSessionDto = { readerId: 7, notes: 'at the machine' };

    beforeEach(() => {
      readerCallbacks = { onResolved: jest.fn(), onFailed: jest.fn() };
      armer = { arm: jest.fn().mockResolvedValue(readerCallbacks) };
      fixture.service.setReaderArmer(armer);
    });

    const requestAtReader = async () => {
      const pending = fixture.service.requestSupervisedSession(5, fixture.requester, readerDto);
      pending.catch(() => undefined);
      await fixture.flush();
      const requestedEvent = fixture.live.emitToSupervisor.mock.calls.find(
        (c) => c[1].type === SupervisionLiveEventType.REQUESTED,
      );
      return { pending, requestId: requestedEvent?.[1].requestId as string };
    };

    it('arms the reader and broadcasts to every eligible supervisor except the requester', async () => {
      const { requestId } = await requestAtReader();

      expect(armer.arm).toHaveBeenCalledWith({
        readerId: 7,
        resourceId: 5,
        requester: fixture.requester,
        requestId,
      });
      const notified = fixture.live.emitToSupervisor.mock.calls
        .filter((c) => c[1].type === SupervisionLiveEventType.REQUESTED)
        .map((c) => c[0]);
      expect(notified.sort()).toEqual([2, 3]);
    });

    it('starts the session and resolves the requester when a supervisor taps at the reader', async () => {
      const { pending, requestId } = await requestAtReader();

      await fixture.service.approve(requestId, fixture.supervisor);

      await expect(pending).resolves.toBe(fixture.startedSession);
      expect(fixture.resourceUsageService.startSession).toHaveBeenCalledWith(5, fixture.requester, readerDto, {
        supervisorUserId: 2,
        auditOrigin: { actorId: 2, authenticationMethod: 'session' },
      });
      // The reader is told through the callbacks the armer handed back.
      expect(readerCallbacks.onResolved).toHaveBeenCalledWith(fixture.startedSession, {
        id: 2,
        username: 'supervisor',
      });
    });

    it('fails the waiting requester when the reader cancels, instead of hanging', async () => {
      const { pending, requestId } = await requestAtReader();

      fixture.service.cancelReaderRequest(requestId);

      await expect(pending).rejects.toBeInstanceOf(RequestTimeoutException);
    });

    it('times the requester out after 30s', async () => {
      // The reader path awaits validation, eligibility and arming before the timer is armed, so the
      // request must be fully created before time is advanced — keep setImmediate real to flush it.
      jest.useFakeTimers({ doNotFake: ['setImmediate'] });
      const pending = fixture.service.requestSupervisedSession(5, fixture.requester, readerDto);
      pending.catch(() => undefined);
      await fixture.flush();

      jest.advanceTimersByTime(SupervisionService.APPROVAL_TTL_MS);

      await expect(pending).rejects.toBeInstanceOf(RequestTimeoutException);
      expect(readerCallbacks.onFailed).toHaveBeenCalled();
    });

    it('does not arm the reader when only a resource manager could supervise', async () => {
      fixture.introducers.getMany.mockResolvedValue([{ userId: fixture.requester.id, user: {} }]);

      await expect(fixture.service.requestSupervisedSession(5, fixture.requester, readerDto)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(armer.arm).not.toHaveBeenCalled();
    });

    it('returns applicable introducers only, excluding the requester', async () => {
      fixture.introducers.getMany.mockResolvedValue([
        { userId: fixture.requester.id, user: {} },
        { userId: 3, user: {}, type: ResourceIntroducerType.INTRODUCER },
      ]);
      expect(await fixture.service.getEligibleSupervisorIds(5, fixture.requester.id)).toEqual([3]);
      expect(fixture.introducers.getMany).toHaveBeenCalledWith(5, ResourceIntroducerType.INTRODUCER);
    });

    it('ignores a deleted introducer without falling back to managers', async () => {
      fixture.introducers.getMany.mockResolvedValue([{ userId: 9, user: null }]);

      expect(await fixture.service.getEligibleSupervisorIds(5, fixture.requester.id)).toEqual([]);
    });

    it('refuses when nobody but the requester could supervise', async () => {
      fixture.introducers.getMany.mockResolvedValue([{ userId: fixture.requester.id, user: {} }]);

      await expect(fixture.service.requestSupervisedSession(5, fixture.requester, readerDto)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(armer.arm).not.toHaveBeenCalled();
    });

    it('rejects when neither channel is given', async () => {
      await expect(fixture.service.requestSupervisedSession(5, fixture.requester, {})).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rejects when both channels are given', async () => {
      await expect(
        fixture.service.requestSupervisedSession(5, fixture.requester, { supervisorUserId: 2, readerId: 7 }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    // Review finding: settleByCard cleared the expiry timer but only marked the request settled, so
    // a web-initiated caller waited forever. Reachable whenever the reader starts a session on its
    // own during the window — old firmware ignoring the arm, or a tap already in flight.
    it('fails the waiting requester when the reader starts a session of its own instead', async () => {
      const { pending, requestId } = await requestAtReader();

      fixture.service.settleByCard(requestId);

      await expect(pending).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('refuses a second reader arm while one is already waiting', async () => {
      await requestAtReader();

      await expect(
        fixture.service.requestSupervisedSession(5, fixture.requester, { readerId: 9 }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    // The guard exists to stop someone deliberately claiming several screens, and that person fires
    // requests in parallel rather than one after another — the case the sequential test never covers.
    it('refuses concurrent reader arms from the same requester', async () => {
      const rejections: unknown[] = [];
      // The winner's promise stays pending by design (it is waiting for approval), so collect
      // rejections as they land rather than awaiting all three.
      [7, 8, 9].forEach((readerId) => {
        fixture.service
          .requestSupervisedSession(5, fixture.requester, { readerId })
          .catch((error) => rejections.push(error));
      });
      await fixture.flush();

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
        fixture.service.cancelReaderRequest(requestId);
        return readerCallbacks;
      });

      const pending = fixture.service.requestSupervisedSession(5, fixture.requester, { readerId: 7 });

      await expect(pending).rejects.toBeInstanceOf(RequestTimeoutException);
      expect(capturedId).toBeDefined();
      // The reader is told to stop waiting rather than being left on a live-looking screen.
      expect(readerCallbacks.onFailed).toHaveBeenCalled();
    });

    it('unwinds the registration when arming fails, so the requester can try again', async () => {
      armer.arm.mockRejectedValueOnce(new BadRequestException('The selected reader is offline'));

      await expect(
        fixture.service.requestSupervisedSession(5, fixture.requester, { readerId: 7 }),
      ).rejects.toBeInstanceOf(BadRequestException);

      // No orphan left behind: a retry is not blocked by the one-arm-per-requester guard.
      await expect(requestAtReader()).resolves.toBeDefined();
    });

    it('rejects a resource manager who is not an introducer', async () => {
      const { requestId } = await requestAtReader();
      const globalManager = { id: 99, username: 'admin' } as User;
      fixture.resourceUsageService.validateSupervisedStart.mockRejectedValueOnce(
        new ForbiddenException('not an introducer'),
      );

      await expect(fixture.service.approve(requestId, globalManager)).rejects.toBeInstanceOf(ForbiddenException);
      expect(fixture.resourceUsageService.startSession).not.toHaveBeenCalled();
    });

    it('rejects before arming when the resource has no other eligible supervisor', async () => {
      fixture.introducers.getMany.mockResolvedValueOnce([{ userId: fixture.requester.id, user: {} }]);

      await expect(fixture.service.requestSupervisedSession(5, fixture.requester, readerDto)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(armer.arm).not.toHaveBeenCalled();
    });

    it('propagates an arming failure (offline/busy reader) without leaving a pending request', async () => {
      armer.arm.mockRejectedValueOnce(new BadRequestException('The selected reader is offline'));

      await expect(fixture.service.requestSupervisedSession(5, fixture.requester, readerDto)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(fixture.live.emitToSupervisor).not.toHaveBeenCalled();
    });
  });
});
