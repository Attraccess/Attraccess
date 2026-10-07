import { ForbiddenException, RequestTimeoutException } from '@nestjs/common';
import { User } from '@attraccess/database-entities';
import { SupervisionService } from './supervision.service';
import { SupervisionLiveEventType } from './dtos/supervisionLiveEvent.dto';
import { registerSupervisionServiceFixture } from './supervision.service.supervision-service.test-fixture';
export function registerReaderOriginatedRequestsAtt493Cases(
  fixture: ReturnType<typeof registerSupervisionServiceFixture>,
) {
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
}
