/* eslint-disable @typescript-eslint/no-explicit-any */
import { ResourceActionGuard } from './resource-action.guard';
import { AttractapEventType } from '../websocket.types';

describe('ResourceActionGuard', () => {
  let guard: ResourceActionGuard;
  let mockSocket: {
    id: string;
    readerId: number;
    state: { lastAuthenticatedUserId: number | null };
    sendMessage: jest.Mock;
    sendBinaryData: jest.Mock;
  };
  let mockAttractapService: { findReaderById: jest.Mock };
  let mockUsersService: { findOne: jest.Mock };

  const mockUser = { id: 1, username: 'testuser' };
  const mockReader = { id: 42, resources: [{ id: 10 }] };

  beforeEach(() => {
    guard = Object.create(ResourceActionGuard.prototype);

    mockAttractapService = {
      findReaderById: jest.fn().mockResolvedValue(mockReader),
    };
    mockUsersService = {
      findOne: jest.fn().mockResolvedValue(mockUser),
    };

    (guard as any).attractapService = mockAttractapService;
    (guard as any).usersService = mockUsersService;

    mockSocket = {
      id: 'test-id',
      readerId: 42,
      state: { lastAuthenticatedUserId: 1 },
      sendMessage: jest.fn().mockResolvedValue(undefined),
      sendBinaryData: jest.fn(),
    };
  });

  describe('invalid resourceId', () => {
    it('sends START_RESOURCE_USAGE_SESSION INVALID_RESOURCE_ID and returns false when resourceId is 0', async () => {
      const result = await guard.validateResourceAction(
        mockSocket as any,
        0,
        AttractapEventType.LOCK_DOOR,
      );

      expect(result).toBe(false);
      expect(mockSocket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.START_RESOURCE_USAGE_SESSION,
            payload: { error: 'INVALID_RESOURCE_ID' },
          }),
        }),
      );
      expect(mockAttractapService.findReaderById).not.toHaveBeenCalled();
    });

    it('sends START_RESOURCE_USAGE_SESSION INVALID_RESOURCE_ID and returns false when resourceId is undefined', async () => {
      const result = await guard.validateResourceAction(
        mockSocket as any,
        undefined as any,
        AttractapEventType.LOCK_DOOR,
      );

      expect(result).toBe(false);
      expect(mockSocket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.START_RESOURCE_USAGE_SESSION,
            payload: { error: 'INVALID_RESOURCE_ID' },
          }),
        }),
      );
    });

    it('always uses START type for invalid resourceId regardless of eventType', async () => {
      const result = await guard.validateResourceAction(
        mockSocket as any,
        0,
        AttractapEventType.START_RESOURCE_USAGE_SESSION,
      );

      expect(result).toBe(false);
      expect(mockSocket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.START_RESOURCE_USAGE_SESSION,
            payload: { error: 'INVALID_RESOURCE_ID' },
          }),
        }),
      );
    });
  });

  describe('reader not found', () => {
    it('sends eventType READER_NOT_FOUND and returns false', async () => {
      mockAttractapService.findReaderById.mockResolvedValueOnce(null);

      const result = await guard.validateResourceAction(
        mockSocket as any,
        10,
        AttractapEventType.LOCK_DOOR,
      );

      expect(result).toBe(false);
      expect(mockAttractapService.findReaderById).toHaveBeenCalledWith(42);
      expect(mockSocket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.LOCK_DOOR,
            payload: { error: 'READER_NOT_FOUND' },
          }),
        }),
      );
    });

    it('uses the START event type when given (fallback)', async () => {
      mockAttractapService.findReaderById.mockResolvedValueOnce(null);

      const result = await guard.validateResourceAction(
        mockSocket as any,
        10,
        AttractapEventType.START_RESOURCE_USAGE_SESSION,
      );

      expect(result).toBe(false);
      expect(mockSocket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.START_RESOURCE_USAGE_SESSION,
            payload: { error: 'READER_NOT_FOUND' },
          }),
        }),
      );
    });
  });

  describe('resource not associated with reader', () => {
    it('sends RESOURCE_NOT_ASSOCIATED_WITH_READER and returns false', async () => {
      const result = await guard.validateResourceAction(
        mockSocket as any,
        999,
        AttractapEventType.LOCK_DOOR,
      );

      expect(result).toBe(false);
      expect(mockSocket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.LOCK_DOOR,
            payload: { error: 'RESOURCE_NOT_ASSOCIATED_WITH_READER' },
          }),
        }),
      );
      expect(mockUsersService.findOne).not.toHaveBeenCalled();
    });
  });

  describe('user not authenticated', () => {
    it('sends USER_NOT_AUTHENTICATED and returns false when lastAuthenticatedUserId is null', async () => {
      mockSocket.state.lastAuthenticatedUserId = null;

      const result = await guard.validateResourceAction(
        mockSocket as any,
        10,
        AttractapEventType.LOCK_DOOR,
      );

      expect(result).toBe(false);
      expect(mockSocket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.LOCK_DOOR,
            payload: { error: 'USER_NOT_AUTHENTICATED' },
          }),
        }),
      );
      expect(mockUsersService.findOne).not.toHaveBeenCalled();
    });

    it('sends USER_NOT_AUTHENTICATED when lastAuthenticatedUserId is undefined', async () => {
      mockSocket.state.lastAuthenticatedUserId = undefined as any;

      const result = await guard.validateResourceAction(
        mockSocket as any,
        10,
        AttractapEventType.LOCK_DOOR,
      );

      expect(result).toBe(false);
      expect(mockSocket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.LOCK_DOOR,
            payload: { error: 'USER_NOT_AUTHENTICATED' },
          }),
        }),
      );
    });

    it('does NOT treat userId 0 as unauthenticated (== null check)', async () => {
      // lastAuthenticatedUserId == null is false for 0, so it proceeds to findOne.
      mockSocket.state.lastAuthenticatedUserId = 0;

      const result = await guard.validateResourceAction(
        mockSocket as any,
        10,
        AttractapEventType.LOCK_DOOR,
      );

      expect(result).toBe(true);
      expect(mockUsersService.findOne).toHaveBeenCalledWith({ id: 0 });
    });
  });

  describe('user not found', () => {
    it('sends USER_NOT_FOUND and returns false', async () => {
      mockUsersService.findOne.mockResolvedValueOnce(null);

      const result = await guard.validateResourceAction(
        mockSocket as any,
        10,
        AttractapEventType.LOCK_DOOR,
      );

      expect(result).toBe(false);
      expect(mockUsersService.findOne).toHaveBeenCalledWith({ id: 1 });
      expect(mockSocket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.LOCK_DOOR,
            payload: { error: 'USER_NOT_FOUND' },
          }),
        }),
      );
    });
  });

  describe('success', () => {
    it('returns true and sends no message when all checks pass', async () => {
      const result = await guard.validateResourceAction(
        mockSocket as any,
        10,
        AttractapEventType.LOCK_DOOR,
      );

      expect(result).toBe(true);
      expect(mockSocket.sendMessage).not.toHaveBeenCalled();
    });

    it('forwards readerId and userId to the dependencies', async () => {
      await guard.validateResourceAction(mockSocket as any, 10, AttractapEventType.LOCK_DOOR);

      expect(mockAttractapService.findReaderById).toHaveBeenCalledWith(42);
      expect(mockUsersService.findOne).toHaveBeenCalledWith({ id: 1 });
    });

    it('returns true for the START fallback event type as well', async () => {
      const result = await guard.validateResourceAction(
        mockSocket as any,
        10,
        AttractapEventType.START_RESOURCE_USAGE_SESSION,
      );

      expect(result).toBe(true);
      expect(mockSocket.sendMessage).not.toHaveBeenCalled();
    });
  });
});
