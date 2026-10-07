import { AttractapEvent, AttractapEventType } from '../websocket.types';
import { OnEnrollNewCardRequestNfckeyTestScope } from './card.handler.spec';
export function registerOnEnrollNewCardRequestNfckeySendsInvalidParamsWhenKeyNoIsMissing(
  scope: OnEnrollNewCardRequestNfckeyTestScope,
): void {
  it('sends INVALID_PARAMS when keyNo is missing', async () => {
    const socket = scope.createMockSocket({
      state: { enrollment: { userId: 1, auditPrincipal: { userId: 1, authenticationMethod: 'session' } } },
    });
    const data = { payload: { uid: 'abc', keyNo: 0 } } as AttractapEvent['data'];

    await scope.handler.onEnrollNewCardRequestNFCKey(socket, data);

    expect(socket.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: AttractapEventType.ENROLL_NEW_CARD_REQUEST_NFC_KEY,
          payload: { error: 'INVALID_PARAMS' },
        }),
      }),
    );
  });
}
