import { ResourceActionGuard } from './resource-action.guard';
import { AuthenticatedWebSocket, AttractapEventType } from '../websocket.types';
import { VerifiedCardSessionService } from '../../security/verified-card-session.service';

describe('resource proof foundation boundary', () => {
  it.each([null, 0, 7])('denies cached identity %s before reader/user lookup', async (userId) => {
    const guard = new ResourceActionGuard();
    const lookup = jest.fn(() => {
      throw new Error('must not query');
    });
    Object.assign(guard, {
      proofs: new VerifiedCardSessionService(),
      attractapService: { findReaderById: lookup },
      usersService: { findOne: lookup },
    });
    const sendMessage = jest.fn().mockResolvedValue(true);
    const state = { lastAuthenticatedUserId: userId, verifiedCardOperation: { handle: 'forged', binding: {} } };
    expect(
      await guard.validateResourceAction(
        { readerId: 1, state, sendMessage } as unknown as AuthenticatedWebSocket,
        10,
        AttractapEventType.UNLOCK_DOOR,
        17,
      ),
    ).toBe(false);
    expect(lookup).not.toHaveBeenCalled();
    expect(state.verifiedCardOperation).toBeUndefined();
    expect(sendMessage.mock.calls[0][0].data.payload).toEqual({ error: 'USER_NOT_AUTHENTICATED', requestId: 17 });
  });
});
