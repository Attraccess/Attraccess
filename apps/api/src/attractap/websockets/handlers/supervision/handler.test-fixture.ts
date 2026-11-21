import { SupervisionMode } from '@attraccess/application-models';
import { AuthenticatedWebSocket } from '../../websocket.types';
import type { CoreUser } from '../../../core-user';
import { AttractapSupervisionHandler } from './supervision.handler';

export type SocketState = AuthenticatedWebSocket['state'];
export function registerAttractapSupervisionHandlerFixture() {
  let handler: AttractapSupervisionHandler;

  let attractapService: { findReaderById: jest.Mock; getNFCCardByUID: jest.Mock };

  let websocketService: { sockets: Map<string, AuthenticatedWebSocket> };

  let resourceUsageService: { getActiveSessionsForResource: jest.Mock; validateSupervisedStart: jest.Mock };

  let supervisionService: {
    setReaderArmer: jest.Mock;
    approve: jest.Mock;
    cancelReaderRequest: jest.Mock;
    getEligibleSupervisorIds: jest.Mock;
    createReaderRequest: jest.Mock;
  };

  let usersService: { findOne: jest.Mock };

  let cardOperations: { verifyCard: jest.Mock };

  let resourceReads: { findResource: jest.Mock };

  const requester = { id: 1, username: 'requester', firstName: 'Rita', lastName: 'Requester' } as unknown as CoreUser;

  const READER_ID = 3;

  const RESOURCE_ID = 42;

  const makeSocket = (state: Partial<SocketState> = {}): AuthenticatedWebSocket =>
    ({
      id: 'socket-1',
      readerId: READER_ID,
      sendMessage: jest.fn().mockResolvedValue(true),
      state: {
        verifiedUserId: null,
        cardRelay: true,
        enrollment: null,
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
        pairingState: 'paired',
        firmware: { capabilities: { cardEnrollment: true } },
        resources: [{ id: RESOURCE_ID }],
      }),
      getNFCCardByUID: jest.fn(),
    };
    websocketService = { sockets: new Map() };
    resourceUsageService = {
      getActiveSessionsForResource: jest.fn().mockResolvedValue([]),
      validateSupervisedStart: jest.fn().mockResolvedValue(undefined),
    };
    supervisionService = {
      setReaderArmer: jest.fn(),
      approve: jest.fn().mockResolvedValue({ id: 7 }),
      cancelReaderRequest: jest.fn(),
      getEligibleSupervisorIds: jest.fn().mockResolvedValue([2]),
      createReaderRequest: jest.fn().mockReturnValue({ requestId: 'req-1', expiresAt: new Date(0) }),
    };
    usersService = {
      findOne: jest.fn().mockResolvedValue({ id: 2, username: 'supervisor', firstName: 'Sue', lastName: 'Pervisor' }),
    };
    // The card proof is covered by card-relay.spec.ts and card-pending-records.spec.ts; here it either
    // passes or fails.
    cardOperations = {
      verifyCard: jest.fn().mockResolvedValue({
        ok: true,
        card: {
          isActive: true,
          keyNo: 1,
          user: { id: 2, username: 'supervisor', firstName: 'Sue', lastName: 'Pervisor' },
        },
      }),
    };
    resourceReads = {
      findResource: jest
        .fn()
        .mockResolvedValue({ id: RESOURCE_ID, supervisionMode: SupervisionMode.SUPERVISION_REQUIRED }),
    };

    handler = new AttractapSupervisionHandler();
    Object.assign(handler, {
      attractapService,
      websocketService,
      resourceUsageService,
      supervisionService,
      usersService,
      cardOperations,
      resourceReads,
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
    get cardOperations() {
      return cardOperations;
    },
    get usersService() {
      return usersService;
    },
    get resourceReads() {
      return resourceReads;
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
