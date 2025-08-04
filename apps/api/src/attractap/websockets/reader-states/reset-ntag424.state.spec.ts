import { ResetNTAG424State } from './reset-ntag424.state';
import { InitialReaderState } from './initial.state';
import { AuthenticatedWebSocket, AttractapEventType } from '../websocket.types';
import { GatewayServices } from '../websocket.gateway';

// Mock InitialReaderState
jest.mock('./initial.state', () => ({
  InitialReaderState: jest.fn().mockImplementation(() => ({
    onStateEnter: jest.fn().mockResolvedValue(undefined),
  })),
}));

// Mock setTimeout to avoid actual delays in tests
jest.useFakeTimers();

describe('ResetNTAG424State', () => {
  let resetState: ResetNTAG424State;
  let mockSocket: AuthenticatedWebSocket;
  let mockServices: GatewayServices;
  const mockCardId = 123;
  const mockCardUID = 'card-uid-123';
  const mockMasterKey = 'aaaabbbbccccddddeeeeffffgggghhhh';
  const mockDefaultMasterKey = '00000000000000000000000000000000';

  beforeEach(async () => {
    jest.clearAllMocks();

    mockSocket = {
      sendMessage: jest.fn(),
      transitionToState: jest.fn().mockResolvedValue(undefined),
      state: undefined,
    } as unknown as AuthenticatedWebSocket;

    mockServices = {
      attractapService: {
        uint8ArrayToHexString: jest.fn().mockReturnValue(mockDefaultMasterKey),
        getNFCCardByID: jest.fn(),
        getNFCCardByUID: jest.fn(),
        deleteNFCCard: jest.fn(),
      },
    } as unknown as GatewayServices;

    // Default mock for getting card by ID
    (mockServices.attractapService.getNFCCardByID as jest.Mock).mockResolvedValue({
      id: mockCardId,
      uid: mockCardUID,
      keys: { 0: mockMasterKey },
      user: {
        id: 1,
        name: 'Test User',
        email: 'test@example.com',
        password: 'password',
      },
    });

    resetState = new ResetNTAG424State(mockSocket, mockServices, mockCardId);
  });

  afterEach(() => {
    // Clean up timers
    jest.clearAllTimers();
  });

  describe('onStateEnter', () => {
    it('should fetch the card and send correct init message', async () => {
      await resetState.onStateEnter();

      expect(mockServices.attractapService.getNFCCardByID).toHaveBeenCalledWith(mockCardId);
      expect(mockSocket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.NFC_ENABLE_CARD_CHECKING,
            payload: expect.objectContaining({
              type: 'reset-nfc-card',
              card: expect.objectContaining({
                id: mockCardId,
              }),
              user: expect.objectContaining({
                id: 1,
                username: undefined,
              }),
            }),
          }),
        })
      );
    });

    it('should throw an error if the card is not found', async () => {
      (mockServices.attractapService.getNFCCardByID as jest.Mock).mockResolvedValue(null);

      await expect(resetState.onStateEnter()).rejects.toThrow(`Card not found: ${mockCardId}`);
    });
  });

  describe('onStateExit', () => {
    it('should return void', async () => {
      const result = await resetState.onStateExit();
      expect(result).toBeUndefined();
    });
  });

  describe('onEvent', () => {
    it('should handle NFC_TAP event with the correct card', async () => {
      // Setup
      await resetState.onStateEnter(); // Initialize card

      // Mock getNFCCardByUID to return the same card
      (mockServices.attractapService.getNFCCardByUID as jest.Mock).mockResolvedValue({
        id: mockCardId,
        uid: mockCardUID,
        keys: { 0: mockMasterKey },
        user: {
          id: 1,
          name: 'Test User',
          email: 'test@example.com',
          password: 'password',
        },
      });

      // Test
      await resetState.onEvent({
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
      expect(mockServices.attractapService.getNFCCardByUID).toHaveBeenCalledWith(mockCardUID);

      // Check the CHANGE_KEYS message was sent with correct parameters
      expect(mockSocket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.NFC_CHANGE_KEY,
            payload: expect.objectContaining({
              authKey: mockMasterKey,
              keyNumber: 0,
              oldKey: mockMasterKey,
              newKey: mockDefaultMasterKey,
            }),
          }),
        })
      );
    });

    it('should use default key if card record is not found', async () => {
      // Setup
      await resetState.onStateEnter(); // Initialize card

      // Mock getNFCCardByUID to return null
      (mockServices.attractapService.getNFCCardByUID as jest.Mock).mockResolvedValue(null);

      // Test
      await resetState.onEvent({
        type: AttractapEventType.NFC_TAP,
        payload: { cardUID: mockCardUID },
      });

      // Assert
      // Check the CHANGE_KEYS message was sent with default key
      expect(mockSocket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.NFC_CHANGE_KEY,
            payload: expect.objectContaining({
              authKey: mockDefaultMasterKey,
              keyNumber: 0,
              oldKey: mockDefaultMasterKey,
              newKey: mockDefaultMasterKey,
            }),
          }),
        })
      );
    });

    it('should ignore NFC_TAP event with incorrect card UID', async () => {
      // Setup
      await resetState.onStateEnter(); // Initialize card

      // Test
      await resetState.onEvent({
        type: AttractapEventType.NFC_TAP,
        payload: { cardUID: 'wrong-card-uid' },
      });

      // Assert - The CHANGE_KEYS message should not be sent
      expect(mockSocket.sendMessage).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.NFC_CHANGE_KEY,
          }),
        })
      );
    });

    it('should ignore unexpected events', async () => {
      const initialCallCount = (mockSocket.sendMessage as jest.Mock).mock.calls.length;

      await resetState.onEvent({
        type: 'UNEXPECTED_EVENT' as AttractapEventType,
        payload: {},
      });

      // No new messages should be sent
      expect((mockSocket.sendMessage as jest.Mock).mock.calls.length).toBe(initialCallCount);
    });
  });

  describe('onResponse', () => {
    beforeEach(() => {
      // Reset mock call histories before each test
      (mockSocket.sendMessage as jest.Mock).mockClear();
      (mockSocket.transitionToState as jest.Mock).mockClear();
    });

    it('should handle successful key change', async () => {
      // Setup
      await resetState.onStateEnter();
      (mockSocket.sendMessage as jest.Mock).mockClear(); // Clear the init message

      // Test
      const responsePromise = resetState.onResponse({
        type: AttractapEventType.NFC_CHANGE_KEY,
        payload: {
          successful: true,
        },
      });

      // Fast-forward through all timers and await the promise
      await jest.runAllTimersAsync();
      await responsePromise;

      // Assert
      expect(mockServices.attractapService.deleteNFCCard).toHaveBeenCalledTimes(1);
      expect(mockServices.attractapService.deleteNFCCard).toHaveBeenCalledWith(mockCardId);

      // Verify success message sent and clear success message sent
      expect(mockSocket.sendMessage).toHaveBeenCalledTimes(2);
      expect(mockSocket.sendMessage).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.DISPLAY_SUCCESS,
            payload: expect.objectContaining({
              message: 'Card erased',
            }),
          }),
        })
      );
      expect(mockSocket.sendMessage).toHaveBeenNthCalledWith(
        2,
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

    it('should handle failed key change', async () => {
      // Test
      await resetState.onResponse({
        type: AttractapEventType.NFC_CHANGE_KEY,
        payload: {
          successful: false,
        },
      });

      // Assert
      expect(mockServices.attractapService.deleteNFCCard).not.toHaveBeenCalled();
      // No messages should be sent on failed key change
      expect(mockSocket.sendMessage).not.toHaveBeenCalled();
      // Only state transition happens
      expect(InitialReaderState).toHaveBeenCalledTimes(1);
      expect(InitialReaderState).toHaveBeenCalledWith(mockSocket, mockServices);
      expect(mockSocket.transitionToState).toHaveBeenCalledTimes(1);
    });

    it('should ignore unexpected response types', async () => {
      await resetState.onResponse({
        type: AttractapEventType.NFC_AUTHENTICATE,
        payload: {},
      });

      // No operations should happen for unexpected response types
      expect(mockSocket.sendMessage).not.toHaveBeenCalled();
      expect(mockSocket.transitionToState).not.toHaveBeenCalled();
      expect(mockServices.attractapService.deleteNFCCard).not.toHaveBeenCalled();
    });
  });
});

/**
 * Tests the full flow of card reset
 */
describe('ResetNTAG424State - Full Flow', () => {
  let resetState: ResetNTAG424State;
  let mockSocket: AuthenticatedWebSocket;
  let mockServices: GatewayServices;
  const mockCardId = 123;
  const mockCardUID = 'card-uid-123';
  const mockMasterKey = 'aaaabbbbccccddddeeeeffffgggghhhh';
  const mockDefaultMasterKey = '00000000000000000000000000000000';

  beforeEach(async () => {
    jest.clearAllMocks();

    mockSocket = {
      sendMessage: jest.fn(),
      transitionToState: jest.fn().mockResolvedValue(undefined),
      state: undefined,
    } as unknown as AuthenticatedWebSocket;

    mockServices = {
      attractapService: {
        getNFCCardByID: jest.fn().mockResolvedValue({
          id: mockCardId,
          uid: mockCardUID,
          keys: { 0: mockMasterKey },
          user: {
            id: 1,
            name: 'Test User',
            email: 'test@example.com',
            password: 'password',
          },
        }),
        getNFCCardByUID: jest.fn().mockResolvedValue({
          id: mockCardId,
          uid: mockCardUID,
          keys: { 0: mockMasterKey },
          user: {
            id: 1,
            name: 'Test User',
            email: 'test@example.com',
            password: 'password',
          },
        }),
        deleteNFCCard: jest.fn().mockResolvedValue(undefined),
        uint8ArrayToHexString: jest.fn().mockReturnValue(mockDefaultMasterKey),
      },
    } as unknown as GatewayServices;

    resetState = new ResetNTAG424State(mockSocket, mockServices, mockCardId);
  });

  it('should complete successful reset flow', async () => {
    // Reset call history before starting the test
    (mockSocket.sendMessage as jest.Mock).mockClear();
    (mockSocket.transitionToState as jest.Mock).mockClear();

    // Step 1: Initialize reset state
    await resetState.onStateEnter();

    // Verify only the ENABLE_CARD_CHECKING message was sent at this point
    expect(mockSocket.sendMessage).toHaveBeenCalledTimes(1);
    expect(mockSocket.sendMessage).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          type: AttractapEventType.NFC_ENABLE_CARD_CHECKING,
          payload: expect.objectContaining({
            type: 'reset-nfc-card',
            card: expect.objectContaining({
              id: mockCardId,
            }),
            user: expect.objectContaining({
              id: 1,
              username: undefined,
            }),
          }),
        }),
      })
    );
    expect(mockServices.attractapService.getNFCCardByID).toHaveBeenCalledWith(mockCardId);

    // Step 2: User taps the NFC card
    await resetState.onEvent({
      type: AttractapEventType.NFC_TAP,
      payload: { cardUID: mockCardUID },
    });

    // Verify the exact sequence and count of messages sent so far
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
          type: AttractapEventType.NFC_CHANGE_KEY,
          payload: expect.objectContaining({
            authKey: mockMasterKey,
            keyNumber: 0,
            oldKey: mockMasterKey,
            newKey: mockDefaultMasterKey,
          }),
        }),
      })
    );

    // Step 3: Keys changed successfully
    const responsePromise = resetState.onResponse({
      type: AttractapEventType.NFC_CHANGE_KEY,
      payload: {
        successful: true,
      },
    });

    // Fast-forward through all timers and await the promise
    await jest.runAllTimersAsync();
    await responsePromise;

    // Verify the complete message sequence and state transitions
    expect(mockServices.attractapService.deleteNFCCard).toHaveBeenCalledWith(mockCardId);

    // Verify all messages sent in the full flow
    expect(mockSocket.sendMessage).toHaveBeenCalledTimes(5);
    expect(mockSocket.sendMessage).toHaveBeenNthCalledWith(
      4,
      expect.objectContaining({
        data: expect.objectContaining({
          type: AttractapEventType.DISPLAY_SUCCESS,
          payload: expect.objectContaining({
            message: 'Card erased',
          }),
        }),
      })
    );
    expect(mockSocket.sendMessage).toHaveBeenNthCalledWith(
      5,
      expect.objectContaining({
        data: expect.objectContaining({
          type: AttractapEventType.CLEAR_SUCCESS,
          payload: undefined,
        }),
      })
    );

    // Verify transition to initial state happens exactly once
    expect(InitialReaderState).toHaveBeenCalledTimes(1);
    expect(InitialReaderState).toHaveBeenCalledWith(mockSocket, mockServices);
    expect(mockSocket.transitionToState).toHaveBeenCalledTimes(1);
    expect(mockSocket.transitionToState).toHaveBeenCalledWith(expect.any(Object));
  });

  it('should handle wrong card tap', async () => {
    // Reset call history before starting the test
    (mockSocket.sendMessage as jest.Mock).mockClear();

    // Initialize reset state
    await resetState.onStateEnter();

    // Verify initial message
    expect(mockSocket.sendMessage).toHaveBeenCalledTimes(1);
    expect(mockSocket.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: AttractapEventType.NFC_ENABLE_CARD_CHECKING,
        }),
      })
    );

    // User taps the wrong NFC card
    await resetState.onEvent({
      type: AttractapEventType.NFC_TAP,
      payload: { cardUID: 'wrong-card-uid' },
    });

    // Wrong card should be ignored - still only 1 message sent
    expect(mockSocket.sendMessage).toHaveBeenCalledTimes(1);
    // No state transitions should have occurred
    expect(mockSocket.transitionToState).not.toHaveBeenCalled();
    expect(mockServices.attractapService.deleteNFCCard).not.toHaveBeenCalled();
  });

  it('should handle key change failure', async () => {
    // Reset call history before starting the test
    (mockSocket.sendMessage as jest.Mock).mockClear();
    (mockSocket.transitionToState as jest.Mock).mockClear();

    // Initialize reset state
    await resetState.onStateEnter();
    expect(mockSocket.sendMessage).toHaveBeenCalledTimes(1);

    // User taps the correct NFC card
    await resetState.onEvent({
      type: AttractapEventType.NFC_TAP,
      payload: { cardUID: mockCardUID },
    });

    // Verify the DISABLE_CARD_CHECKING and CHANGE_KEYS messages
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
          type: AttractapEventType.NFC_CHANGE_KEY,
        }),
      })
    );

    // Keys failed to change
    await resetState.onResponse({
      type: AttractapEventType.NFC_CHANGE_KEY,
      payload: {
        successful: false,
      },
    });

    // Card should not be deleted
    expect(mockServices.attractapService.deleteNFCCard).not.toHaveBeenCalled();

    // No additional messages sent on failure
    expect(mockSocket.sendMessage).toHaveBeenCalledTimes(3);

    // Should transition to initial state exactly once
    expect(InitialReaderState).toHaveBeenCalledTimes(1);
    expect(InitialReaderState).toHaveBeenCalledWith(mockSocket, mockServices);
    expect(mockSocket.transitionToState).toHaveBeenCalledTimes(1);
  });
});
