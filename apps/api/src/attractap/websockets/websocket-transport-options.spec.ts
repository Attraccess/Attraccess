import type { IncomingMessage } from 'http';
import { PAIRING_SUBPROTOCOL, SESSION_SUBPROTOCOL } from '../security/session-framing';
import { readerWebSocketOptions } from './websocket-transport-options';

describe('readerWebSocketOptions.verifyClient', () => {
  const verify = (protocol?: string) => {
    const callback = jest.fn();
    const headers = protocol ? { 'sec-websocket-protocol': protocol } : {};
    readerWebSocketOptions.verifyClient({ req: { headers } as unknown as IncomingMessage }, callback);
    return callback.mock.calls[0];
  };

  it.each([SESSION_SUBPROTOCOL, PAIRING_SUBPROTOCOL])('accepts %s', (protocol) => {
    expect(verify(protocol)).toEqual([true]);
  });

  it('accepts a connection without a subprotocol: an old reader that may only update its firmware', () => {
    expect(verify()).toEqual([true]);
  });

  it('refuses an unknown attractap subprotocol version', () => {
    expect(verify('attractap-v99')).toEqual([false, 400, 'Unsupported subprotocol version']);
  });
});
