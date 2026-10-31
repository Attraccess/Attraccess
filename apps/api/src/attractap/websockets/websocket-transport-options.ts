import type { IncomingMessage } from 'http';
import { PAIRING_SUBPROTOCOL, SESSION_SUBPROTOCOL } from '../security/session-framing';

/**
 * Bounds every incoming message before it is buffered. The largest legitimate one is a crash
 * report (32 KiB coredump, ~44 KiB as JSON); session frames carry TLS records of <= ~16 KiB.
 */
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

/**
 * `ws` server options for the reader endpoint. Subprotocols select the transport: none = legacy,
 * session = TLS 1.3 inside binary frames, pairing = the unauthenticated pairing handshake.
 * Unknown `attractap-*` versions are refused at upgrade with HTTP 400.
 */
export const readerWebSocketOptions = {
  maxPayload: MAX_READER_FRAME_BYTES,
  verifyClient: (info: { req: IncomingMessage }, callback: (ok: boolean, code?: number, message?: string) => void) => {
    const offered = offeredSubprotocols(info.req);
    const unknownVersion =
      offered.some((p) => p.startsWith(ATTRACTAP_SUBPROTOCOL_PREFIX)) &&
      !offered.some((p) => KNOWN_SUBPROTOCOLS.has(p));
    if (unknownVersion) callback(false, 400, 'Unsupported subprotocol version');
    else callback(true);
  },
  handleProtocols: (protocols: Set<string>) => {
    if (protocols.has(SESSION_SUBPROTOCOL)) return SESSION_SUBPROTOCOL;
    if (protocols.has(PAIRING_SUBPROTOCOL)) return PAIRING_SUBPROTOCOL;
    return false;
  },
};
