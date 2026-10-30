import { Duplex } from 'stream';
import type { WebSocket } from 'ws';

/** Pending outgoing bytes allowed per reader. */
export const SEND_QUEUE_LIMIT_BYTES = 64 * 1024;
/** Bytes the TLS layer may buffer before the handshake has a slot. */
const PRE_HANDSHAKE_LIMIT_BYTES = 16 * 1024;
/** Below Node's 1 KiB initial TLS input buffer (src/crypto/crypto_bio.h kInitialBufferLength). */
const TLS_FEED_PIECE_BYTES = 1000;

/**
 * Presents the binary frames of a WebSocket as a byte stream so that TLS can run inside it.
 * Text frames never reach the stream; the owner decides what to do with them.
 */
export class WsByteStream extends Duplex {
  // Captured up front: the owner may later replace `ws.send` with a function that writes into TLS.
  private readonly rawSend: WebSocket['send'];

  public constructor(
    private readonly ws: WebSocket,
    public readLimitBytes = PRE_HANDSHAKE_LIMIT_BYTES,
  ) {
    super({ allowHalfOpen: false });
    this.rawSend = ws.send.bind(ws);
  }

  /** Called by the owner for every binary frame. Returns false when the peer flooded us. */
  public feed(chunk: Buffer): boolean {
    if (this.readableLength + chunk.length > this.readLimitBytes) return false;
    // Node's TLS input buffer starts at 1 KiB. A read that fills it makes Node add a 16 KiB
    // buffer that is kept for the life of the session; OpenSSL drains smaller pieces each time.
    for (let offset = 0; offset < chunk.length; offset += TLS_FEED_PIECE_BYTES) {
      this.push(chunk.subarray(offset, offset + TLS_FEED_PIECE_BYTES));
    }
    return true;
  }

  public _read(): void {
    // Data is pushed by feed().
  }

  public _write(chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    // writableLength includes this chunk: only what is queued behind it counts against the limit.
    if (this.writableLength - chunk.length > SEND_QUEUE_LIMIT_BYTES) {
      callback(new Error('send queue limit exceeded'));
      return;
    }
    if (this.ws.readyState !== this.ws.OPEN) {
      callback(new Error('websocket closed'));
      return;
    }
    this.rawSend(chunk, { binary: true }, (error) => callback(error ?? null));
  }

  public _destroy(error: Error | null, callback: (error?: Error | null) => void): void {
    callback(error);
  }
}
