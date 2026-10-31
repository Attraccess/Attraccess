/**
 * Message framing inside the TLS byte stream: [type:u8][length:u32 BE][payload].
 * The session layer never inspects payload contents.
 */
export const SESSION_SUBPROTOCOL = 'attractap-session.v1';
export const PAIRING_SUBPROTOCOL = 'attractap-pairing.v1';

/** Largest legitimate message is a crash report: 32 KiB coredump -> ~44 KiB base64 + JSON. */
export const MAX_MESSAGE_BYTES = 64 * 1024;
export const HEADER_BYTES = 5;

export enum FrameType {
  /** UTF-8 JSON application event. */
  JSON = 1,
  /** Binary application data (OTA chunks). */
  BINARY = 2,
  /** Reader keep-alive, empty payload. */
  HEARTBEAT = 3,
  /** Session-layer control message (JSON), never handed to application handlers. */
  CONTROL = 4,
}

export class FramingError extends Error {}

export function encodeFrame(type: FrameType, payload: Buffer): Buffer {
  if (payload.length > MAX_MESSAGE_BYTES) throw new FramingError('message exceeds maximum size');
  const header = Buffer.allocUnsafe(HEADER_BYTES);
  header.writeUInt8(type, 0);
  header.writeUInt32BE(payload.length, 1);
  return Buffer.concat([header, payload]);
}

export interface Frame {
  type: FrameType;
  payload: Buffer;
}

const EMPTY = Buffer.alloc(0);

/** Incremental decoder; throws FramingError on any protocol violation. */
export class FrameDecoder {
  private buffered: Buffer = Buffer.alloc(0);

  public push(chunk: Buffer): Frame[] {
    this.buffered = this.buffered.length === 0 ? chunk : Buffer.concat([this.buffered, chunk]);
    const frames: Frame[] = [];
    while (this.buffered.length >= HEADER_BYTES) {
      const type = this.buffered.readUInt8(0);
      const length = this.buffered.readUInt32BE(1);
      if (!(type in FrameType) || typeof FrameType[type] !== 'string') throw new FramingError('unknown frame type');
      if (length > MAX_MESSAGE_BYTES) throw new FramingError('message exceeds maximum size');
      if (this.buffered.length < HEADER_BYTES + length) break;
      frames.push({ type, payload: Buffer.from(this.buffered.subarray(HEADER_BYTES, HEADER_BYTES + length)) });
      this.buffered = this.buffered.subarray(HEADER_BYTES + length);
    }
    // Never keep a view: a TLS 'data' chunk is a slice of a 64 KiB allocation that would stay
    // alive for as long as the session is idle.
    this.buffered = this.buffered.length === 0 ? EMPTY : Buffer.from(this.buffered);
    return frames;
  }
}
