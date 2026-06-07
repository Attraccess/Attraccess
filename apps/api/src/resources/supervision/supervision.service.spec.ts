import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException, RequestTimeoutException } from '@nestjs/common';
import { ResourceUsage, User } from '@attraccess/database-entities';
import { SupervisionService } from './supervision.service';
import { SupervisionLiveService } from './supervision-live.service';
import { ResourceUsageService } from '../usage/resourceUsage.service';
import { RequestSupervisedSessionDto } from './dtos/requestSupervisedSession.dto';
import { SupervisionLiveEventType } from './dtos/supervisionLiveEvent.dto';

// Lets pending request promises settle/flush without depending on real timers.
const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('SupervisionService', () => {
  let service: SupervisionService;
  let resourceUsageService: { validateSupervisedStart: jest.Mock; startSession: jest.Mock };
  let live: { emitToSupervisor: jest.Mock; getSupervisorSubject: jest.Mock };

  const requester: User = { id: 1, username: 'requester' } as User;
  const supervisor: User = { id: 2, username: 'supervisor' } as User;
  const dto: RequestSupervisedSessionDto = { supervisorUserId: 2, notes: 'please supervise' };
  const startedSession = { id: 99, resourceId: 5, userId: 1, supervisorUserId: 2 } as ResourceUsage;

  beforeEach(async () => {
    resourceUsageService = {
      validateSupervisedStart: jest.fn().mockResolvedValue(undefined),
      startSession: jest.fn().mockResolvedValue(startedSession),
    };
    live = {
      emitToSupervisor: jest.fn(),
      getSupervisorSubject: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SupervisionService,
        { provide: ResourceUsageService, useValue: resourceUsageService },
        { provide: SupervisionLiveService, useValue: live },
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
});
