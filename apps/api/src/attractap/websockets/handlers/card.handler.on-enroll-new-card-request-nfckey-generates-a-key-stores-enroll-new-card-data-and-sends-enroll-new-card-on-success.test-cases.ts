import { AttractapEvent, AttractapEventType } from '../websocket.types';
import { OnEnrollNewCardRequestNfckeyTestScope } from './card.handler.spec';
export function registerOnEnrollNewCardRequestNfckeyGeneratesAKeyStoresEnrollNewCardDataAndSendsEnrollNewCardOnSuccess(
  scope: OnEnrollNewCardRequestNfckeyTestScope,
): void {
  it('generates a key, stores enrollNewCardData and sends ENROLL_NEW_CARD on success', async () => {
    const socket = scope.createMockSocket({
      state: { enrollment: { userId: 1, auditPrincipal: { userId: 1, authenticationMethod: 'session' } } },
    });
    const data = { payload: { uid: 'abc', keyNo: 2 } } as AttractapEvent['data'];

    await scope.handler.onEnrollNewCardRequestNFCKey(socket, data);

    expect(scope.attractapService.generateNTAG424Key).toHaveBeenCalledWith({
      userId: 1,
      keyNo: 2,
      cardUID: 'abc',
    });
    expect(scope.attractapService.uint8ArrayToHexString).toHaveBeenCalledWith(new Uint8Array([1, 2, 3]));
    expect(socket.state.enrollNewCardData).toEqual({
      userId: 1,
      keyNo: 2,
      key: 'deadbeef',
      cardUID: 'abc',
      auditPrincipal: { userId: 1, authenticationMethod: 'session' },
    });
    expect(socket.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: AttractapEventType.ENROLL_NEW_CARD,
          payload: { key: 'deadbeef', keyNo: 2 },
        }),
      }),
    );
  });
}
