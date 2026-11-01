import { CARD_SESSION_GRACE_MS, CardSessionService, UNLOCKED_TIMEOUT_MS } from './card-session.service';
import { makeSocket } from './ui-test-helpers.test-fixture';

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

  describe('resume', () => {
    const LIFETIME = UNLOCKED_TIMEOUT_MS + CARD_SESSION_GRACE_MS;

    it('restarts the timer when a reader message carries the live session id of the same user', () => {
      const service = new CardSessionService();
      const socket = makeSocket();
      const session = service.issue(socket, 7, 'en');
      jest.advanceTimersByTime(LIFETIME - 1000);
      expect(service.resume(socket, session.id, 7)).toBe(true);
      jest.advanceTimersByTime(LIFETIME - 1000);
      expect(service.current(socket)?.id).toBe(session.id);
      jest.advanceTimersByTime(1001);
      expect(service.current(socket)).toBeNull();
    });

    it('ignores a foreign id, another user and a missing id', () => {
      const service = new CardSessionService();
      const socket = makeSocket();
      const session = service.issue(socket, 7, 'en');
      expect(service.resume(socket, 'other', 7)).toBe(false);
      expect(service.resume(socket, session.id, 8)).toBe(false);
      expect(service.resume(socket, undefined, 7)).toBe(false);
      expect(service.resume(socket, session.id, null)).toBe(false);
    });

    it('revives the session the server timer expired, once, for the same user', () => {
      const service = new CardSessionService();
      const started = jest.fn();
      service.onStarted(started);
      const socket = makeSocket();
      const session = service.issue(socket, 7, 'en');
      jest.advanceTimersByTime(LIFETIME + 1);
      expect(service.current(socket)).toBeNull();
      expect(service.resume(socket, session.id, 8)).toBe(false);
      expect(service.resume(socket, session.id, 7)).toBe(true);
      expect(service.current(socket)).toMatchObject({ id: session.id, userId: 7, language: 'en' });
      expect(started).toHaveBeenLastCalledWith(socket, expect.objectContaining({ id: session.id }), null);
      jest.advanceTimersByTime(LIFETIME + 1);
      expect(service.current(socket)).toBeNull();
    });

    it('never revives after a newer tap or after the reader ended the session', () => {
      const service = new CardSessionService();
      const socket = makeSocket();
      const old = service.issue(socket, 7, 'en');
      jest.advanceTimersByTime(LIFETIME + 1);
      const newer = service.issue(socket, 7, 'en');
      service.end(socket, newer.id, 'reader');
      expect(service.resume(socket, old.id, 7)).toBe(false);

      const other = makeSocket();
      const ended = service.issue(other, 7, 'en');
      jest.advanceTimersByTime(LIFETIME + 1);
      service.end(other, ended.id, 'reader');
      expect(service.resume(other, ended.id, 7)).toBe(false);
    });

    it('does not let a closing step shorten a freshly resumed session', () => {
      const service = new CardSessionService();
      const socket = makeSocket();
      const session = service.issue(socket, 7, 'en');
      service.resume(socket, session.id, 7);
      service.rearm(socket);
      jest.advanceTimersByTime(CARD_SESSION_GRACE_MS * 2 + 1);
      expect(service.current(socket)?.id).toBe(session.id);
    });
  });

  it('releases the session silently on disconnect', () => {
    const service = new CardSessionService();
    const ended = jest.fn();
    service.onEnded(ended);
    const socket = makeSocket();
    const session = service.issue(socket, 7, 'en');
    expect(service.end(socket, null, 'disconnect')).toBe(true);
    expect(service.current(socket)).toBeNull();
    expect(ended).not.toHaveBeenCalled();
    expect(service.resume(socket, session.id, 7)).toBe(false);
  });
});
