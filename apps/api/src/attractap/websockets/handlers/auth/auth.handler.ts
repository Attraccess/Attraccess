import { SettingsService } from '../../../../settings/settings.service';
import { WebSocket } from 'ws';
import { WebsocketService } from '../../websocket.service';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { AttractapService } from '../../../attractap.service';
import { verifyToken } from '../../websocket.utils';
import { ResourceListService } from '../resource-list/resource-list.service';
import { MetricsService } from '../../../../metrics/metrics.service';
import { DeviceEnrollmentService } from '../../../../device-enrollment/device-enrollment.service';
import { AuthenticatedWebSocket, AttractapEvent, AttractapEventType } from '../../websocket.types';
import { readerServerTime } from '../../websocket-reader-payloads';

@Injectable()
export class AttractapAuthHandler {
  private readonly logger = new Logger(AttractapAuthHandler.name);

  @Inject(AttractapService)
  private attractapService: AttractapService;

  @Inject(ResourceListService)
  private resourceListService: ResourceListService;

  @Inject(MetricsService)
  private metricsService: MetricsService;

  @Inject(DeviceEnrollmentService)
  private deviceEnrollment: DeviceEnrollmentService;

  @Inject(SettingsService)
  private settingsService: SettingsService;

  @Inject(WebsocketService)
  private websocketService: WebsocketService;

  /**
   * A new reader only asks for a code here. The record and its credentials are created once an
   * admin approved that code, see DeviceEnrollmentService.approve. Firmware without the `enrollment`
   * field cannot show a code, so it gets no reply and nothing is created.
   */
  public async handleReaderRegister(socket: AuthenticatedWebSocket, data: AttractapEvent['data']) {
    if (!data.payload?.enrollment || typeof data.payload.enrollment !== 'object') {
      this.logger.warn(`Ignoring REGISTER from ${socket.id}: firmware does not support enrollment codes`);
      return;
    }
    this.logger.debug('Received REGISTER event');

    this.deviceEnrollment.request({
      id: socket.id,
      address: socket.clientAddress,
      sendCode: (code, rotatesInMs, expiresInMs) => {
        void socket.sendMessage(
          new AttractapEvent(AttractapEventType.READER_ENROLLMENT_CODE, { code, rotatesInMs, expiresInMs }),
        );
      },
      sendRejected: (reason, retryAfterMs) => {
        void socket.sendMessage(
          new AttractapEvent(AttractapEventType.READER_ENROLLMENT_REJECTED, { reason, retryAfterMs }),
        );
      },
      provision: async ({ name }) => {
        const { reader, token } = await this.attractapService.createNewReader(data.payload.firmware, name);
        return {
          kind: 'reader',
          id: reader.id,
          name: reader.name,
          deliver: () =>
            socket.sendMessage(new AttractapEvent(AttractapEventType.READER_REGISTER, { id: reader.id, token })),
          rollback: async () => {
            await this.attractapService.deleteReader(reader.id);
          },
        };
      },
      close: () => socket.close(),
    });
  }

  public releaseEnrollment(socket: AuthenticatedWebSocket) {
    this.deviceEnrollment.release(socket.id);
  }

  public async handleAuthentication(socket: AuthenticatedWebSocket, data: AttractapEvent['data']) {
    if (socket.readyState !== WebSocket.OPEN) return;
    this.logger.debug('processing READER_AUTHENTICATE event', data);

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
}
