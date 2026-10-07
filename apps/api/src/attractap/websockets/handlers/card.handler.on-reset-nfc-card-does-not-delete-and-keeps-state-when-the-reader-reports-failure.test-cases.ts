import { AttractapEvent } from '../websocket.types';
import { OnResetNfcCardTestScope } from './card.handler.spec';
export function registerOnResetNfcCardDoesNotDeleteAndKeepsStateWhenTheReaderReportsFailure(
  scope: OnResetNfcCardTestScope,
): void {
  it('does not delete and keeps state when the reader reports failure', async () => {
    const socket = scope.createMockSocket({ state: { resetNfcCardData: { cardId: 7, key: 'x', keyNo: 1 } } });
    const data = { payload: { success: false } } as AttractapEvent['data'];

    await scope.handler.onResetNfcCard(socket, data);

    expect(scope.attractapService.deleteNFCCard).not.toHaveBeenCalled();
    expect(socket.state.resetNfcCardData).toEqual({ cardId: 7, key: 'x', keyNo: 1 });
  });
}
