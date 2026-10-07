import { AttractapEvent, AttractapEventType } from '../websocket.types';
import { OnResetNfcCardTestScope } from './card.handler.spec';
export function registerOnResetNfcCardSendsResetNfcCardDataNotSetWhenNoResetState(
  scope: OnResetNfcCardTestScope,
): void {
  it('sends RESET_NFC_CARD_DATA_NOT_SET when no reset state', async () => {
    const socket = scope.createMockSocket();
    const data = { payload: { success: true } } as AttractapEvent['data'];

    await scope.handler.onResetNfcCard(socket, data);

    expect(socket.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: AttractapEventType.RESET_NFC_CARD,
          payload: { error: 'RESET_NFC_CARD_DATA_NOT_SET' },
        }),
      }),
    );
    expect(scope.attractapService.deleteNFCCard).not.toHaveBeenCalled();
  });
}
