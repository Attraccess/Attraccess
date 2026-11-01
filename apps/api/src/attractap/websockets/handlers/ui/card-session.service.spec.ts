import { CARD_SESSION_GRACE_MS, CardSessionService, UNLOCKED_TIMEOUT_MS } from './card-session.service';
import { makeSocket } from './ui-test-helpers';

describe('CardSessionService', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('issues a new id per card authentication and ends only the matching session', () => {
    const service = new CardSessionService();
    const socket = makeSocket();
    const first = service.issue(socket, 7, 'en');
    const second = service.issue(socket, 8, 'de');
    expect(first.id).not.toBe(second.id);
    expect(service.end(socket, first.id, 'reader')).toBe(false);
    expect(service.isLive(socket, second.id)).toBe(true);
    expect(service.end(socket, second.id, 'reader')).toBe(true);
    expect(service.current(socket)).toBeNull();
  });

  it('expires a card session itself after the reader timeout plus grace', () => {
    const service = new CardSessionService();
    const ended = jest.fn();
    service.onEnded(ended);
    const socket = makeSocket();
    service.issue(socket, 7, 'en');
    jest.advanceTimersByTime(UNLOCKED_TIMEOUT_MS + CARD_SESSION_GRACE_MS - 1);
    expect(ended).not.toHaveBeenCalled();
    jest.advanceTimersByTime(2);
    expect(ended).toHaveBeenCalledWith(socket, expect.objectContaining({ userId: 7 }), 'expired');
  });

  it('does not expire while a step is open', () => {
    const service = new CardSessionService();
    const socket = makeSocket();
    service.issue(socket, 7, 'en');
    socket.state.uiSteps = new Map([['x', {}]]);
    jest.advanceTimersByTime(UNLOCKED_TIMEOUT_MS + CARD_SESSION_GRACE_MS + 1);
    expect(service.current(socket)).not.toBeNull();
    socket.state.uiSteps.clear();
    jest.advanceTimersByTime(CARD_SESSION_GRACE_MS * 2 + 1);
    expect(service.current(socket)).toBeNull();
  });
});
