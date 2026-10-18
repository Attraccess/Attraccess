import { AttractapSupervisionHandler } from './supervision.handler';
import { AuthenticatedWebSocket, AttractapEvent } from '../../websocket.types';

describe('supervision foundation boundary', () => {
  it('cannot arm a reader from a browser request', async () => {
    const handler = new AttractapSupervisionHandler();
    const setReaderArmer = jest.fn();
    Object.assign(handler, { supervisionService: { setReaderArmer } });
    handler.onModuleInit();
    await expect(setReaderArmer.mock.calls[0][0].arm({})).rejects.toThrow('CARD_VERIFICATION_UNAVAILABLE');
  });
  it.each([
    'handleSupervisorCardAuthConfirmed',
    'handleSupervisorCardAuthRequest',
    'handleSupervisionRequest',
  ] as const)('rejects %s and cancels pending work without looking up a card', async (method) => {
    const handler = new AttractapSupervisionHandler();
    const cancelReaderRequest = jest.fn();
    const lookup = jest.fn();
    Object.assign(handler, {
      supervisionService: { cancelReaderRequest },
      attractapService: { getNFCCardByUID: lookup },
    });
    const state = {
      lastAuthenticatedUserId: 7,
      supervisionFlow: { requestId: 'pending', approvedSupervisorUserId: 12 },
    };
    const sendMessage = jest.fn().mockResolvedValue(true);
    await handler[method](
      { state, sendMessage } as unknown as AuthenticatedWebSocket,
      { payload: { success: true, uid: 'forged' } } as AttractapEvent['data'],
    );
    expect(cancelReaderRequest).toHaveBeenCalledTimes(1);
    expect(state.supervisionFlow).toBeNull();
    expect(state.lastAuthenticatedUserId).toBeNull();
    expect(lookup).not.toHaveBeenCalled();
    expect(sendMessage.mock.calls[0][0].data.payload).toEqual({ error: 'CARD_VERIFICATION_UNAVAILABLE' });
  });
});
