import { registerSupervisionServiceFixture } from './supervision.service.supervision-service.test-fixture';
import { RequestTimeoutException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { SupervisionService } from './supervision.service';
import { SupervisionLiveEventType } from './dtos/supervisionLiveEvent.dto';
import { User } from '@attraccess/database-entities';

export function registerAllowsMultipleParallelPendingRequestsForTheSameSupervisorNoLimitCases(
  fixture: ReturnType<typeof registerSupervisionServiceFixture>,
) {
  it('allows multiple parallel pending requests for the same supervisor (no limit)', async () => {
    await fixture.createRequest();
    await fixture.createRequest();

    expect(fixture.service.listPendingForSupervisor(2)).toHaveLength(2);
  });
}

export function registerExpiresTheRequestAfter30sAndTimesOutTheRequesterCases(
  fixture: ReturnType<typeof registerSupervisionServiceFixture>,
) {
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
}

export function registerPropagatesAFailedSessionStartToBothSupervisorAndRequesterCases(
  fixture: ReturnType<typeof registerSupervisionServiceFixture>,
) {
  it('propagates a failed session start to both supervisor and requester', async () => {
    fixture.resourceUsageService.startSession.mockRejectedValueOnce(new Error('resource in use'));
    const { pending, requestId } = await fixture.createRequest();

    await expect(fixture.service.approve(requestId, fixture.supervisor)).rejects.toThrow('resource in use');
    await expect(pending).rejects.toThrow('resource in use');
  });
}

export function registerPropagatesValidationErrorsWithoutCreatingAPendingRequestCases(
  fixture: ReturnType<typeof registerSupervisionServiceFixture>,
) {
  it('propagates validation errors without creating a pending request', async () => {
    fixture.resourceUsageService.validateSupervisedStart.mockRejectedValueOnce(new ForbiddenException('nope'));

    await expect(fixture.service.requestSupervisedSession(5, fixture.requester, fixture.dto)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(fixture.service.listPendingForSupervisor(2)).toHaveLength(0);
    expect(fixture.live.emitToSupervisor).not.toHaveBeenCalled();
  });
}

export function registerRejectsApprovalFromSomeoneOtherThanTheRequestedSupervisorCases(
  fixture: ReturnType<typeof registerSupervisionServiceFixture>,
) {
  it('rejects approval from someone other than the requested supervisor', async () => {
    const { requestId } = await fixture.createRequest();
    const stranger = { id: 3, username: 'stranger' } as User;

    await expect(fixture.service.approve(requestId, stranger)).rejects.toBeInstanceOf(ForbiddenException);
    expect(fixture.resourceUsageService.startSession).not.toHaveBeenCalled();
    // the request remains pending for the real supervisor
    expect(fixture.service.listPendingForSupervisor(2)).toHaveLength(1);
  });
}

export function registerRejectsTheRequesterWhenTheSupervisorRejectsTheRequestCases(
  fixture: ReturnType<typeof registerSupervisionServiceFixture>,
) {
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
}

export function registerStartsTheSessionOnApprovalAndResolvesTheRequesterCases(
  fixture: ReturnType<typeof registerSupervisionServiceFixture>,
) {
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
}

export function registerThrowsNotFoundForAnUnknownOrAlreadySettledRequestCases(
  fixture: ReturnType<typeof registerSupervisionServiceFixture>,
) {
  it('throws NotFound for an unknown or already-settled request', async () => {
    await expect(fixture.service.approve('does-not-exist', fixture.supervisor)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(() => fixture.service.reject('does-not-exist', fixture.supervisor)).toThrow(NotFoundException);
  });
}

export function registerValidatesEagerlyAndEmitsARequestedEventToTheSelectedSupervisorCases(
  fixture: ReturnType<typeof registerSupervisionServiceFixture>,
) {
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
}
