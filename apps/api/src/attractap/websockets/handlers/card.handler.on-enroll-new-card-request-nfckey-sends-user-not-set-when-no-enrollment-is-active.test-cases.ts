import { AttractapEvent, AttractapEventType } from '../websocket.types';
import { OnEnrollNewCardRequestNfckeyTestScope } from './card.handler.spec';
export function registerOnEnrollNewCardRequestNfckeySendsUserNotSetWhenNoEnrollmentIsActive(
  scope: OnEnrollNewCardRequestNfckeyTestScope,
): void {
  it('sends USER_NOT_SET when no enrollment is active', async () => {
    const socket = scope.createMockSocket();
    const data = { payload: { uid: 'abc', keyNo: 1 } } as AttractapEvent['data'];

    await scope.handler.onEnrollNewCardRequestNFCKey(socket, data);

    expect(socket.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: AttractapEventType.ENROLL_NEW_CARD_REQUEST_NFC_KEY,
          payload: { error: 'USER_NOT_SET' },
        }),
      }),
    );
    expect(scope.attractapService.getNFCCardByUID).not.toHaveBeenCalled();
  });
}
