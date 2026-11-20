import type { IncomingMessage } from 'http';
import { RefusedUpgradeLog } from './refused-upgrade-log';
import { readerWebSocketOptions, refusedUpgrades } from './websocket-transport-options';

describe('RefusedUpgradeLog', () => {
  let warn: jest.Mock;
  let log: RefusedUpgradeLog;

  beforeEach(() => {
    jest.useFakeTimers();
    warn = jest.fn();
    log = new RefusedUpgradeLog({ warn }, 60_000);
  });

  afterEach(() => {
    log.reset();
    jest.useRealTimers();
  });

  it('logs the first refusal right away and the ones after it as one summary per window', () => {
    log.note();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('token sign-in no longer supported');

    for (let i = 0; i < 5; i++) log.note();
    jest.advanceTimersByTime(59_999);
    expect(warn).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(1);
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn.mock.calls[1][0]).toMatch(/^Refused 5 more reader connection\(s\) in the last 60 s: token sign-in/);

    // The next window counts on its own.
    log.note();
    log.note();
    jest.advanceTimersByTime(60_000);
    expect(warn).toHaveBeenCalledTimes(3);
    expect(warn.mock.calls[2][0]).toMatch(/^Refused 2 more/);
  });

  it('stops after a quiet window and logs the next refusal right away again', () => {
    log.note();
    jest.advanceTimersByTime(60_000);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);

    log.note();
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn.mock.calls[1][0]).toMatch(/^Refused a reader connection/);
  });

  it('never logs more lines than refusals, and keeps no timer once refusals stop', () => {
    for (let i = 0; i < 1000; i++) {
      log.note();
      jest.advanceTimersByTime(10_000);
    }
    // 1 first line + one summary per 60 s window over 10 000 s.
    expect(warn.mock.calls.length).toBeLessThanOrEqual(1 + Math.ceil(10_000_000 / 60_000));
    jest.advanceTimersByTime(120_000);
    expect(jest.getTimerCount()).toBe(0);
  });
});

describe('readerWebSocketOptions.verifyClient', () => {
  afterEach(() => refusedUpgrades.reset());

  const verify = (protocol?: string) => {
    const callback = jest.fn();
    const headers = protocol ? { 'sec-websocket-protocol': protocol } : {};
    readerWebSocketOptions.verifyClient({ req: { headers } as unknown as IncomingMessage }, callback);
    return callback;
  };

  it('refuses a connection without a subprotocol through the aggregated log', () => {
    const note = jest.spyOn(refusedUpgrades, 'note').mockImplementation(() => undefined);

    expect(verify().mock.calls[0]).toEqual([false, 400, 'Token sign-in is no longer supported']);
    expect(note).toHaveBeenCalledTimes(1);
    note.mockRestore();
  });

  it('refuses an unknown attractap subprotocol version without logging a refusal', () => {
    const note = jest.spyOn(refusedUpgrades, 'note');

    expect(verify('attractap-v99').mock.calls[0]).toEqual([false, 400, 'Unsupported subprotocol version']);
    expect(note).not.toHaveBeenCalled();
    note.mockRestore();
  });
});
