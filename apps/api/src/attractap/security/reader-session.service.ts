import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import type { WebSocket } from 'ws';
import { AuditService } from '../../audit/audit.service';
import { AttractapAuthHandler } from '../websockets/handlers/auth/auth.handler';
import { AuthenticatedWebSocket } from '../websockets/websocket.types';
import { CredentialRegistryService } from './credential-registry.service';
import { HandshakeLimiter } from './handshake-limiter';
import { InstallationIdentityService } from './installation-identity.service';
import { BootstrapGrant, PairingService } from './pairing.service';
import { PeerIdentity, SessionConnection, SessionDecision, SessionError } from './session-connection';
import { Frame, FrameType } from './session-framing';
import { SessionMetrics } from './session-metrics';

const RENEW_WHEN_LESS_THAN_MS = 183 * 24 * 60 * 60 * 1000;
const AGGREGATE_FLUSH_MS = 60_000;

/**
 * Turns an upgraded WebSocket on the session subprotocol into an authenticated reader socket.
 * It never looks inside application messages: they are passed to the normal handlers as if they
 * had arrived on a legacy connection, and replies leave through the same `send`.
 */
@Injectable()
export class ReaderSessionService implements OnModuleDestroy {
  private readonly logger = new Logger(ReaderSessionService.name);
  private readonly rejections = new Map<string, { readerId: number | null; reason: string; count: number }>();
  private readonly flushTimer: NodeJS.Timeout;

  public constructor(
    private readonly limiter: HandshakeLimiter,
    private readonly identity: InstallationIdentityService,
    private readonly registry: CredentialRegistryService,
    private readonly pairing: PairingService,
    private readonly authHandler: AttractapAuthHandler,
    private readonly metrics: SessionMetrics,
    private readonly audit: AuditService,
  ) {
    this.flushTimer = setInterval(() => void this.flushRejections(), AGGREGATE_FLUSH_MS);
    this.flushTimer.unref();
  }

  public onModuleDestroy(): void {
    clearInterval(this.flushTimer);
  }

  /**
   * Takes over a freshly upgraded session socket. Must be called synchronously on connection,
   * before any await, so early TLS bytes and stray text frames are seen first by the session.
   */
  public open(ws: WebSocket): SessionConnection {
    (ws as unknown as AuthenticatedWebSocket).transport = 'session';
    return new SessionConnection(ws, this.limiter);
  }

  /** Runs the handshake. Resolves once the socket is authenticated (or has been closed). */
  public async accept(
    socket: AuthenticatedWebSocket,
    connection: SessionConnection,
    onReady: (socket: AuthenticatedWebSocket) => void,
  ): Promise<void> {
    let grant: BootstrapGrant | null = null;
    let peerSpki: Buffer | null = null;
    let peerFingerprint: string | null = null;
    let rejectedReaderId: number | null = null;

    try {
      const decision = await connection.handshake(
        async () => ({
          ...(await this.identity.getServerTlsMaterial()),
          caCertificatePem: await this.identity.getCaCertificatePem(),
        }),
        async (peer: PeerIdentity): Promise<SessionDecision> => {
          peerSpki = peer.spki;
          peerFingerprint = peer.spkiFingerprint;
          if (!peer.chainValid) {
            // An expired or otherwise invalid installation certificate is rejected, never
            // renewed through the bootstrap path.
            if (peer.issuedByCa) return { kind: 'reject', reason: 'invalid-certificate' };
            grant = await this.pairing.resolveBootstrap(peer);
            return grant ? { kind: 'bootstrap' } : { kind: 'reject', reason: 'unknown-credential' };
          }
          if (peer.readerId === null) return { kind: 'reject', reason: 'no-reader-id' };
          rejectedReaderId = peer.readerId;
          if (!(await this.registry.isActive(peer.readerId, peer.spkiFingerprint))) {
            return { kind: 'reject', reason: 'inactive-credential' };
          }
          return { kind: 'reader', readerId: peer.readerId, certificateNotAfter: peer.certificateNotAfter };
        },
      );

      if (decision.kind === 'bootstrap') {
        const bootstrapGrant = grant as BootstrapGrant | null;
        if (bootstrapGrant) await this.completeBootstrap(connection, bootstrapGrant);
        else connection.close();
        return;
      }

      // Known before any await, so a revoke that lands during sign-in finds this socket.
      socket.readerId = decision.readerId;
      this.attach(socket, connection, onReady);
      const fingerprint = peerFingerprint as string | null;
      if (fingerprint) this.pairing.forgetGrant(fingerprint);

      // The server time goes first: it feeds the reader's trusted-time floor before anything else.
      connection.sendFrame(FrameType.CONTROL, this.encode(await this.helloControl()));
      const ok = await this.authHandler.authenticateSessionReader(socket, decision.readerId);
      // Re-checked after sign-in: the credential may have changed while it ran.
      if (!ok || !fingerprint || !(await this.registry.isActive(decision.readerId, fingerprint))) {
        connection.close();
        return;
      }
      if (decision.certificateNotAfter.getTime() - Date.now() < RENEW_WHEN_LESS_THAN_MS && peerSpki) {
        await this.renewCertificate(connection, decision.readerId, peerSpki, fingerprint);
      }
    } catch (error) {
      const reason = error instanceof SessionError ? error.reason : 'handshake-failed';
      const detail = reason === 'rejected' ? labelOf((error as SessionError).message) : reason;
      this.metrics.handshakeFailures.inc({ reason: detail });
      if (reason === 'rejected') this.noteRejection(rejectedReaderId, detail);
      this.logger.debug(`Session handshake ended: ${reason}`);
      connection.close();
    }
  }

  private attach(
    socket: AuthenticatedWebSocket,
    connection: SessionConnection,
    onReady: (socket: AuthenticatedWebSocket) => void,
  ): void {
    // Everything the handlers send leaves through the TLS session.
    const send = (data: string | Buffer, callback?: (error?: Error) => void) => {
      const accepted = connection.sendFrame(
        typeof data === 'string' ? FrameType.JSON : FrameType.BINARY,
        typeof data === 'string' ? Buffer.from(data, 'utf8') : Buffer.from(data),
      );
      callback?.(accepted ? undefined : new Error('session closed or send queue full'));
    };
    Object.assign(socket, { send });

    connection.on('message', (frame: Frame) => {
      let text: Buffer | null = null;
      if (frame.type === FrameType.JSON) text = frame.payload;
      else if (frame.type === FrameType.HEARTBEAT) text = Buffer.from('{"event":"HEARTBEAT"}');
      if (!text) return connection.close(); // readers do not send binary data
      connection.injectText(text);
    });

    this.metrics.activeSessions.inc();
    connection.once('closed', () => this.metrics.activeSessions.dec());
    onReady(socket);
  }

  private async helloControl() {
    return { t: 'session.hello', installationId: await this.identity.getInstallationId(), serverTime: Date.now() };
  }

  private async completeBootstrap(connection: SessionConnection, grant: BootstrapGrant): Promise<void> {
    connection.sendFrame(
      FrameType.CONTROL,
      this.encode({
        ...(await this.helloControl()),
        t: 'pairing.complete',
        readerId: grant.readerId,
        certificate: grant.certificatePem,
      }),
    );
    // The reader reconnects with its certificate; give the last frame time to flush.
    setTimeout(() => connection.close(), 1000).unref();
  }

  private async renewCertificate(
    connection: SessionConnection,
    readerId: number,
    spki: Buffer,
    fingerprint: string,
  ): Promise<void> {
    const certificate = await this.identity.issueReaderCertificate(readerId, spki);
    await this.registry.recordCertificate(readerId, fingerprint, certificate);
    connection.sendFrame(FrameType.CONTROL, this.encode({ t: 'cert.renew', certificate: certificate.pem }));
  }

  private encode(message: Record<string, unknown>): Buffer {
    return Buffer.from(JSON.stringify(message), 'utf8');
  }

  private noteRejection(readerId: number | null, reason: string): void {
    const key = `${readerId ?? 'none'}:${reason}`;
    const entry = this.rejections.get(key) ?? { readerId, reason, count: 0 };
    entry.count++;
    this.rejections.set(key, entry);
  }

  private async flushRejections(): Promise<void> {
    const entries = [...this.rejections.values()];
    this.rejections.clear();
    for (const entry of entries) {
      if (!entry.readerId) continue; // the audit log needs a reader to attach the event to
      await this.audit
        .recordAttractap({
          action: 'reader.handshake_rejected',
          actorId: null,
          authenticationMethod: null,
          subjectId: entry.readerId,
          details: { reason: entry.reason, count: entry.count },
        })
        .catch(() => undefined);
    }
  }
}

/** Rejection reasons are fixed strings; this keeps metric labels and audit details tidy. */
function labelOf(reason: string): string {
  return reason
    .replace(/[^a-z0-9-]/gi, '-')
    .toLowerCase()
    .slice(0, 40);
}
