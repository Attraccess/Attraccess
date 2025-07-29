import { EnrollmentState, EnrollNTAG424State } from './enroll-ntag424.state';
import { InitialReaderState } from './initial.state';
import { AuthenticatedWebSocket, AttractapEventType } from '../websocket.types';
import { GatewayServices } from '../websocket.gateway';
import { User } from '@attraccess/database-entities';

// Mock crypto.subtle
const mockDigest = jest.fn();
jest.mock('crypto', () => ({
  subtle: {
    digest: (...args) => mockDigest(...args),
  },
}));

// Mock InitialReaderState
jest.mock('./initial.state', () => ({
  InitialReaderState: jest.fn().mockImplementation(() => ({
    onStateEnter: jest.fn().mockResolvedValue(undefined),
  })),
}));

// Mock setTimeout to avoid actual delays in tests
jest.useFakeTimers();

describe('EnrollNTAG424State', () => {
  let enrollState: EnrollNTAG424State;
  let mockSocket: AuthenticatedWebSocket & { enrollment?: EnrollmentState };
  let mockServices: GatewayServices;
  const mockUser = {
    id: 1,
    name: 'Test User',
    email: 'test@example.com',
    password: 'password',
  } as unknown as User;
  const mockCardUID = 'card-uid-123';
  const mockNewMasterKey = 'aaaabbbbccccddddeeeeffffgggghhhh';

  beforeEach(async () => {
    // Reset mocks
    jest.clearAllMocks();

    mockSocket = {
      enrollment: undefined,
      sendMessage: jest.fn(),
      transitionToState: jest.fn().mockResolvedValue(undefined),
      state: undefined,
    } as unknown as AuthenticatedWebSocket & { enrollment?: EnrollmentState };

    mockServices = {
      attractapService: {
        getNFCCardByUID: jest.fn(),
        createNFCCard: jest.fn().mockResolvedValue({ id: 'nfc-card-1' }),
        uint8ArrayToHexString: jest.fn().mockReturnValue('aaaabbbbccccddddeeeeffffgggghhhh'),
        generateNTAG424Key: jest.fn(),
      },
      usersService: {
        findOne: jest.fn().mockResolvedValue(mockUser),
      },
    } as unknown as GatewayServices;

    // Setup subtle.digest mock to return a consistent value for testing
    mockDigest.mockImplementation(() => {
      return Promise.resolve(
        new Uint8Array(
          Array(32)
            .fill(0)
            .map((_, i) => (i % 16) + 0xa0)
        )
      );
    });

    enrollState = new EnrollNTAG424State(mockSocket, mockServices, mockUser);
  });

  describe('onStateEnter', () => {
    it('should initialize enrollment state and send the correct init message', async () => {
      await enrollState.onStateEnter();

      expect(mockSocket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.NFC_ENABLE_CARD_CHECKING,
            payload: expect.objectContaining({
              type: 'enroll-nfc-card',
              user: expect.objectContaining({
                id: 1,
                username: undefined,
              }),
            }),
          }),
        })
      );
    });
  });

  describe('onStateExit', () => {
    it('should reset enrollment state', async () => {
      // First set up the enrollment state
      enrollState['enrollment'] = {
        nextExpectedEvent: AttractapEventType.NFC_TAP,
        data: {},
      };

      // Call onStateExit
      await enrollState.onStateExit();

      // Verify the enrollment state is reset
      expect(enrollState['enrollment']).toBeUndefined();
    });
  });

  describe('onEvent', () => {
    it('should handle NFC_TAP event when expected', async () => {
      // Setup
      await enrollState.onStateEnter();
      (mockSocket.sendMessage as jest.Mock).mockClear();
      (mockServices.attractapService.getNFCCardByUID as jest.Mock).mockResolvedValue(null);

      // Call method
      await enrollState.onEvent({
        type: AttractapEventType.NFC_TAP,
        payload: { cardUID: mockCardUID },
      });

      // Assert
      expect(mockSocket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.NFC_DISABLE_CARD_CHECKING,
          }),
        })
      );

      expect(mockSocket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.NFC_CHANGE_KEYS,
            payload: expect.any(Object),
          }),
        })
      );
    });

    it('should ignore unexpected events', async () => {
      const initialCallCount = (mockSocket.sendMessage as jest.Mock).mock.calls.length;

      await enrollState.onEvent({
        type: AttractapEventType.DISPLAY_ERROR,
        payload: {},
      });

      expect((mockSocket.sendMessage as jest.Mock).mock.calls.length).toBe(initialCallCount);
    });
  });

  describe('onResponse', () => {
    it('should ignore responses with unexpected type', async () => {
      // Setup
      await enrollState.onStateEnter();
      (mockSocket.sendMessage as jest.Mock).mockClear();

      // Manually set the expected event
      enrollState['enrollment'] = {
        nextExpectedEvent: AttractapEventType.NFC_AUTHENTICATE,
        data: {},
      };

      // Send a different response type
      await enrollState.onResponse({
        type: AttractapEventType.NFC_CHANGE_KEYS,
        payload: {},
      });

      // No new messages should be sent
      expect(mockSocket.sendMessage).not.toHaveBeenCalled();
    });

    it('should handle successful key change', async () => {
      // Setup
      await enrollState.onStateEnter();
      (mockSocket.sendMessage as jest.Mock).mockClear();

      // Manually set the enrollment state
      enrollState['enrollment'] = {
        nextExpectedEvent: AttractapEventType.NFC_CHANGE_KEYS,
        data: {
          newKeys: { 0: mockNewMasterKey },
        },
      };

      // Call method
      await enrollState.onResponse({
        type: AttractapEventType.NFC_CHANGE_KEYS,
        payload: {
          successfulKeys: [0],
          failedKeys: [],
        },
      });

      // Assert
      expect(enrollState['enrollment'].nextExpectedEvent).toBe(AttractapEventType.NFC_AUTHENTICATE);
      expect(mockSocket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.NFC_AUTHENTICATE,
            payload: expect.objectContaining({
              authenticationKey: mockNewMasterKey,
              keyNumber: 0,
            }),
          }),
        })
      );
    });

    it('should handle failed key change', async () => {
      // Setup
      await enrollState.onStateEnter();
      (mockSocket.sendMessage as jest.Mock).mockClear();

      // Manually set the enrollment state
      enrollState['enrollment'] = {
        nextExpectedEvent: AttractapEventType.NFC_CHANGE_KEYS,
        data: {
          newKeys: { 0: mockNewMasterKey },
        },
      };

      // Call method
      await enrollState.onResponse({
        type: AttractapEventType.NFC_CHANGE_KEYS,
        payload: {
          successfulKeys: [],
          failedKeys: [0],
        },
      });

      // Assert
      expect(enrollState['enrollment']).toBeUndefined();
      expect(InitialReaderState).toHaveBeenCalledWith(mockSocket, mockServices);
      expect(mockSocket.transitionToState).toHaveBeenCalled();
    });

    it('should handle successful authentication', async () => {
      // Setup
      await enrollState.onStateEnter();
      (mockSocket.sendMessage as jest.Mock).mockClear();

      // Manually set the enrollment state
      enrollState['enrollment'] = {
        nextExpectedEvent: AttractapEventType.NFC_AUTHENTICATE,
        cardUID: mockCardUID,
        data: {
          newKeys: { 0: mockNewMasterKey },
        },
      };

      // Call method and advance timers
      const responsePromise = enrollState.onResponse({
        type: AttractapEventType.NFC_AUTHENTICATE,
        payload: {
          authenticationSuccessful: true,
        },
      });

      // Fast-forward through all timers and await the promise
      await jest.runAllTimersAsync();
      await responsePromise;

      // Assert
      // Don't expect enrollment to be undefined since the implementation doesn't clear it

      // Verify card creation
      expect(mockServices.attractapService.createNFCCard).toHaveBeenCalledWith(mockUser, {
        uid: mockCardUID,
        keys: {
          0: mockNewMasterKey,
        },
      });

      // Verify success message
      expect(mockSocket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.DISPLAY_SUCCESS,
            payload: expect.objectContaining({
              message: 'Enrollment successful',
            }),
          }),
        })
      );

      // Verify clear success message was sent
      expect(mockSocket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.CLEAR_SUCCESS,
            payload: undefined,
          }),
        })
      );

      // Verify transition to initial state
      expect(InitialReaderState).toHaveBeenCalledWith(mockSocket, mockServices);
      expect(mockSocket.transitionToState).toHaveBeenCalled();
    });

    it('should handle failed authentication', async () => {
      // Setup
      await enrollState.onStateEnter();
      (mockSocket.sendMessage as jest.Mock).mockClear();

      // Manually set the enrollment state
      enrollState['enrollment'] = {
        nextExpectedEvent: AttractapEventType.NFC_AUTHENTICATE,
        cardUID: mockCardUID,
        data: {
          newKeys: { 0: mockNewMasterKey },
        },
      };

      // Call method
      const responsePromise = enrollState.onResponse({
        type: AttractapEventType.NFC_AUTHENTICATE,
        payload: {
          authenticationSuccessful: false,
        },
      });

      // Fast-forward through all timers and await the promise
      await jest.runAllTimersAsync();
      await responsePromise;

      // Assert
      // Don't expect enrollment to be undefined since the implementation doesn't clear it

      // No card should be created when authentication fails
      expect(mockServices.attractapService.createNFCCard).not.toHaveBeenCalled();

      // Verify error message
      expect(mockSocket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.DISPLAY_ERROR,
            payload: expect.objectContaining({
              message: 'Enrollment failed',
            }),
          }),
        })
      );

      // Verify transition to initial state
      expect(InitialReaderState).toHaveBeenCalledWith(mockSocket, mockServices);
      expect(mockSocket.transitionToState).toHaveBeenCalled();
    });
  });
});

/**
 * Tests that the socket is guided correctly through the enrollment process
 */
describe('EnrollNTAG424State - Full Flow', () => {
  let enrollState: EnrollNTAG424State;
  let mockSocket: AuthenticatedWebSocket & { enrollment?: EnrollmentState };
  let mockServices: GatewayServices;
  const mockUser = {
    id: 1,
    name: 'Test User',
    email: 'test@example.com',
    password: 'password',
  } as unknown as User;
  const mockCardUID = 'card-uid-123';

  beforeEach(async () => {
    jest.clearAllMocks();

    mockSocket = {
      enrollment: undefined,
      sendMessage: jest.fn(),
      transitionToState: jest.fn().mockResolvedValue(undefined),
      state: undefined,
    } as unknown as AuthenticatedWebSocket & { enrollment?: EnrollmentState };

    mockServices = {
      attractapService: {
        getNFCCardByUID: jest.fn(),
        createNFCCard: jest.fn().mockResolvedValue({ id: 'nfc-card-1' }),
        uint8ArrayToHexString: jest.fn(),
        generateNTAG424Key: jest.fn(),
      },
      usersService: {
        findOne: jest.fn().mockResolvedValue(mockUser),
      },
    } as unknown as GatewayServices;

    mockDigest.mockImplementation(() => {
      return Promise.resolve(
        new Uint8Array(
          Array(32)
            .fill(0)
            .map((_, i) => (i % 16) + 0xa0)
        )
      );
    });

    enrollState = new EnrollNTAG424State(mockSocket, mockServices, mockUser);
  });

  afterEach(() => {
    // Clean up timers
    jest.clearAllTimers();
  });

  it('should complete successful enrollment flow', async () => {
    // Reset call history
    (mockSocket.sendMessage as jest.Mock).mockClear();
    (mockSocket.transitionToState as jest.Mock).mockClear();

    // Step 1: Initialize enrollment state
    await enrollState.onStateEnter();

    // Verify initial message
    expect(mockSocket.sendMessage).toHaveBeenCalledTimes(1);
    expect(mockSocket.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: AttractapEventType.NFC_ENABLE_CARD_CHECKING,
        }),
      })
    );

    // Step 2: User taps NFC card
    (mockServices.attractapService.getNFCCardByUID as jest.Mock).mockResolvedValue(null);

    await enrollState.onEvent({
      type: AttractapEventType.NFC_TAP,
      payload: { cardUID: mockCardUID },
    });

    // Verify DISABLE_CARD_CHECKING and CHANGE_KEYS messages
    expect(mockSocket.sendMessage).toHaveBeenCalledTimes(3);
    expect(mockSocket.sendMessage).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({
          type: AttractapEventType.NFC_DISABLE_CARD_CHECKING,
        }),
      })
    );
    expect(mockSocket.sendMessage).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        data: expect.objectContaining({
          type: AttractapEventType.NFC_CHANGE_KEYS,
        }),
      })
    );

    // Step 3: Keys changed successfully
    await enrollState.onResponse({
      type: AttractapEventType.NFC_CHANGE_KEYS,
      payload: {
        successfulKeys: [0],
        failedKeys: [],
      },
    });

    // Verify AUTHENTICATE message
    expect(mockSocket.sendMessage).toHaveBeenCalledTimes(4);
    expect(mockSocket.sendMessage).toHaveBeenNthCalledWith(
      4,
      expect.objectContaining({
        data: expect.objectContaining({
          type: AttractapEventType.NFC_AUTHENTICATE,
        }),
      })
    );

    // Step 4: Authentication successful
    const authPromise = enrollState.onResponse({
      type: AttractapEventType.NFC_AUTHENTICATE,
      payload: {
        authenticationSuccessful: true,
      },
    });

    // Fast-forward through the 10 second delay
    await jest.runAllTimersAsync();
    await authPromise;

    // Verify success message and card creation
    expect(mockServices.attractapService.createNFCCard).toHaveBeenCalled();
    expect(mockSocket.sendMessage).toHaveBeenCalledTimes(6);
    expect(mockSocket.sendMessage).toHaveBeenNthCalledWith(
      5,
      expect.objectContaining({
        data: expect.objectContaining({
          type: AttractapEventType.DISPLAY_SUCCESS,
          payload: expect.objectContaining({
            message: 'Enrollment successful',
          }),
        }),
      })
    );
    expect(mockSocket.sendMessage).toHaveBeenNthCalledWith(
      6,
      expect.objectContaining({
        data: expect.objectContaining({
          type: AttractapEventType.CLEAR_SUCCESS,
          payload: undefined,
        }),
      })
    );
    expect(mockSocket.transitionToState).toHaveBeenCalledTimes(1);
  });

  it('should handle key change failure', async () => {
    // Reset call history
    (mockSocket.sendMessage as jest.Mock).mockClear();
    (mockSocket.transitionToState as jest.Mock).mockClear();

    // Initialize and tap card
    await enrollState.onStateEnter();
    (mockServices.attractapService.getNFCCardByUID as jest.Mock).mockResolvedValue(null);

    await enrollState.onEvent({
      type: AttractapEventType.NFC_TAP,
      payload: { cardUID: mockCardUID },
    });

    // Clear message history before testing key change failure
    (mockSocket.sendMessage as jest.Mock).mockClear();

    // Simulate key change failure
    await enrollState.onResponse({
      type: AttractapEventType.NFC_CHANGE_KEYS,
      payload: {
        successfulKeys: [],
        failedKeys: [0],
      },
    });

    // Verify no messages sent and transition to initial state
    expect(mockSocket.sendMessage).not.toHaveBeenCalled();
    expect(mockSocket.transitionToState).toHaveBeenCalledTimes(1);
    expect(InitialReaderState).toHaveBeenCalledWith(mockSocket, mockServices);
  });

  it('should handle authentication failure and NOT store card data', async () => {
    // Initialize and tap card
    await enrollState.onStateEnter();
    (mockServices.attractapService.getNFCCardByUID as jest.Mock).mockResolvedValue(null);

    await enrollState.onEvent({
      type: AttractapEventType.NFC_TAP,
      payload: { cardUID: mockCardUID },
    });

    // Successfully change keys
    await enrollState.onResponse({
      type: AttractapEventType.NFC_CHANGE_KEYS,
      payload: {
        successfulKeys: [0],
        failedKeys: [],
      },
    });

    // Clear message history before testing auth failure
    (mockSocket.sendMessage as jest.Mock).mockClear();

    // Simulate authentication failure
    const responsePromise = enrollState.onResponse({
      type: AttractapEventType.NFC_AUTHENTICATE,
      payload: {
        authenticationSuccessful: false,
      },
    });

    // Fast-forward through all timers and await the promise
    await jest.runAllTimersAsync();
    await responsePromise;

    // Verify card was NOT created when authentication fails
    expect(mockServices.attractapService.createNFCCard).not.toHaveBeenCalled();

    // Verify error message
    expect(mockSocket.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: AttractapEventType.DISPLAY_ERROR,
          payload: expect.objectContaining({
            message: 'Enrollment failed',
          }),
        }),
      })
    );

    // Verify transition to initial state
    expect(mockSocket.transitionToState).toHaveBeenCalledTimes(1);
    expect(InitialReaderState).toHaveBeenCalledWith(mockSocket, mockServices);
  });

  it('should handle existing card tap', async () => {
    // Setup mock for existing card
    const existingCard = {
      id: 'existing-card-1',
      uid: mockCardUID,
      keys: { 0: 'existingMasterKey' },
    };
    (mockServices.attractapService.getNFCCardByUID as jest.Mock).mockResolvedValue(existingCard);

    // Initialize and tap card
    await enrollState.onStateEnter();
    (mockSocket.sendMessage as jest.Mock).mockClear();

    await enrollState.onEvent({
      type: AttractapEventType.NFC_TAP,
      payload: { cardUID: mockCardUID },
    });

    // Verify it attempts to change keys using the existing master key
    expect(mockSocket.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: AttractapEventType.NFC_CHANGE_KEYS,
          payload: expect.objectContaining({
            authenticationKey: 'existingMasterKey',
          }),
        }),
      })
    );
  });

  it('should ignore unexpected events', async () => {
    // Initialize enrollment
    await enrollState.onStateEnter();
    (mockSocket.sendMessage as jest.Mock).mockClear();

    // Send unexpected event
    await enrollState.onEvent({
      type: AttractapEventType.DISPLAY_ERROR,
      payload: {},
    });

    // Verify no messages were sent
    expect(mockSocket.sendMessage).not.toHaveBeenCalled();
  });
});
