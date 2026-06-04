/* eslint-disable @typescript-eslint/no-explicit-any */
import { AttractapSessionHandler } from './handlers/session.handler';
import { ResourceActionGuard } from './handlers/resource-action.guard';
import { AttractapEventType, AttractapEvent } from './websocket.types';
import { FlowExecutionError } from '../../resources/flows/errors/flow-execution.error';
import { BadRequestException } from '@nestjs/common';

describe('AttractapSessionHandler – door action error propagation', () => {
  let handler: AttractapSessionHandler;
  let mockSocket: {
    readerId: number;
    state: { lastAuthenticatedUserId: number; readerId: number };
    sendMessage: jest.Mock;
  };
  let mockResourceUsageService: {
    lockDoor: jest.Mock;
    unlockDoor: jest.Mock;
    unlatchDoor: jest.Mock;
  };
  let mockUsersService: { findOne: jest.Mock };
  let mockAttractapService: { findReaderById: jest.Mock; getResourcesForReader: jest.Mock };

  const mockUser = { id: 1, username: 'testuser' };
  const mockReader = { id: 42, resources: [{ id: 10 }] };

  beforeEach(() => {
    handler = Object.create(AttractapSessionHandler.prototype);
    (handler as any).logger = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    };

    mockSocket = {
      readerId: 42,
      state: { lastAuthenticatedUserId: 1, readerId: 42 },
      sendMessage: jest.fn().mockResolvedValue(undefined),
    };

    mockResourceUsageService = {
      lockDoor: jest.fn().mockResolvedValue({}),
      unlockDoor: jest.fn().mockResolvedValue({}),
      unlatchDoor: jest.fn().mockResolvedValue({}),
    };

    mockUsersService = {
      findOne: jest.fn().mockResolvedValue(mockUser),
    };

    mockAttractapService = {
      findReaderById: jest.fn().mockResolvedValue(mockReader),
      getResourcesForReader: jest.fn().mockResolvedValue([{ id: 10 }]),
    };

    // ResourceActionGuard runs the real validation logic against the mocks so the
    // door handlers proceed exactly as they did when validateResourceAction lived
    // on the gateway.
    const guard: ResourceActionGuard = Object.create(ResourceActionGuard.prototype);
    (guard as any).attractapService = mockAttractapService;
    (guard as any).usersService = mockUsersService;

    (handler as any).resourceUsageService = mockResourceUsageService;
    (handler as any).usersService = mockUsersService;
    (handler as any).resourceActionGuard = guard;
  });

  describe('handleLockDoor', () => {
    const eventData = { payload: { resourceId: 10 } } as AttractapEvent['data'];

    it('should send success on successful lock', async () => {
      await (handler as any).handleLockDoor(mockSocket, eventData);

      expect(mockResourceUsageService.lockDoor).toHaveBeenCalledWith(10, mockUser);
      expect(mockSocket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.LOCK_DOOR,
            payload: { success: true },
          }),
        }),
      );
    });

    it('should send stripped FlowExecutionError message on flow error', async () => {
      mockResourceUsageService.lockDoor.mockRejectedValueOnce(
        new FlowExecutionError('Access denied for this user'),
      );

      await (handler as any).handleLockDoor(mockSocket, eventData);

      expect(mockSocket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.LOCK_DOOR,
            payload: { error: 'Access denied for this user' },
          }),
        }),
      );
    });

    it('should send raw error message for non-FlowExecutionError', async () => {
      mockResourceUsageService.lockDoor.mockRejectedValueOnce(
        new BadRequestException('Resource is not a door'),
      );

      await (handler as any).handleLockDoor(mockSocket, eventData);

      expect(mockSocket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.LOCK_DOOR,
            payload: { error: 'Resource is not a door' },
          }),
        }),
      );
    });

    it('should log the error', async () => {
      mockResourceUsageService.lockDoor.mockRejectedValueOnce(
        new FlowExecutionError('Some error'),
      );

      await (handler as any).handleLockDoor(mockSocket, eventData);

      expect((handler as any).logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to lock door'),
      );
    });

    it('should not include FLOW_EXECUTION_ERROR prefix in logged error', async () => {
      mockResourceUsageService.lockDoor.mockRejectedValueOnce(
        new FlowExecutionError('Custom flow error'),
      );

      await (handler as any).handleLockDoor(mockSocket, eventData);

      const logCall = (handler as any).logger.error.mock.calls[0][0] as string;
      expect(logCall).not.toContain('FLOW_EXECUTION_ERROR');
      expect(logCall).toContain('Custom flow error');
    });
  });

  describe('handleUnlockDoor', () => {
    const eventData = { payload: { resourceId: 10 } } as AttractapEvent['data'];

    it('should send success on successful unlock', async () => {
      await (handler as any).handleUnlockDoor(mockSocket, eventData);

      expect(mockResourceUsageService.unlockDoor).toHaveBeenCalledWith(10, mockUser);
      expect(mockSocket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.UNLOCK_DOOR,
            payload: { success: true },
          }),
        }),
      );
    });

    it('should send stripped FlowExecutionError message on flow error', async () => {
      mockResourceUsageService.unlockDoor.mockRejectedValueOnce(
        new FlowExecutionError('Unlock not permitted'),
      );

      await (handler as any).handleUnlockDoor(mockSocket, eventData);

      expect(mockSocket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.UNLOCK_DOOR,
            payload: { error: 'Unlock not permitted' },
          }),
        }),
      );
    });

    it('should send raw error message for non-FlowExecutionError', async () => {
      mockResourceUsageService.unlockDoor.mockRejectedValueOnce(new Error('DB timeout'));

      await (handler as any).handleUnlockDoor(mockSocket, eventData);

      expect(mockSocket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.UNLOCK_DOOR,
            payload: { error: 'DB timeout' },
          }),
        }),
      );
    });

    it('should log the error with stripped message for FlowExecutionError', async () => {
      mockResourceUsageService.unlockDoor.mockRejectedValueOnce(
        new FlowExecutionError('Unlock denied'),
      );

      await (handler as any).handleUnlockDoor(mockSocket, eventData);

      const logCall = (handler as any).logger.error.mock.calls[0][0] as string;
      expect(logCall).toContain('Unlock denied');
      expect(logCall).not.toContain('FLOW_EXECUTION_ERROR');
    });
  });

  describe('handleUnlatchDoor', () => {
    const eventData = { payload: { resourceId: 10 } } as AttractapEvent['data'];

    it('should send success on successful unlatch', async () => {
      await (handler as any).handleUnlatchDoor(mockSocket, eventData);

      expect(mockResourceUsageService.unlatchDoor).toHaveBeenCalledWith(10, mockUser);
      expect(mockSocket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.UNLATCH_DOOR,
            payload: { success: true },
          }),
        }),
      );
    });

    it('should send stripped FlowExecutionError message on flow error', async () => {
      mockResourceUsageService.unlatchDoor.mockRejectedValueOnce(
        new FlowExecutionError('Unlatch blocked by flow'),
      );

      await (handler as any).handleUnlatchDoor(mockSocket, eventData);

      expect(mockSocket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.UNLATCH_DOOR,
            payload: { error: 'Unlatch blocked by flow' },
          }),
        }),
      );
    });

    it('should send raw error message for non-FlowExecutionError', async () => {
      mockResourceUsageService.unlatchDoor.mockRejectedValueOnce(
        new BadRequestException('Door does not support unlatching'),
      );

      await (handler as any).handleUnlatchDoor(mockSocket, eventData);

      expect(mockSocket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.UNLATCH_DOOR,
            payload: { error: 'Door does not support unlatching' },
          }),
        }),
      );
    });
  });

  describe('extractUserFacingError', () => {
    it('should strip FLOW_EXECUTION_ERROR prefix from FlowExecutionError', () => {
      const error = new FlowExecutionError('User not allowed');
      const result = (handler as any).extractUserFacingError(error);
      expect(result).toBe('User not allowed');
    });

    it('should return raw message for regular Error', () => {
      const error = new Error('Something went wrong');
      const result = (handler as any).extractUserFacingError(error);
      expect(result).toBe('Something went wrong');
    });

    it('should return raw message for BadRequestException', () => {
      const error = new BadRequestException('Resource is not a door');
      const result = (handler as any).extractUserFacingError(error);
      expect(result).toBe('Resource is not a door');
    });

    it('should stringify non-Error values', () => {
      const result = (handler as any).extractUserFacingError('string error');
      expect(result).toBe('string error');
    });

    it('should stringify non-Error object values', () => {
      const result = (handler as any).extractUserFacingError(42);
      expect(result).toBe('42');
    });

    it('should handle FlowExecutionError with empty message', () => {
      const error = new FlowExecutionError('');
      const result = (handler as any).extractUserFacingError(error);
      expect(result).toBe('');
    });
  });
});
