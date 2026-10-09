import { Inject, Injectable, Logger } from '@nestjs/common';
import { AttractapService } from '../../attractap.service';
import { verifyToken } from '../websocket.utils';
import { ResourceListService } from './resource-list.service';
import { MetricsService } from '../../../metrics/metrics.service';
import { AuditService } from '../../../audit/audit.service';
import { AuthenticatedWebSocket, AttractapEvent, AttractapEventType } from '../websocket.types';
import { SettingsService } from '../../../settings/settings.service';
import { WebsocketService } from '../websocket.service';

@Injectable()
export class AttractapAuthHandler {
  private readonly logger = new Logger(AttractapAuthHandler.name);

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

  public async handleReaderRegister(socket: AuthenticatedWebSocket, data: AttractapEvent['data']) {
    this.logger.debug('Received REGISTER event');
    const response = await this.attractapService.createNewReader(data.payload.firmware);
    await this.audit
      .recordAttractap({
        action: 'reader.registered',
        actorId: null,
        authenticationMethod: null,
        subjectId: response.reader.id,
        details: { source: 'reader-websocket' },
      })
      .catch(() => undefined);

    this.logger.debug(
      `Sending REGISTER response to client. Reader ID: ${response.reader.id}, Token: ${response.token}`,
    );

    await socket.sendMessage(
      new AttractapEvent(AttractapEventType.READER_REGISTER, {
        id: response.reader.id,
        token: response.token,
      }),
    );
  }

  public async handleAuthentication(socket: AuthenticatedWebSocket, data: AttractapEvent['data']) {
    this.logger.debug('processing READER_AUTHENTICATE event', data);

    const unauthorizedResponse = new AttractapEvent(AttractapEventType.READER_UNAUTHORIZED, {
      message: 'PLEASE_REREGISTER',
    });

    // Re-authentication must revoke the previous identity before validating new credentials.
    const attempt = Symbol('reader-authentication');
    socket.state.readerAuthenticationAttempt = attempt;
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
    if (socket.state.readerAuthenticationAttempt !== attempt) return;
    if (!reader) {
      this.logger.error('No reader-config found for socket, sending UNAUTHORIZED response to client');
      return await socket.sendMessage(unauthorizedResponse);
    }

    this.logger.debug('Checking if token is valid');
    const isValidToken = await verifyToken(data.payload.token, reader.apiTokenHash);
    if (socket.state.readerAuthenticationAttempt !== attempt) return;
    if (!isValidToken) {
      this.logger.error('Invalid token, sending UNAUTHORIZED response to client');
      return await socket.sendMessage(unauthorizedResponse);
    }

    const language = await this.settingsService.getAttractapLanguage();
    if (socket.state.readerAuthenticationAttempt !== attempt) return;
    socket.readerId = reader.id;
    socket.readerName = reader.name;
    this.metricsService.attractapReaderConnected.set({ reader_id: String(reader.id), reader_name: reader.name }, 1);

    const authenticatedResponse = new AttractapEvent(AttractapEventType.READER_AUTHENTICATED, {
      name: reader.name,
      language,
    });
    await socket.sendMessage(authenticatedResponse);
    if (socket.state.readerAuthenticationAttempt !== attempt) return;
    await this.resourceListService.sendResourceListToSocket(socket);
  }
}
