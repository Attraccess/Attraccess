import { WsAdapter } from '@nestjs/platform-ws';
import { INestApplicationContext, Logger } from '@nestjs/common';
import { createServer, TLSSocket } from 'node:tls';
import { constants, randomUUID, X509Certificate } from 'node:crypto';
import { IncomingMessage } from 'node:http';
import { Server, WebSocket, RawData } from 'ws';
import { ReaderIdentityService, readProtectedReaderFile } from '../security/reader-identity.service';
import { ReaderTimeService } from '../security/reader-time.service';
import { ProtectedReaderSocket, ReaderCiphertextStream } from './reader-connection-transport';
import { READER_LIMITS } from './reader-frame';

export const PROTECTED_READER_PATH = '/api/attractap/websocket/v1';
export const PROTECTED_READER_PROTOCOL = 'attraccess-reader-v1';

/** All other gateways keep Nest's existing JSON adapter. Secured bytes never reach its parser. */
export class ProtectedWsAdapter extends WsAdapter {
  private pending = 0;
  private readonly securityLogger = new Logger(ProtectedWsAdapter.name);
  private readonly protectedServers: Server[] = [];
  constructor(
    app: INestApplicationContext,
    private readonly identities: ReaderIdentityService,
    private readonly time: ReaderTimeService,
  ) {
    super(app);
  }

  create(port: number, options: { path?: string } = {}): Server {
    const legacy = super.create(port, options) as Server;
    if (options.path !== '/api/attractap/websocket') return legacy;
    const secured = super.create(port, {
      path: PROTECTED_READER_PATH,
      maxPayload: READER_LIMITS.wsMessage,
      perMessageDeflate: false,
      handleProtocols: (protocols) => (protocols.has(PROTECTED_READER_PROTOCOL) ? PROTECTED_READER_PROTOCOL : false),
    }) as Server;
    this.protectedServers.push(secured);
    secured.on('connection', (ws: WebSocket, request: IncomingMessage) => {
      if (ws.protocol !== PROTECTED_READER_PROTOCOL || this.pending >= 16) {
        ws.terminate();
        return;
      }
      this.accept(ws, request, legacy);
    });
    return legacy;
  }

  private accept(ws: WebSocket, request: IncomingMessage, gateway: Server): void {
    this.pending++;
    let pending = true;
    let phase: 'time' | 'signing' | 'tls' | 'registry' | 'ready' | 'closing' = 'time';
    let tls: TLSSocket | undefined;
    let stream: ReaderCiphertextStream | undefined;
    let application: ProtectedReaderSocket | undefined;
    const generation = randomUUID();
    const release = () => {
      if (pending) {
        this.pending--;
        pending = false;
      }
    };
    let deadline: NodeJS.Timeout;
    let watchdog: NodeJS.Timeout | undefined;
    const close = () => {
      if (phase === 'closing') return;
      phase = 'closing';
      release();
      clearTimeout(deadline);
      clearInterval(watchdog);
      this.identities.detach(generation);
      application?.close();
      tls?.destroy();
      stream?.destroy();
      ws.terminate();
    };
    const arm = (milliseconds: number) => {
      clearTimeout(deadline);
      deadline = setTimeout(close, milliseconds);
      deadline.unref();
    };
    arm(30_000);
    ws.once('close', close);
    ws.once('error', close);
    ws.on('message', async (raw: RawData, binary: boolean) => {
      if (!binary || phase === 'closing') {
        close();
        return;
      }
      const length = Array.isArray(raw) ? raw.reduce((sum, part) => sum + part.length, 0) : raw.byteLength;
      if (length > READER_LIMITS.wsMessage || (phase === 'time' && length > READER_LIMITS.bootstrap)) {
        close();
        return;
      }
      const bytes = Buffer.isBuffer(raw) ? raw : Array.isArray(raw) ? Buffer.concat(raw) : Buffer.from(raw);
      try {
        if (phase === 'time') {
          phase = 'signing';
          arm(5000);
          const reply = await this.time.reply(bytes, request.socket.remoteAddress ?? '');
          if (phase !== 'signing') {
            reply.fill(0);
            return;
          }
          const configuration = this.identities.configuration();
          if (!configuration) throw new Error('Reader security is not configured');
          const key = readProtectedReaderFile(configuration.serverKeyFile);
          const cert = readProtectedReaderFile(configuration.serverCertificateFile);
          const authorities = configuration.readerCaFiles.map((path) => readProtectedReaderFile(path));
          let server: ReturnType<typeof createServer>;
          let serverValidUntil: number;
          try {
            const certificate = new X509Certificate(cert);
            if (
              certificate.publicKey.asymmetricKeyType !== 'rsa' ||
              certificate.publicKey.asymmetricKeyDetails?.modulusLength !== 3072
            )
              throw new Error('Server credential must be RSA-3072');
            serverValidUntil = Date.parse(certificate.validTo);
            if (
              !(Date.parse(certificate.validFrom) <= Date.now() && serverValidUntil > Date.now()) ||
              !certificate.keyUsage?.includes('1.3.6.1.5.5.7.3.1')
            )
              throw new Error('Server credential is not active');
            server = createServer({
              key,
              cert,
              ca: authorities,
              minVersion: 'TLSv1.2',
              maxVersion: 'TLSv1.2',
              ciphers: 'ECDHE-RSA-AES256-GCM-SHA384',
              sigalgs: 'rsa_pkcs1_sha256:rsa_pkcs1_sha384:rsa_pkcs1_sha512',
              secureOptions: constants.SSL_OP_NO_TICKET | constants.SSL_OP_NO_RENEGOTIATION,
              requestCert: true,
              rejectUnauthorized: true,
              handshakeTimeout: 30_000,
              highWaterMark: READER_LIMITS.tlsInput,
            });
          } finally {
            key.fill(0);
            cert.fill(0);
            authorities.forEach((authority) => authority.fill(0));
          }
          ws.send(reply, { binary: true }, (error) => {
            reply.fill(0);
            if (error) close();
          });
          stream = new ReaderCiphertextStream(ws);
          stream.once('error', close);
          server.on('tlsClientError', close);
          server.on('secureConnection', async (socket: TLSSocket) => {
            tls = socket;
            tls.disableRenegotiation();
            tls.setMaxSendFragment(READER_LIMITS.tlsOutput);
            tls.once('error', close);
            tls.once('close', close);
            try {
              if (
                phase !== 'tls' ||
                !tls.authorized ||
                tls.isSessionReused() ||
                tls.getProtocol() !== 'TLSv1.2' ||
                tls.getCipher().name !== 'ECDHE-RSA-AES256-GCM-SHA384'
              )
                throw new Error('Reader TLS rejected');
              phase = 'registry';
              arm(30_000);
              const peer = tls.getPeerCertificate();
              if (!peer.raw) throw new Error('Missing reader credential');
              const identity = await this.identities.validateCertificate(new X509Certificate(peer.raw).toString());
              if (phase !== 'registry') return;
              application = new ProtectedReaderSocket(
                identity,
                generation,
                tls,
                ws,
                () => this.identities.connectionActive(identity) && Date.now() < serverValidUntil,
              );
              await this.identities.attach(generation, identity, async () => close());
              if (phase !== 'registry') {
                application.close();
                return;
              }
              phase = 'ready';
              release();
              clearTimeout(deadline);
              gateway.emit('connection', application, request);
              watchdog = setInterval(async () => {
                if (phase !== 'ready') return;
                try {
                  if (performance.now() - application.lastAuthenticatedInput >= 60_000) {
                    close();
                    return;
                  }
                  await this.identities.validateCertificate(identity.certificatePem);
                } catch {
                  close();
                }
              }, 1000);
              watchdog.unref();
            } catch {
              close();
            }
          });
          phase = 'tls';
          arm(30_000);
          // A per-connection TLS server performs Node's client-chain/usage validation.
          // It never listens on a TCP port or retains reusable session state.
          server.emit('connection', stream);
        } else if (phase === 'tls' || phase === 'registry' || phase === 'ready') {
          stream.receive(bytes);
        } else close();
      } catch {
        this.securityLogger.warn('Reader protected connection rejected');
        close();
      }
    });
  }

  async dispose(): Promise<void> {
    for (const server of this.protectedServers) await super.close(server);
    await super.dispose();
  }
}
