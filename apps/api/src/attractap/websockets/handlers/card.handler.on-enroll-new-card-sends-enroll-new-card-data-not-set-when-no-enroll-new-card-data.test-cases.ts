import { AttractapEvent, AttractapEventType } from '../websocket.types';
import { OnEnrollNewCardTestScope } from './card.handler.spec';
export function registerOnEnrollNewCardSendsEnrollNewCardDataNotSetWhenNoEnrollNewCardData(
  scope: OnEnrollNewCardTestScope,
): void {
  it('sends ENROLL_NEW_CARD_DATA_NOT_SET when no enrollNewCardData', async () => {
    const socket = scope.createMockSocket();
    const data = { payload: { success: true } } as AttractapEvent['data'];

    await scope.handler.onEnrollNewCard(socket, data);

    expect(socket.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: AttractapEventType.ENROLL_NEW_CARD,
          payload: { error: 'ENROLL_NEW_CARD_DATA_NOT_SET' },
        }),
      }),
    );
  });
}
