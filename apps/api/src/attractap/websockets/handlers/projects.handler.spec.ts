/* eslint-disable @typescript-eslint/no-explicit-any */
import { AttractapProjectsHandler } from './projects.handler';
import { AttractapEventType, AttractapEvent } from '../websocket.types';

describe('AttractapProjectsHandler', () => {
  let handler: AttractapProjectsHandler;
  let mockProjectsService: { findMany: jest.Mock; getTotalCount: jest.Mock };
  let mockSocket: {
    id: string;
    readerId: number;
    state: { lastAuthenticatedUserId: number | null };
    sendMessage: jest.Mock;
    sendBinaryData: jest.Mock;
  };

  const mockProjects = [{ id: 1, name: 'Project A' }, { id: 2, name: 'Project B' }];

  beforeEach(() => {
    handler = Object.create(AttractapProjectsHandler.prototype);
    (handler as any).logger = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    };

    mockProjectsService = {
      findMany: jest.fn().mockResolvedValue(mockProjects),
      getTotalCount: jest.fn().mockResolvedValue(2),
    };
    (handler as any).projectsService = mockProjectsService;

    mockSocket = {
      id: 'test-id',
      readerId: 42,
      state: { lastAuthenticatedUserId: 7 },
      sendMessage: jest.fn().mockResolvedValue(undefined),
      sendBinaryData: jest.fn(),
    };
  });

  describe('handleProjectsOfUserRequest', () => {
    it('sends USER_NOT_AUTHENTICATED and makes no service calls when no authenticated user', async () => {
      mockSocket.state.lastAuthenticatedUserId = null;
      const data = { payload: {} } as AttractapEvent['data'];

      await handler.handleProjectsOfUserRequest(mockSocket as any, data);

      expect(mockSocket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.PROJECTS_OF_USER,
            payload: { error: 'USER_NOT_AUTHENTICATED' },
          }),
        }),
      );
      expect(mockProjectsService.findMany).not.toHaveBeenCalled();
      expect(mockProjectsService.getTotalCount).not.toHaveBeenCalled();
    });

    it('uses explicit page/limit and sends projects payload on success', async () => {
      const data = { payload: { page: 3, limit: 25 } } as AttractapEvent['data'];

      await handler.handleProjectsOfUserRequest(mockSocket as any, data);

      expect(mockProjectsService.findMany).toHaveBeenCalledWith(7, { page: 3, limit: 25 });
      expect(mockProjectsService.getTotalCount).toHaveBeenCalledWith(7);
      expect(mockSocket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.PROJECTS_OF_USER,
            payload: { projects: mockProjects, page: 3, limit: 25, total: 2 },
          }),
        }),
      );
    });

    it('defaults to page=1 and limit=10 when payload is empty', async () => {
      const data = { payload: {} } as AttractapEvent['data'];

      await handler.handleProjectsOfUserRequest(mockSocket as any, data);

      expect(mockProjectsService.findMany).toHaveBeenCalledWith(7, { page: 1, limit: 10 });
      expect(mockProjectsService.getTotalCount).toHaveBeenCalledWith(7);
      expect(mockSocket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.PROJECTS_OF_USER,
            payload: { projects: mockProjects, page: 1, limit: 10, total: 2 },
          }),
        }),
      );
    });
  });
});
