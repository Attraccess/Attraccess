import { AttractapCardHandler } from './card.handler';
import { AuthenticatedWebSocket, AttractapEvent } from '../../websocket.types';

describe('card write foundation boundary', () => {
  it.each(['onEnrollNewCardRequestNFCKey', 'onEnrollNewCard', 'onResetNfcCard'] as const)(
    'denies %s without reading forged success or fetching keys',
    async (method) => {
      const handler = new AttractapCardHandler();
      const touched = jest.fn(() => {
        throw new Error('secret canary');
      });
      Object.assign(handler, {
        attractapService: new Proxy({}, { get: touched }),
        usersService: new Proxy({}, { get: touched }),
      });
      const state = {
        lastAuthenticatedUserId: 7,
        enrollment: { userId: 7 },
        enrollNewCardData: { key: 'secret canary' },
        resetNfcCardData: { cardId: 1, key: 'secret canary' },
      };
      const sendMessage = jest.fn().mockResolvedValue(true);
      const socket = { state, sendMessage } as unknown as AuthenticatedWebSocket;
      const data = Object.defineProperty({}, 'payload', { get: touched });
      await handler[method](socket, data as AttractapEvent['data']);
      expect(touched).not.toHaveBeenCalled();
      expect(state).toEqual({
        lastAuthenticatedUserId: null,
        enrollment: null,
        enrollNewCardData: null,
        resetNfcCardData: null,
      });
      expect(sendMessage).toHaveBeenCalledTimes(1);
      expect(sendMessage.mock.calls[0][0].data.payload).toEqual({ error: 'CARD_VERIFICATION_UNAVAILABLE' });
    },
  );
  it('rejects browser enrollment and reset before accessing reader/card records', async () => {
    const handler = new AttractapCardHandler();
    await expect(handler.startEnrollOfNewNfcCard({ readerId: 1, userId: 7 })).rejects.toThrow(
      'CARD_VERIFICATION_UNAVAILABLE',
    );
    await expect(handler.startResetOfNfcCard({ readerId: 1, userId: 7, cardId: 3 })).rejects.toThrow(
      'CARD_VERIFICATION_UNAVAILABLE',
    );
  });
});
