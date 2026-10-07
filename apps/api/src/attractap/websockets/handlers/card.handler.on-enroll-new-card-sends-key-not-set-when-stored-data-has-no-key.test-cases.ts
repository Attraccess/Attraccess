import { AttractapEvent, AttractapEventType } from '../websocket.types';
import { OnEnrollNewCardTestScope } from './card.handler.spec';
export function registerOnEnrollNewCardSendsKeyNotSetWhenStoredDataHasNoKey(scope: OnEnrollNewCardTestScope): void {
  it('sends KEY_NOT_SET when stored data has no key', async () => {
    const socket = scope.createMockSocket({
      state: {
        lastAuthenticatedUserId: 1,
        enrollNewCardData: { userId: 1, key: '', keyNo: 1, cardUID: 'abc' },
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
