/** Version 1 plaintext framing inside the authenticated reader TLS stream. */
export const READER_LIMITS = Object.freeze({
  wsMessage: 4096,
  tlsInput: 16384,
  tlsOutput: 4096,
  ciphertextQueue: 32768,
  bootstrap: 640,
  json: 8192,
  ota: 4096,
  envelope: 8200,
});

export enum ReaderFrameType {
  Json = 1,
  Ota = 2,
  /** Reserved for ATT-950. This delivery always rejects this type. */
  Apdu = 3,
}

function bodyLimit(type: number): number {
  switch (type) {
    case ReaderFrameType.Json:
      return READER_LIMITS.json;
    case ReaderFrameType.Ota:
      return READER_LIMITS.ota;
    default:
      throw new Error('Unsupported reader frame type');
  }
}

export function encodeReaderFrame(type: ReaderFrameType, payload: Uint8Array): Buffer {
  if (payload.byteLength > bodyLimit(type)) throw new Error('Reader frame exceeds limit');
  const frame = Buffer.alloc(8 + payload.byteLength);
  frame[0] = 1;
  frame[1] = type;
  frame.writeUInt32BE(payload.byteLength, 4);
  frame.set(payload, 8);
  return frame;
}

/** Incremental parser. A peer's length is checked before any body allocation. */
export class ReaderFrameDecoder {
  private readonly header = Buffer.alloc(8);
  private headerLength = 0;
  private body: Buffer | undefined;
  private bodyLength = 0;
  private failed = false;

  constructor(private readonly dispatch: (type: ReaderFrameType, body: Buffer) => void) {}

  push(input: Uint8Array): void {
    if (this.failed) throw new Error('Reader frame decoder is closed');
    let offset = 0;
    try {
      while (offset < input.byteLength) {
        if (!this.body) {
          const count = Math.min(8 - this.headerLength, input.byteLength - offset);
          this.header.set(input.subarray(offset, offset + count), this.headerLength);
          this.headerLength += count;
          offset += count;
          if (this.headerLength < 8) continue;
          if (this.header[0] !== 1 || this.header.readUInt16BE(2) !== 0) {
            throw new Error('Unsupported reader frame header');
          }
          const length = this.header.readUInt32BE(4);
          if (length > bodyLimit(this.header[1])) throw new Error('Reader frame exceeds limit');
          this.body = Buffer.alloc(length);
        }
        const count = Math.min(this.body.length - this.bodyLength, input.byteLength - offset);
        this.body.set(input.subarray(offset, offset + count), this.bodyLength);
        offset += count;
        this.bodyLength += count;
        if (this.bodyLength === this.body.length) {
          const type = this.header[1];
          const body = this.body;
          this.body = undefined;
          this.bodyLength = this.headerLength = 0;
          try {
            this.dispatch(type, body);
          } finally {
            body.fill(0);
          }
        }
      }
    } catch (error) {
      this.close();
      throw error;
    }
  }

  close(): void {
    this.failed = true;
    this.header.fill(0);
    this.body?.fill(0);
    this.body = undefined;
    this.headerLength = this.bodyLength = 0;
  }
}
