import type { IncomingMessage } from 'http';
import { PAIRING_SUBPROTOCOL, SESSION_SUBPROTOCOL } from '../security/session-framing';
import { RefusedUpgradeLog } from './refused-upgrade-log';

/** Bounds every incoming message before it is buffered. Session frames carry TLS records of <= ~16 KiB. */
const MAX_READER_FRAME_BYTES = 128 * 1024;
const ATTRACTAP_SUBPROTOCOL_PREFIX = 'attractap-';
const KNOWN_SUBPROTOCOLS = new Set([SESSION_SUBPROTOCOL, PAIRING_SUBPROTOCOL]);

function offeredSubprotocols(request: IncomingMessage): string[] {
  const header = request.headers['sec-websocket-protocol'];
  if (!header) return [];
  return (Array.isArray(header) ? header.join(',') : header)
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
}

/** Shared by every refused upgrade of this process; exported for tests. */
export const refusedUpgrades = new RefusedUpgradeLog();

/**
 * `ws` server options for the reader endpoint. Subprotocols select the transport: session = TLS 1.3 inside
 * binary frames, pairing = the unauthenticated pairing handshake. A connection that offers neither (a reader
 * with token sign-in) and unknown `attractap-*` versions are refused at upgrade with HTTP 400.
 */
export const readerWebSocketOptions = {
  maxPayload: MAX_READER_FRAME_BYTES,
  verifyClient: (info: { req: IncomingMessage }, callback: (ok: boolean, code?: number, message?: string) => void) => {
    const offered = offeredSubprotocols(info.req);
    if (offered.some((p) => KNOWN_SUBPROTOCOLS.has(p))) return callback(true);
    if (offered.some((p) => p.startsWith(ATTRACTAP_SUBPROTOCOL_PREFIX))) {
      return callback(false, 400, 'Unsupported subprotocol version');
    }
    // At most one line per refused upgrade, aggregated over time; nothing of the request is logged.
    refusedUpgrades.note();
    callback(false, 400, 'Token sign-in is no longer supported');
  },
  handleProtocols: (protocols: Set<string>) => {
    if (protocols.has(SESSION_SUBPROTOCOL)) return SESSION_SUBPROTOCOL;
    if (protocols.has(PAIRING_SUBPROTOCOL)) return PAIRING_SUBPROTOCOL;
    return false;
  },
};
