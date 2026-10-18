import { Duplex } from 'node:stream';
import { EventEmitter } from 'node:events';
import { TLSSocket } from 'node:tls';
import { WebSocket } from 'ws';
import { AttractapReaderIdentity } from '@attraccess/database-entities';
import { encodeReaderFrame, ReaderFrameDecoder, ReaderFrameType, READER_LIMITS } from './reader-frame';

export interface ProtectedReaderConnection {
  identity: AttractapReaderIdentity;
  generation: string;
  readonly ready: boolean;
  sendJson(value: unknown): void;
}
const connections = new WeakMap<object, ProtectedReaderConnection>();
export function protectedReaderConnection(socket: object): ProtectedReaderConnection | undefined {
  return connections.get(socket);
}

/** The stream owns all raw WS writes. No application helper can emit cleartext. */
export class ReaderCiphertextStream extends Duplex {
  inputPeak = 0;
  outputPeak = 0;
  constructor(private readonly ws: WebSocket) {
    super({ readableHighWaterMark: READER_LIMITS.tlsInput, writableHighWaterMark: READER_LIMITS.ciphertextQueue });
  }
  receive(bytes: Buffer): void {
    if (bytes.length > READER_LIMITS.wsMessage || this.readableLength + bytes.length > READER_LIMITS.ciphertextQueue)
      throw new Error('Reader ciphertext input exceeds limit');
    this.inputPeak = Math.max(this.inputPeak, this.readableLength + bytes.length);
    if (!this.push(bytes)) this.ws.pause();
  }
  _read(): void {
    this.ws.resume();
  }
  _write(bytes: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    if (bytes.length + this.ws.bufferedAmount > READER_LIMITS.ciphertextQueue) {
      callback(new Error('Reader ciphertext output exceeds limit'));
      return;
    }
    this.outputPeak = Math.max(this.outputPeak, bytes.length + this.ws.bufferedAmount);
    let offset = 0;
    const next = (error?: Error) => {
      if (error || offset === bytes.length) {
        callback(error);
        return;
      }
      const chunk = bytes.subarray(offset, offset + READER_LIMITS.wsMessage);
      offset += chunk.length;
      this.ws.send(chunk, { binary: true }, next);
    };
    next();
  }
}

/** Only authenticated plaintext is exposed to the existing Nest gateway. */
export class ProtectedReaderSocket extends EventEmitter {
  readonly readyState = WebSocket.OPEN;
  readonly connection: ProtectedReaderConnection;
  private readonly decoder: ReaderFrameDecoder;
  private closed = false;
  lastAuthenticatedInput = performance.now();

  constructor(
    identity: AttractapReaderIdentity,
    generation: string,
    private readonly tls: TLSSocket,
    private readonly ws: WebSocket,
    isActive: () => boolean = () => true,
  ) {
    super();
    const active = () =>
      !this.closed &&
      isActive() &&
      identity.validFrom?.getTime() <= Date.now() &&
      identity.validUntil?.getTime() > Date.now() &&
      !identity.revokedAt &&
      (!identity.retiredAt || identity.retiredAt.getTime() > Date.now());
    this.connection = {
      identity,
      generation,
      get ready() {
        return active();
      },
      sendJson: (value) => this.send(JSON.stringify(value)),
    };
    connections.set(this, this.connection);
    this.decoder = new ReaderFrameDecoder((type, body) => {
      if (!this.connection.ready) throw new Error('Reader credential is no longer active');
      if (type !== ReaderFrameType.Json) throw new Error('Unexpected inbound OTA');
      const parsed = JSON.parse(body.toString('utf8'));
      if (!parsed || typeof parsed.event !== 'string') throw new Error('Invalid reader JSON');
      this.lastAuthenticatedInput = performance.now();
      this.emit('message', { data: Buffer.from(body) });
    });
    tls.on('data', (data) => {
      try {
        if (typeof data === 'string') throw new Error('Unexpected TLS encoding');
        this.decoder.push(data);
      } catch {
        this.close();
      }
    });
    tls.once('error', () => this.close());
    tls.once('close', () => this.close());
    ws.once('close', () => this.close());
  }

  send(value: string | Buffer): void {
    if (!this.connection.ready) {
      this.close();
      throw new Error('Reader connection is closed');
    }
    const body = typeof value === 'string' ? Buffer.from(value, 'utf8') : value;
    try {
      const frame = encodeReaderFrame(typeof value === 'string' ? ReaderFrameType.Json : ReaderFrameType.Ota, body);
      if (this.tls.writableLength + frame.length > READER_LIMITS.ciphertextQueue)
        throw new Error('Reader plaintext output exceeds limit');
      this.tls.write(frame, () => frame.fill(0));
    } catch {
      this.close();
      throw new Error('Reader output rejected');
    }
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.decoder.close();
    this.tls.destroy();
    this.ws.terminate();
    this.emit('close');
    connections.delete(this);
  }
}
