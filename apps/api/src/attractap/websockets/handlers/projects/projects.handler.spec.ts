/* eslint-disable @typescript-eslint/no-explicit-any */
import { AttractapProjectsHandler } from './projects.handler';
import { AttractapEventType, AttractapEvent } from '../../websocket.types';

describe('AttractapProjectsHandler', () => {
  let handler: AttractapProjectsHandler;
  let mockProjectsService: { findMany: jest.Mock; getTotalCount: jest.Mock };
  let mockSocket: {
    id: string;
    readerId: number;
    state: { verifiedUserId: number | null };
    sendMessage: jest.Mock;
    sendBinaryData: jest.Mock;
  };

  const mockProjects = [
    { id: 1, name: 'Project A' },
    { id: 2, name: 'Project B' },
  ];

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
      state: { verifiedUserId: 7 },
      sendMessage: jest.fn().mockResolvedValue(undefined),
      sendBinaryData: jest.fn(),
    };
  });

  describe('handleProjectsOfUserRequest', () => {
    it('sends USER_NOT_AUTHENTICATED and makes no service calls when no authenticated user', async () => {
      mockSocket.state.verifiedUserId = null;
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

      expect(mockProjectsService.findMany).toHaveBeenCalledWith(7, { page: 3, limit: 25, search: '' });
      expect(mockProjectsService.getTotalCount).toHaveBeenCalledWith(7, { search: '' });
      expect(mockSocket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.PROJECTS_OF_USER,
            payload: { projects: mockProjects, page: 3, limit: 25, total: 2, search: '' },
          }),
        }),
      );
    });

    it('defaults to page=1 and limit=10 when payload is empty', async () => {
      const data = { payload: {} } as AttractapEvent['data'];

      await handler.handleProjectsOfUserRequest(mockSocket as any, data);

      expect(mockProjectsService.findMany).toHaveBeenCalledWith(7, { page: 1, limit: 10, search: '' });
      expect(mockProjectsService.getTotalCount).toHaveBeenCalledWith(7, { search: '' });
      expect(mockSocket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.PROJECTS_OF_USER,
            payload: { projects: mockProjects, page: 1, limit: 10, total: 2, search: '' },
          }),
        }),
      );
    });

    it('filters projects and their total by the trimmed search query and echoes it back', async () => {
      const data = { payload: { page: 2, limit: 4, search: '  Laser  ' } } as AttractapEvent['data'];

      await handler.handleProjectsOfUserRequest(mockSocket as any, data);

      expect(mockProjectsService.findMany).toHaveBeenCalledWith(7, { page: 2, limit: 4, search: 'Laser' });
      expect(mockProjectsService.getTotalCount).toHaveBeenCalledWith(7, { search: 'Laser' });
      expect(mockSocket.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            payload: { projects: mockProjects, page: 2, limit: 4, total: 2, search: 'Laser' },
          }),
        }),
      );
    });

    it('echoes a valid request ID so readers can drop superseded responses', async () => {
      await handler.handleProjectsOfUserRequest(
        mockSocket as any,
        {
          payload: { page: 1, requestId: 12 },
        } as AttractapEvent['data'],
      );
      expect(mockSocket.sendMessage).toHaveBeenLastCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ payload: expect.objectContaining({ requestId: 12 }) }),
        }),
      );

      for (const requestId of [0, -1, 1.5, 'x']) {
        await handler.handleProjectsOfUserRequest(
          mockSocket as any,
          {
            payload: { requestId },
          } as unknown as AttractapEvent['data'],
        );
        expect(mockSocket.sendMessage.mock.lastCall[0].data.payload).not.toHaveProperty('requestId');
      }
    });

    it('ignores non-string search values and caps overly long queries', async () => {
      await handler.handleProjectsOfUserRequest(
        mockSocket as any,
        {
          payload: { search: 42 },
        } as unknown as AttractapEvent['data'],
      );
      expect(mockProjectsService.findMany).toHaveBeenLastCalledWith(7, { page: 1, limit: 10, search: '' });

      await handler.handleProjectsOfUserRequest(
        mockSocket as any,
        {
          payload: { search: 'x'.repeat(150) },
        } as AttractapEvent['data'],
      );
      expect(mockProjectsService.findMany).toHaveBeenLastCalledWith(7, { page: 1, limit: 10, search: 'x'.repeat(100) });
    });
  });
});
