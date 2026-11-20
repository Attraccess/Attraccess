/* eslint-disable @typescript-eslint/no-explicit-any */
import { ResourceActionGuard } from './resource-action.guard';
import { AttractapEventType } from '../websocket.types';
import { ResourceType } from '@attraccess/application-models';
import { ACCESS_ONLY_DOOR_MESSAGE } from '../../../resources/reader-capabilities/reader-capabilities';

describe('ResourceActionGuard', () => {
  let guard: ResourceActionGuard;
  let mockSocket: {
    id: string;
    readerId: number;
    state: { verifiedUserId: number | null };
    sendMessage: jest.Mock;
    sendBinaryData: jest.Mock;
  };
  let mockAttractapService: { findReaderById: jest.Mock };
  let mockUsersService: { findOne: jest.Mock };

  const mockUser = { id: 1, username: 'testuser' };
  const door = { id: 10, type: ResourceType.Door, separateUnlockAndUnlatch: false, accessOnly: false };
  const accessOnlyDoor = { id: 11, type: ResourceType.Door, separateUnlockAndUnlatch: false, accessOnly: true };
  const machine = { id: 12, type: ResourceType.Machine, separateUnlockAndUnlatch: false, accessOnly: false };
  const mockReader = { id: 42, resources: [door, accessOnlyDoor, machine] };

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
      state: { verifiedUserId: 1 },
      sendMessage: jest.fn().mockResolvedValue(undefined),
      sendBinaryData: jest.fn(),
    };
  });

  describe('invalid resourceId', () => {
    it('sends LOCK_DOOR INVALID_RESOURCE_ID and returns false when resourceId is 0', async () => {
      const result = await guard.validateResourceAction(mockSocket as any, 0, AttractapEventType.LOCK_DOOR);

      expect(result).toBe(false);
      expect(mockSocket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.LOCK_DOOR,
            payload: { error: 'INVALID_RESOURCE_ID' },
          }),
        }),
      );
      expect(mockAttractapService.findReaderById).not.toHaveBeenCalled();
    });

    it('sends LOCK_DOOR INVALID_RESOURCE_ID and returns false when resourceId is undefined', async () => {
      const result = await guard.validateResourceAction(
        mockSocket as any,
        undefined as any,
        AttractapEventType.LOCK_DOOR,
      );

      expect(result).toBe(false);
      expect(mockSocket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.LOCK_DOOR,
            payload: { error: 'INVALID_RESOURCE_ID' },
          }),
        }),
      );
    });

    it('keeps START errors on the START event', async () => {
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

      const result = await guard.validateResourceAction(mockSocket as any, 10, AttractapEventType.LOCK_DOOR);

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
      const result = await guard.validateResourceAction(mockSocket as any, 999, AttractapEventType.LOCK_DOOR);

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
    it('sends USER_NOT_AUTHENTICATED and returns false when verifiedUserId is null', async () => {
      mockSocket.state.verifiedUserId = null;

      const result = await guard.validateResourceAction(mockSocket as any, 10, AttractapEventType.LOCK_DOOR);

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

    it('sends USER_NOT_AUTHENTICATED when verifiedUserId is undefined', async () => {
      mockSocket.state.verifiedUserId = undefined as any;

      const result = await guard.validateResourceAction(mockSocket as any, 10, AttractapEventType.LOCK_DOOR);

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
      // verifiedUserId == null is false for 0, so it proceeds to findOne.
      mockSocket.state.verifiedUserId = 0;

      const result = await guard.validateResourceAction(mockSocket as any, 10, AttractapEventType.LOCK_DOOR);

      expect(result).toBe(true);
      expect(mockUsersService.findOne).toHaveBeenCalledWith({ id: 0 });
    });
  });

  describe('user not found', () => {
    it('sends USER_NOT_FOUND and returns false', async () => {
      mockUsersService.findOne.mockResolvedValueOnce(null);

      const result = await guard.validateResourceAction(mockSocket as any, 10, AttractapEventType.LOCK_DOOR);

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
      const result = await guard.validateResourceAction(mockSocket as any, 10, AttractapEventType.LOCK_DOOR);

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
        12,
        AttractapEventType.START_RESOURCE_USAGE_SESSION,
      );

      expect(result).toBe(true);
      expect(mockSocket.sendMessage).not.toHaveBeenCalled();
    });
  });

  describe('reader capabilities', () => {
    const errorOf = () => mockSocket.sendMessage.mock.calls[0][0].data.payload.error;

    it.each([AttractapEventType.LOCK_DOOR, AttractapEventType.UNLATCH_DOOR])(
      'refuses %s on an access-only door',
      async (eventType) => {
        const result = await guard.validateResourceAction(mockSocket as any, 11, eventType, 7);

        expect(result).toBe(false);
        expect(mockSocket.sendMessage.mock.calls[0][0].data).toEqual({
          type: eventType,
          payload: { requestId: 7, error: ACCESS_ONLY_DOOR_MESSAGE },
        });
        expect(mockUsersService.findOne).not.toHaveBeenCalled();
      },
    );

    it('allows unlock on an access-only door: older readers send it for Open', async () => {
      const result = await guard.validateResourceAction(mockSocket as any, 11, AttractapEventType.UNLOCK_DOOR);

      expect(result).toBe(true);
    });

    it('refuses unlatch on a door without separate unlatching', async () => {
      const result = await guard.validateResourceAction(mockSocket as any, 10, AttractapEventType.UNLATCH_DOOR);

      expect(result).toBe(false);
      expect(errorOf()).toBe('This door does not support unlatching');
    });

    it('refuses a session start on a door', async () => {
      const result = await guard.validateResourceAction(
        mockSocket as any,
        10,
        AttractapEventType.START_RESOURCE_USAGE_SESSION,
      );

      expect(result).toBe(false);
      expect(errorOf()).toBe('This resource does not support this action');
    });

    it('does not check events that are not reader actions', async () => {
      const result = await guard.validateResourceAction(mockSocket as any, 10, AttractapEventType.RESOURCE_USAGE_STATS);

      expect(result).toBe(true);
    });
  });
});
