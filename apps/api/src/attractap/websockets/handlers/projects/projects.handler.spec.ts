import { AttractapProjectsHandler } from './projects.handler';
import { AuthenticatedWebSocket, AttractapEvent, AttractapEventType } from '../../websocket.types';
import { VerifiedCardSessionService } from '../../../security/verified-card-session.service';

describe('AttractapProjectsHandler foundation denial', () => {
  it.each([
    ['legacy', { lastAuthenticatedUserId: 7 }, 42],
    ['secured', { lastAuthenticatedUserId: 7, security: { class: 'secured', ready: true } }, 42],
    ['missing state', undefined, undefined],
    ['malformed state', 'invalid', null],
    ['null user', { lastAuthenticatedUserId: null }, null],
    ['zero user', { lastAuthenticatedUserId: 0 }, 0],
  ])('denies direct calls for %s before touching payload or services', async (_name, state, readerId) => {
    const handler = new AttractapProjectsHandler();
    const downstream = {
      findMany: jest.fn(() => {
        throw new Error('secret service failure');
      }),
      getTotalCount: jest.fn(() => {
        throw new Error('secret service failure');
      }),
    };
    const verifier = { verify: jest.fn() };
    Object.assign(handler, {
      projectsService: downstream,
      verifiedCardSessionService: new VerifiedCardSessionService(verifier),
    });
    const sendMessage = jest.fn().mockResolvedValue(true);
    const socket = { readerId, state, sendMessage } as unknown as AuthenticatedWebSocket;
    const payloads = [
      undefined,
      null,
      {},
      { payload: { amountCents: 1000, page: 3, uid: 'forged', success: true, proof: 'forged' } },
      Object.defineProperty({}, 'payload', {
        get: () => {
          throw new Error('payload must not be read');
        },
      }),
    ];
    for (const data of payloads) {
      sendMessage.mockClear();
      await handler.handleProjectsOfUserRequest(socket, data as AttractapEvent['data']);
      expect(sendMessage).toHaveBeenCalledTimes(1);
      expect(sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: AttractapEventType.PROJECTS_OF_USER,
            payload: { error: 'USER_NOT_AUTHENTICATED' },
          }),
        }),
      );
      for (const method of Object.values(downstream)) expect(method).not.toHaveBeenCalled();
      expect(verifier.verify).not.toHaveBeenCalled();
    }
  });
});
