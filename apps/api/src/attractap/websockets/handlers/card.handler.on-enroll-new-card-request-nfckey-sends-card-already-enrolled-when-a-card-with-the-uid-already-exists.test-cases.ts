import { AttractapEvent, AttractapEventType } from '../websocket.types';
import { OnEnrollNewCardRequestNfckeyTestScope } from './card.handler.spec';
export function registerOnEnrollNewCardRequestNfckeySendsCardAlreadyEnrolledWhenACardWithTheUidAlreadyExists(
  scope: OnEnrollNewCardRequestNfckeyTestScope,
): void {
  it('sends CARD_ALREADY_ENROLLED when a card with the uid already exists', async () => {
    const socket = scope.createMockSocket({
      state: { enrollment: { userId: 1, auditPrincipal: { userId: 1, authenticationMethod: 'session' } } },
    });
    scope.attractapService.getNFCCardByUID.mockResolvedValueOnce({ id: 9 });
    const data = { payload: { uid: 'abc', keyNo: 1 } } as AttractapEvent['data'];

    await scope.handler.onEnrollNewCardRequestNFCKey(socket, data);

    expect(socket.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: AttractapEventType.ENROLL_NEW_CARD_REQUEST_NFC_KEY,
          payload: { error: 'CARD_ALREADY_ENROLLED' },
        }),
      }),
    );
    expect(scope.attractapService.generateNTAG424Key).not.toHaveBeenCalled();
  });
}
