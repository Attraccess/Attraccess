import { BadRequestException, ConflictException, ForbiddenException, RequestTimeoutException } from '@nestjs/common';
import { ResourceIntroducerType, User } from '@attraccess/database-entities';
import { SupervisionService } from './supervision.service';
import { RequestSupervisedSessionDto } from './dtos/requestSupervisedSession.dto';
import { SupervisionLiveEventType } from './dtos/supervisionLiveEvent.dto';
import { registerSupervisionServiceFixture } from './supervision.service.supervision-service.test-fixture';
export function registerWebInitiatedReaderRequestsAtt816Cases(
  fixture: ReturnType<typeof registerSupervisionServiceFixture>,
) {
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
}
