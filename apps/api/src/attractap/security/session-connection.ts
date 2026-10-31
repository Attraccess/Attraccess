import { X509Certificate, constants } from 'crypto';
import { EventEmitter } from 'events';
import { SecureContext, TLSSocket, createSecureContext } from 'tls';
import type { WebSocket } from 'ws';
import { HandshakeLimiter } from './handshake-limiter';
import { Frame, FrameDecoder, FrameType, FramingError, encodeFrame } from './session-framing';
import { SEND_QUEUE_LIMIT_BYTES, WsByteStream } from './ws-byte-stream';
import { spkiFingerprint, READER_URI_PREFIX } from './pki';

/** Time for the TLS handshake and the authorization once a handshake slot was granted. */
export const HANDSHAKE_TIMEOUT_MS = 10_000;
/** Time a connection may wait in the handshake queue before it is refused. */
export const QUEUE_WAIT_TIMEOUT_MS = 10_000;
/** A reader sends its ClientHello right after the upgrade; idle connections never take a slot. */
export const FIRST_BYTE_TIMEOUT_MS = 5_000;
const REJECTION_FLUSH_MS = 500;
const POST_HANDSHAKE_READ_LIMIT_BYTES = 256 * 1024;
/**
 * Largest TLS record the server sends. The reader's mbedTLS receive buffer holds 8 KiB of record
 * content (CONFIG_MBEDTLS_SSL_IN_CONTENT_LEN) and TLS 1.3 negotiates no smaller record size, so
 * Node's default of 16 KiB would make a large message unreadable for the reader.
 */
export const MAX_TLS_RECORD_BYTES = 4096;

export interface SessionTlsMaterial {
  certificateChainPem: string;
  privateKeyPem: string;
  caCertificatePem: string;
}

/** What the TLS layer learned about the peer; the authorizer decides what it means. */
export interface PeerIdentity {
  /** The chain verified against the installation CA and the certificate is in date. */
  chainValid: boolean;
  /** Signed by the installation CA, whether or not it is still valid. Never a bootstrap candidate. */
  issuedByCa: boolean;
  authorizationError: string | null;
  spkiFingerprint: string;
  spki: Buffer;
  /**
   * Reader ID from the certificate's URI SAN, read only from a certificate the CA signed. Only
   * `chainValid` makes it an identity; for an out-of-date one it just names the reader in logs.
   */
  readerId: number | null;
  certificateNotAfter: Date;
}

export type SessionDecision =
  | { kind: 'reader'; readerId: number; certificateNotAfter: Date }
  | { kind: 'bootstrap' }
  /**
   * `notifyReader`: tell the reader inside TLS (`session.rejected`). The reader acts on it by
   * erasing its key and pin, so it is only sent for a credential decision, never for a
   * certificate the reader could fix by retrying (e.g. one that looks expired to a wrong clock).
   */
  | { kind: 'reject'; reason: string; notifyReader: boolean };

export type SessionCloseReason =
  'handshake-refused' | 'handshake-timeout' | 'handshake-failed' | 'rejected' | 'protocol' | 'closed';

export class SessionError extends Error {
  public constructor(
    public readonly reason: SessionCloseReason,
    message: string,
    /** A `session.rejected` frame is on its way; the connection closes once it had time to leave. */
    public readonly readerNotified = false,
  ) {
    super(message);
  }
}

/**
 * One TLS context per server certificate, shared by every session. A context per connection
 * costs ~45 KB of native memory for the lifetime of the session (about 45 MiB at 1,000 readers).
 * Resumption stays impossible: tickets are off and Node keeps no internal session cache.
 */
let sharedContext: { chainPem: string; context: SecureContext; ca: X509Certificate } | null = null;

function contextFor(material: SessionTlsMaterial): { context: SecureContext; ca: X509Certificate } {
  if (sharedContext?.chainPem !== material.certificateChainPem) {
    sharedContext = {
      chainPem: material.certificateChainPem,
      ca: new X509Certificate(material.caCertificatePem),
      context: createSecureContext({
        key: material.privateKeyPem,
        cert: material.certificateChainPem,
        ca: material.caCertificatePem,
        minVersion: 'TLSv1.3',
        maxVersion: 'TLSv1.3',
        ciphers: 'TLS_AES_128_GCM_SHA256:TLS_AES_256_GCM_SHA384',
        ecdhCurve: 'prime256v1',
        sigalgs: 'ecdsa_secp256r1_sha256',
        // No tickets: every connection performs a full, fresh handshake.
        secureOptions: constants.SSL_OP_NO_TICKET | constants.SSL_OP_NO_RENEGOTIATION,
      }),
    };
  }
  return sharedContext;
}

/**
 * One reader connection carrying TLS 1.3 inside binary WebSocket frames. Create it right after
 * the upgrade, before any await, so no early frame is missed. Text frames are a protocol
 * violation and close the connection. Decoded application messages are exposed as 'message'
 * events; control frames as 'control'.
 */
export class SessionConnection extends EventEmitter {
  private readonly stream: WsByteStream;
  private readonly decoder = new FrameDecoder();
  private readonly aborted = new AbortController();
  private readonly firstByte: Promise<void>;
  private tls: TLSSocket | null = null;
  private closed = false;
  private injecting = false;
  /** Bytes handed to TLS whose write has not completed yet (each counted once). */
  private pendingBytes = 0;
  private markFirstByte: () => void = () => undefined;

  public constructor(
    private readonly ws: WebSocket,
    private readonly limiter: HandshakeLimiter,
  ) {
    super();
    this.firstByte = new Promise<void>((resolve) => (this.markFirstByte = resolve));
    this.stream = new WsByteStream(ws);
    this.stream.on('error', () => this.close());
    ws.on('message', this.onWsMessage);
    ws.on('close', () => this.close());
    ws.on('error', () => this.close());
  }

  public async handshake(
    material: () => Promise<SessionTlsMaterial>,
    authorize: (peer: PeerIdentity) => Promise<SessionDecision>,
  ): Promise<SessionDecision & { kind: 'reader' | 'bootstrap' }> {
    let release: (() => void) | null = null;
    try {
      await this.within(FIRST_BYTE_TIMEOUT_MS, 'handshake-timeout', 'no data', () => this.firstByte);

      const queueWait = AbortSignal.any([this.aborted.signal, AbortSignal.timeout(QUEUE_WAIT_TIMEOUT_MS)]);
      try {
        release = await this.limiter.acquire(queueWait);
      } catch {
        this.throwIfClosed();
        throw new SessionError('handshake-refused', 'no handshake slot');
      }
      this.throwIfClosed();

      // The handshake budget starts once the slot is granted, not while queued.
      return await this.within(HANDSHAKE_TIMEOUT_MS, 'handshake-timeout', 'handshake timed out', async () => {
        const tlsMaterial = await material();
        this.throwIfClosed();
        const { context, ca } = contextFor(tlsMaterial);
        const tls = await this.runTls(context);
        this.tls = tls;

        const peer = this.describePeer(tls, ca);
        if (!peer) throw new SessionError('rejected', 'no client certificate');
        const decision = await authorize(peer);
        this.throwIfClosed();
        if (decision.kind === 'reject') {
          if (decision.notifyReader) this.notifyRejected(decision.reason);
          throw new SessionError('rejected', decision.reason, decision.notifyReader);
        }

        this.stream.readLimitBytes = POST_HANDSHAKE_READ_LIMIT_BYTES;
        tls.on('data', this.onTlsData);
        return decision;
      });
    } catch (error) {
      // A rejected reader gets a moment to receive the reason; everything else closes right away.
      if (error instanceof SessionError && error.readerNotified) this.closeAfterFlush();
      else this.close();
      throw error;
    } finally {
      release?.();
    }
  }

  /**
   * Tells the reader, inside the established TLS channel, why it is turned away. The reader trusts the
   * server's key, so this is the only signal it may act on (e.g. "pairing removed"); a bare WebSocket
   * close proves nothing.
   */
  private notifyRejected(reason: string): void {
    this.sendFrame(FrameType.CONTROL, Buffer.from(JSON.stringify({ t: 'session.rejected', reason })));
  }

  private closeAfterFlush(): void {
    setTimeout(() => this.close(), REJECTION_FLUSH_MS).unref();
  }

  public get isOpen(): boolean {
    return !this.closed && this.tls !== null && !this.tls.destroyed;
  }

  /**
   * Queues one message. Returns false when the session is closed, or when more than the
   * per-reader limit is already waiting to leave (the reader is not reading; it is dropped).
   */
  public sendFrame(type: FrameType, payload: Buffer): boolean {
    const tls = this.tls;
    if (!this.isOpen || !tls) return false;
    // Counted from tls.write() until its callback: the frame has then left through the WebSocket.
    if (this.pendingBytes > SEND_QUEUE_LIMIT_BYTES) {
      this.close();
      return false;
    }
    try {
      const frame = encodeFrame(type, payload);
      this.pendingBytes += frame.length;
      tls.write(frame, () => (this.pendingBytes -= frame.length));
      return true;
    } catch {
      this.close();
      return false;
    }
  }

  /**
   * Hands a decrypted application message to the framework's message handlers, exactly as if
   * it had arrived as a text frame on a legacy connection.
   */
  public injectText(text: Buffer): void {
    this.injecting = true;
    try {
      this.ws.emit('message', text, false);
    } finally {
      this.injecting = false;
    }
  }

  public close(): void {
    if (this.closed) return;
    this.closed = true;
    this.aborted.abort();
    this.tls?.destroy();
    this.stream.destroy();
    try {
      this.ws.close(1000);
    } catch {
      // already closed
    }
    this.emit('closed');
  }

  private throwIfClosed(): void {
    if (this.closed) throw new SessionError('closed', 'connection closed');
  }

  /** Runs `work` but gives up after `ms` or when the connection closes. */
  private async within<T>(ms: number, reason: SessionCloseReason, message: string, work: () => Promise<T>): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    let onAbort: (() => void) | undefined;
    try {
      return await Promise.race([
        work(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new SessionError(reason, message)), ms);
          onAbort = () => reject(new SessionError('closed', 'connection closed'));
          if (this.aborted.signal.aborted) onAbort();
          else this.aborted.signal.addEventListener('abort', onAbort, { once: true });
        }),
      ]);
    } finally {
      clearTimeout(timer);
      if (onAbort) this.aborted.signal.removeEventListener('abort', onAbort);
    }
  }

  private runTls(context: SecureContext): Promise<TLSSocket> {
    return new Promise<TLSSocket>((resolve, reject) => {
      const tls = new TLSSocket(this.stream, {
        isServer: true,
        secureContext: context,
        requestCert: true,
        // The authorizer decides: unpaired bootstrap readers present a self-signed certificate.
        rejectUnauthorized: false,
      });
      this.tls = tls;
      if (!tls.setMaxSendFragment(MAX_TLS_RECORD_BYTES)) {
        tls.destroy();
        reject(new SessionError('handshake-failed', 'cannot limit the TLS record size'));
        return;
      }
      const onError = (error: Error) => reject(new SessionError('handshake-failed', error.message));
      const onClose = () => reject(new SessionError('handshake-failed', 'closed during handshake'));
      tls.on('error', onError);
      tls.once('close', onClose);
      tls.once('secure', () => {
        // What tls.Server does on 'secure': without it, TLS errors after the handshake (bad
        // record MAC, alerts) are swallowed instead of being emitted as 'error'.
        (tls as unknown as { _releaseControl?: () => boolean })._releaseControl?.();
        // From here on any error or close ends the session, also while authorization runs.
        tls.off('error', onError);
        tls.off('close', onClose);
        tls.on('error', () => this.close());
        tls.on('close', () => this.close());
        resolve(tls);
      });
    });
  }

  private describePeer(tls: TLSSocket, ca: X509Certificate): PeerIdentity | null {
    // Native parsing: no JS ASN.1 garbage per handshake (it grows V8's young generation).
    const cert = tls.getPeerX509Certificate();
    if (!cert) return null;
    const spki = cert.publicKey.export({ type: 'spki', format: 'der' });
    // A TLSSocket without a server does not compute `authorized`, so the chain is verified here.
    const error = verifyAgainstCa(cert, ca);
    return {
      chainValid: error === null,
      issuedByCa: error !== NOT_ISSUED_BY_CA,
      authorizationError: error,
      spki,
      spkiFingerprint: spkiFingerprint(spki),
      readerId: error === NOT_ISSUED_BY_CA ? null : parseReaderId(sanUri(cert, READER_URI_PREFIX)),
      certificateNotAfter: new Date(cert.validTo),
    };
  }

  private readonly onWsMessage = (data: Buffer | ArrayBuffer | Buffer[], isBinary: boolean) => {
    if (this.injecting) return;
    if (!isBinary) {
      // A session connection speaks TLS bytes only. This listener is attached before the
      // framework's, so the flag is set before any handler could see the frame.
      (this.ws as unknown as { sessionViolation?: boolean }).sessionViolation = true;
      this.close();
      return;
    }
    if (this.closed) return;
    const chunk = Array.isArray(data) ? Buffer.concat(data) : Buffer.isBuffer(data) ? data : Buffer.from(data);
    this.markFirstByte();
    if (!this.stream.feed(chunk)) this.close();
  };

  private readonly onTlsData = (chunk: Buffer) => {
    let frames: Frame[];
    try {
      frames = this.decoder.push(chunk);
    } catch (error) {
      if (error instanceof FramingError) this.close();
      return;
    }
    for (const frame of frames) {
      if (frame.type === FrameType.CONTROL) this.emit('control', frame.payload);
      else this.emit('message', frame);
    }
  };
}

const NOT_ISSUED_BY_CA = 'not issued by the installation CA';

function sanUri(cert: X509Certificate, prefix: string): string | null {
  const uri = (cert.subjectAltName ?? '').split(', ').find((name) => name.startsWith(`URI:${prefix}`));
  return uri ? uri.slice(4 + prefix.length) : null;
}

function parseReaderId(value: string | null): number | null {
  if (!value || !/^[1-9][0-9]{0,9}$/.test(value)) return null;
  return Number(value);
}

/** Returns null when `raw` is a reader certificate signed by the CA and in date, otherwise the reason. */
export function verifyAgainstCa(
  raw: Buffer | X509Certificate,
  ca: X509Certificate | string,
  now = new Date(),
): string | null {
  const cert = raw instanceof X509Certificate ? raw : new X509Certificate(raw);
  const caCert = typeof ca === 'string' ? new X509Certificate(ca) : ca;
  if (!cert.checkIssued(caCert) || !cert.verify(caCert.publicKey)) return NOT_ISSUED_BY_CA;
  if (cert.ca) return 'not a reader certificate';
  if (now < new Date(cert.validFrom) || now > new Date(cert.validTo)) return 'certificate expired or not yet valid';
  return null;
}
