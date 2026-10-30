import { SettingsService } from '../../../../settings/settings.service';
import { WebSocket } from 'ws';
import { WebsocketService } from '../../websocket.service';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { AttractapService } from '../../../attractap.service';
import { verifyToken } from '../../websocket.utils';
import { ResourceListService } from '../resource-list/resource-list.service';
import { MetricsService } from '../../../../metrics/metrics.service';
import { AuditService } from '../../../../audit/audit.service';
import { AuthenticatedWebSocket, AttractapEvent, AttractapEventType } from '../../websocket.types';
import { readerServerTime } from '../../websocket-reader-payloads';

@Injectable()
export class AttractapAuthHandler {
  private readonly logger = new Logger(AttractapAuthHandler.name);
  /** Rejected token sign-ins of paired readers are audited at most once per reader per minute. */
  private readonly tokenRejectionAuditedAt = new Map<number, number>();

  @Inject(AttractapService)
  private attractapService: AttractapService;

  @Inject(ResourceListService)
  private resourceListService: ResourceListService;

  @Inject(MetricsService)
  private metricsService: MetricsService;

  @Inject(AuditService)
  private audit: AuditService;

  @Inject(SettingsService)
  private settingsService: SettingsService;

  @Inject(WebsocketService)
  private websocketService: WebsocketService;

  /**
   * Open token registration ended with reader pairing: a reader that is not known joins only through
   * an admin approval (attractap-pairing.v1). A legacy REGISTER creates nothing and gets no reply.
   */
  public async handleReaderRegister(socket: AuthenticatedWebSocket, _data: AttractapEvent['data']) {
    this.logger.warn(`Ignoring legacy REGISTER from client ${socket.id}: readers join through pairing`);
  }

  public async handleAuthentication(socket: AuthenticatedWebSocket, data: AttractapEvent['data']) {
    if (socket.readyState !== WebSocket.OPEN) return;
    // The payload carries the reader's token: never log it.
    this.logger.debug('processing READER_AUTHENTICATE event');

    const unauthorizedResponse = new AttractapEvent(AttractapEventType.READER_UNAUTHORIZED, {
      message: 'PLEASE_REREGISTER',
    });

    // Re-authentication must revoke the previous identity before validating new credentials.
    const attempt = Symbol('reader-authentication');
    socket.state.readerAuthenticationAttempt = attempt;
    const isCurrentAttempt = () =>
      socket.state.readerAuthenticationAttempt === attempt && socket.readyState === WebSocket.OPEN;
    const previousReaderId = socket.readerId;
    const previousReaderName = socket.readerName;
    socket.readerId = null;
    socket.readerName = null;
    if (
      previousReaderId &&
      !Array.from(this.websocketService.sockets.values()).some(
        (other) => other.id !== socket.id && other.readerId === previousReaderId,
      )
    ) {
      this.metricsService.attractapReaderConnected.set(
        { reader_id: String(previousReaderId), reader_name: previousReaderName ?? '' },
        0,
      );
    }
    this.logger.debug('Checking if reader exists');
    const reader = await this.attractapService.findReaderById(data.payload.id);
    if (!isCurrentAttempt()) return;
    if (!reader) {
      this.logger.error('No reader-config found for socket, sending UNAUTHORIZED response to client');
      return await socket.sendMessage(unauthorizedResponse);
    }

    // A paired (or revoked) reader authenticates with its certificate only.
    if (reader.pairingState !== 'unpaired') {
      this.logger.warn(`Token sign-in rejected for ${reader.pairingState} reader ${reader.id}`);
      if (this.shouldAuditTokenRejection(reader.id))
        await this.audit
          .recordAttractap({
            action: 'reader.token_rejected',
            actorId: null,
            authenticationMethod: null,
            subjectId: reader.id,
            details: { reason: reader.pairingState },
          })
          .catch(() => undefined);
      return await socket.sendMessage(
        new AttractapEvent(AttractapEventType.READER_UNAUTHORIZED, { message: 'PAIRING_REQUIRED' }),
      );
    }

    this.logger.debug('Checking if token is valid');
    const isValidToken = await verifyToken(data.payload.token, reader.apiTokenHash);
    if (!isCurrentAttempt()) return;
    if (!isValidToken) {
      this.logger.error('Invalid token, sending UNAUTHORIZED response to client');
      return await socket.sendMessage(unauthorizedResponse);
    }

    const storedLanguage = await this.settingsService.getDefaultLanguage();
    if (!isCurrentAttempt()) return;
    // A broadcast during the read supersedes its snapshot, even before this
    // socket becomes eligible for language broadcasts.
    const language = this.websocketService.readerLanguage ?? storedLanguage;
    socket.readerId = reader.id;
    socket.readerName = reader.name;
    this.metricsService.attractapReaderConnected.set({ reader_id: String(reader.id), reader_name: reader.name }, 1);

    const authenticatedResponse = new AttractapEvent(AttractapEventType.READER_AUTHENTICATED, {
      name: reader.name,
      language,
      serverTime: readerServerTime(),
    });
    await socket.sendMessage(authenticatedResponse);
    if (!isCurrentAttempt()) return;
    await this.resourceListService.sendResourceListToSocket(socket);
  }

  private shouldAuditTokenRejection(readerId: number): boolean {
    const now = Date.now();
    const last = this.tokenRejectionAuditedAt.get(readerId);
    if (last !== undefined && now - last < 60_000) return false;
    this.tokenRejectionAuditedAt.set(readerId, now);
    return true;
  }

  /**
   * Signs in a reader whose identity was already proven by its TLS client certificate.
   * Mirrors the token path but without any token.
   */
  public async authenticateSessionReader(socket: AuthenticatedWebSocket, readerId: number): Promise<boolean> {
    const attempt = Symbol('reader-session-authentication');
    socket.state.readerAuthenticationAttempt = attempt;
    const isCurrentAttempt = () =>
      socket.state.readerAuthenticationAttempt === attempt && socket.readyState === WebSocket.OPEN;

    const reader = await this.attractapService.findReaderById(readerId);
    if (!reader || reader.pairingState !== 'paired' || !isCurrentAttempt()) return false;

    const storedLanguage = await this.settingsService.getDefaultLanguage();
    if (!isCurrentAttempt()) return false;
    const language = this.websocketService.readerLanguage ?? storedLanguage;
    socket.readerId = reader.id;
    socket.readerName = reader.name;
    this.metricsService.attractapReaderConnected.set({ reader_id: String(reader.id), reader_name: reader.name }, 1);

    await socket.sendMessage(
      new AttractapEvent(AttractapEventType.READER_AUTHENTICATED, {
        name: reader.name,
        language,
        serverTime: readerServerTime(),
      }),
    );
    if (!isCurrentAttempt()) return false;
    await this.resourceListService.sendResourceListToSocket(socket);
    return true;
  }
}
