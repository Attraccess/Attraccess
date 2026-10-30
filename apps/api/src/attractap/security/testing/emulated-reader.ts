import { connect as tlsConnect, TLSSocket } from 'tls';
import { WebSocket } from 'ws';
import { INSTALLATION_URI_PREFIX, uriSanValue, x509 } from '../pki';
import { FrameDecoder, FrameType, SESSION_SUBPROTOCOL, encodeFrame, Frame } from '../session-framing';
import { WsByteStream } from '../ws-byte-stream';

export interface EmulatedReaderIdentity {
  privateKeyPem: string;
  certificatePem: string;
  caCertificatePem: string;
  installationId: string;
}

export interface EmulatedReaderOptions {
  url: string;
  identity: EmulatedReaderIdentity;
  subprotocol?: string | null;
  minVersion?: 'TLSv1.2' | 'TLSv1.3';
  maxVersion?: 'TLSv1.2' | 'TLSv1.3';
  /** A TLS session from an earlier connection, to prove the server never resumes it. */
  session?: Buffer;
}

/**
 * Speaks the production session protocol the way the reader firmware does. Used by the API
 * tests and the load test; it is not a model of the firmware's memory behaviour.
 */
export class EmulatedReader {
  public tls: TLSSocket | null = null;
  public ws: WebSocket | null = null;
  public stream: WsByteStream | null = null;
  public readonly frames: Frame[] = [];
  /** The last TLS session (ticket) the server handed out, if any. */
  public session: Buffer | null = null;
  public readonly closed: Promise<void>;
  private resolveClosed!: () => void;
  private readonly decoder = new FrameDecoder();
  private waiters: Array<() => void> = [];

  public constructor(private readonly options: EmulatedReaderOptions) {
    this.closed = new Promise((resolve) => (this.resolveClosed = resolve));
  }

  public async connect(): Promise<void> {
    const protocols = this.options.subprotocol === null ? [] : [this.options.subprotocol ?? SESSION_SUBPROTOCOL];
    const ws = new WebSocket(this.options.url, protocols);
    this.ws = ws;
    ws.on('close', () => this.resolveClosed());
    ws.on('error', () => undefined);
    await new Promise<void>((resolve, reject) => {
      ws.once('open', resolve);
      ws.once('error', reject);
    });

    const stream = new WsByteStream(ws, 1024 * 1024);
    this.stream = stream;
    ws.on('message', (data: Buffer, isBinary: boolean) => {
      if (isBinary) stream.feed(Buffer.from(data));
    });
    ws.on('close', () => stream.destroy());

    const { identity } = this.options;
    const tls = tlsConnect({
      socket: stream,
      key: identity.privateKeyPem,
      cert: identity.certificatePem,
      ca: identity.caCertificatePem,
      minVersion: this.options.minVersion ?? 'TLSv1.3',
      maxVersion: this.options.maxVersion ?? 'TLSv1.3',
      session: this.options.session,
      // Like the firmware: P-256 only, so the ClientHello is small and needs no HelloRetryRequest.
      ecdhCurve: 'prime256v1',
      // The installation ID, not the hostname, identifies the server.
      checkServerIdentity: (_host, cert) => {
        const parsed = new x509.X509Certificate(cert.raw);
        return uriSanValue(parsed, INSTALLATION_URI_PREFIX) === identity.installationId
          ? undefined
          : new Error('wrong installation');
      },
    });
    this.tls = tls;
    tls.on('session', (session: Buffer) => (this.session = session));
    // Errors after the handshake just end the connection; 'close' handles the rest.
    tls.on('error', () => undefined);
    tls.on('data', (chunk: Buffer) => {
      for (const frame of this.decoder.push(chunk)) {
        this.frames.push(frame);
        this.waiters.splice(0).forEach((resolve) => resolve());
      }
    });
    tls.on('close', () => {
      this.waiters.splice(0).forEach((resolve) => resolve());
      ws.close();
    });
    await new Promise<void>((resolve, reject) => {
      tls.once('secureConnect', resolve);
      tls.once('error', reject);
      tls.once('close', () => reject(new Error('closed during handshake')));
    });
  }

  public send(type: FrameType, payload: Buffer | string): void {
    this.tls?.write(encodeFrame(type, Buffer.isBuffer(payload) ? payload : Buffer.from(payload)));
  }

  public async nextFrame(predicate: (frame: Frame) => boolean = () => true, timeoutMs = 3000): Promise<Frame> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const index = this.frames.findIndex(predicate);
      if (index >= 0) return this.frames.splice(index, 1)[0];
      if (Date.now() > deadline) throw new Error('timed out waiting for frame');
      await new Promise<void>((resolve) => {
        this.waiters.push(resolve);
        setTimeout(resolve, 50);
      });
    }
  }

  public close(): void {
    this.tls?.destroy();
    this.ws?.close();
  }
}
