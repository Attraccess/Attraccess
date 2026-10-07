import { AttractapEvent, AttractapEventType } from '../websocket.types';
import { OnEnrollNewCardTestScope } from './card.handler.spec';
export function registerOnEnrollNewCardSendsKeyNotSetWhenStoredDataHasNoKeyNo(scope: OnEnrollNewCardTestScope): void {
  it('sends KEY_NOT_SET when stored data has no keyNo', async () => {
    const socket = scope.createMockSocket({
      state: {
        lastAuthenticatedUserId: 1,
        enrollNewCardData: { userId: 1, key: 'deadbeef', keyNo: 0, cardUID: 'abc' },
      },
    });
    const data = { payload: { success: true } } as AttractapEvent['data'];

    await scope.handler.onEnrollNewCard(socket, data);

    expect(socket.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: AttractapEventType.ENROLL_NEW_CARD,
          payload: { error: 'KEY_NOT_SET' },
        }),
      }),
    );
  });
}
