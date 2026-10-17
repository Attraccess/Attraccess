import { SupervisionMode, User } from '@attraccess/database-entities';
import { AuthenticatedWebSocket } from '../../websocket.types';
import { AttractapSupervisionHandler } from './supervision.handler';

export type SocketState = AuthenticatedWebSocket['state'];
export function registerAttractapSupervisionHandlerFixture() {
  let handler: AttractapSupervisionHandler;

  let attractapService: { findReaderById: jest.Mock; getNFCCardByUID: jest.Mock };

  let websocketService: { sockets: Map<string, AuthenticatedWebSocket> };

  let resourceUsageService: { getActiveSession: jest.Mock; validateSupervisedStart: jest.Mock };

  let supervisionService: {
    setReaderArmer: jest.Mock;
    approve: jest.Mock;
    cancelReaderRequest: jest.Mock;
    getEligibleSupervisorIds: jest.Mock;
    createReaderRequest: jest.Mock;
  };

  let usersService: { findOne: jest.Mock };

  let resourceRepository: { findOne: jest.Mock };

  const requester = { id: 1, username: 'requester' } as User;

  const READER_ID = 3;

  const RESOURCE_ID = 42;

  const makeSocket = (state: Partial<SocketState> = {}): AuthenticatedWebSocket =>
    ({
      id: 'socket-1',
      readerId: READER_ID,
      sendMessage: jest.fn().mockResolvedValue(true),
      state: {
        lastAuthenticatedUserId: null,
        enrollNewCardData: null,
        resetNfcCardData: null,
        supervisionFlow: null,
        ...state,
      },
    }) as unknown as AuthenticatedWebSocket;

  const arm = () =>
    // The armer is registered on module init; go through the same port the service uses.
    (handler as unknown as { armReader: (p: unknown) => Promise<unknown> }).armReader({
      readerId: READER_ID,
      resourceId: RESOURCE_ID,
      requester,
      requestId: 'req-1',
    });

  beforeEach(() => {
    attractapService = {
      findReaderById: jest.fn().mockResolvedValue({
        id: READER_ID,
        firmware: { capabilities: { cardEnrollment: true } },
        resources: [{ id: RESOURCE_ID }],
      }),
      getNFCCardByUID: jest.fn().mockResolvedValue({
        isActive: true,
        keyNo: 1,
        key: 'secret',
        user: { id: 2, username: 'supervisor' },
      }),
    };
    websocketService = { sockets: new Map() };
    resourceUsageService = {
      getActiveSession: jest.fn().mockResolvedValue(null),
      validateSupervisedStart: jest.fn().mockResolvedValue(undefined),
    };
    supervisionService = {
      setReaderArmer: jest.fn(),
      approve: jest.fn().mockResolvedValue({ id: 7 }),
      cancelReaderRequest: jest.fn(),
      getEligibleSupervisorIds: jest.fn().mockResolvedValue([2]),
      createReaderRequest: jest.fn().mockReturnValue({ requestId: 'req-1', expiresAt: new Date(0) }),
    };
    usersService = { findOne: jest.fn().mockResolvedValue({ id: 2, username: 'supervisor' }) };
    resourceRepository = {
      findOne: jest.fn().mockResolvedValue({ id: RESOURCE_ID, supervisionMode: SupervisionMode.SUPERVISION_REQUIRED }),
    };

    handler = new AttractapSupervisionHandler();
    Object.assign(handler, {
      attractapService,
      websocketService,
      resourceUsageService,
      supervisionService,
      usersService,
      resourceRepository,
    });
  });
  return {
    get handler() {
      return handler;
    },
    get attractapService() {
      return attractapService;
    },
    get websocketService() {
      return websocketService;
    },
    get resourceUsageService() {
      return resourceUsageService;
    },
    get supervisionService() {
      return supervisionService;
    },
    get usersService() {
      return usersService;
    },
    get resourceRepository() {
      return resourceRepository;
    },
    get requester() {
      return requester;
    },
    get READER_ID() {
      return READER_ID;
    },
    get RESOURCE_ID() {
      return RESOURCE_ID;
    },
    get makeSocket() {
      return makeSocket;
    },
    get arm() {
      return arm;
    },
  };
}
