import { AttractapCardHandler } from './card.handler';
import { AuthenticatedWebSocket, AttractapEvent } from '../../websocket.types';

describe('reader card authentication foundation boundary', () => {
  it('never associates a user or exports keys from a UID or success claim', async () => {
    const handler = new AttractapCardHandler();
    const lookup = jest.fn();
    Object.assign(handler, { attractapService: { getNFCCardByUID: lookup } });
    const state = { lastAuthenticatedUserId: 7 };
    const sendMessage = jest.fn().mockResolvedValue(true);
    await handler.handleCardAuthenticationRequest(
      { state, sendMessage } as unknown as AuthenticatedWebSocket,
      { payload: { uid: '04010203040506', resourceId: 1, success: true, proof: 'forged' } } as AttractapEvent['data'],
    );
    expect(state.lastAuthenticatedUserId).toBeNull();
    expect(lookup).not.toHaveBeenCalled();
    expect(sendMessage.mock.calls[0][0].data.payload).toEqual({ error: 'CARD_VERIFICATION_UNAVAILABLE' });
  });
});
