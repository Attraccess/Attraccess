import { ResourceUsage, User } from '@attraccess/database-entities';
import { Test, TestingModule } from '@nestjs/testing';
import { AuditService } from '../../audit/audit.service';
import { ResourceIntroducersService } from '../introducers/resourceIntroducers.service';
import { ResourceUsageService } from '../usage/sessions/resource-usage.service';
import { RequestSupervisedSessionDto } from './dtos/requestSupervisedSession.dto';
import { SupervisionLiveEventType } from './dtos/supervisionLiveEvent.dto';
import { SupervisionLiveService } from './supervision-live.service';
import { SupervisionService } from './supervision.service';

// Lets pending request promises settle/flush without depending on real timers.
const flush = () => new Promise((resolve) => setImmediate(resolve));
export function registerSupervisionServiceFixture() {
  let service: SupervisionService;

  let resourceUsageService: {
    validateSupervisedStart: jest.Mock;
    startSession: jest.Mock;
    assertSupportsSupervision: jest.Mock;
  };

  let introducers: { getMany: jest.Mock };

  let live: { emitToSupervisor: jest.Mock; getSupervisorSubject: jest.Mock };

  let audit: { recordResource: jest.Mock };

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
      getMany: jest.fn().mockResolvedValue([
        { userId: 1, user: {} },
        { userId: 2, user: {} },
        { userId: 3, user: {} },
      ]),
    };
    live = {
      emitToSupervisor: jest.fn(),
      getSupervisorSubject: jest.fn(),
    };
    audit = { recordResource: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SupervisionService,
        { provide: ResourceUsageService, useValue: resourceUsageService },
        { provide: ResourceIntroducersService, useValue: introducers },
        { provide: SupervisionLiveService, useValue: live },
        { provide: AuditService, useValue: audit },
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
  return {
    get flush() {
      return flush;
    },
    get service() {
      return service;
    },
    get resourceUsageService() {
      return resourceUsageService;
    },
    get introducers() {
      return introducers;
    },
    get live() {
      return live;
    },
    get audit() {
      return audit;
    },
    get requester() {
      return requester;
    },
    get supervisor() {
      return supervisor;
    },
    get dto() {
      return dto;
    },
    get startedSession() {
      return startedSession;
    },
    get createRequest() {
      return createRequest;
    },
  };
}
