import { setDeviceFrameLimit } from '../../../../device-enrollment/device-frame-limit';
import { DeviceEnrollmentService } from '../../../../device-enrollment/device-enrollment.service';
import { sendDeviceCredentials } from '../../../../device-enrollment/send-device-credentials';
import { SettingsService } from '../../../../settings/settings.service';
import { WebSocket } from 'ws';
import { WebsocketService } from '../../websocket.service';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { AttractapService } from '../../../attractap.service';
import { verifyToken } from '../../websocket.utils';
import { ResourceListService } from '../resource-list/resource-list.service';
import { MetricsService } from '../../../../metrics/metrics.service';
import { AuthenticatedWebSocket, AttractapEvent, AttractapEventType } from '../../websocket.types';
import { readerServerTime } from '../../websocket-reader-payloads';

@Injectable()
export class AttractapAuthHandler {
  private readonly logger = new Logger(AttractapAuthHandler.name);

  @Inject(DeviceEnrollmentService)
  private enrollment: DeviceEnrollmentService;

  @Inject(AttractapService)
  private attractapService: AttractapService;

  @Inject(ResourceListService)
  private resourceListService: ResourceListService;

  @Inject(MetricsService)
  private metricsService: MetricsService;

  @Inject(SettingsService)
  private settingsService: SettingsService;

  @Inject(WebsocketService)
  private websocketService: WebsocketService;

  public async handleReaderRegister(socket: AuthenticatedWebSocket, data: AttractapEvent['data']) {
    if (socket.readerId) return;
    try {
      this.enrollment.announce(
        socket,
        'reader',
        data.payload?.enrollmentCode,
        data.payload?.firmware,
        async (current) => {
          const response = await this.attractapService.createNewReader(data.payload?.firmware, current);
          let attempted = false;
          return {
            id: response.reader.id,
            deliver: async () => {
              if (socket.readyState !== WebSocket.OPEN) throw new Error('Device disconnected');
              attempted = true;
              await sendDeviceCredentials(
                socket as unknown as WebSocket,
                new AttractapEvent(AttractapEventType.READER_REGISTER, {
                  id: response.reader.id,
                  token: response.token,
                  enrollmentVersion: 1,
                  enrollmentCode: data.payload.enrollmentCode,
                }),
              );
            },
            discard: async () => {
              if (!attempted) await this.attractapService.deleteReader(response.reader.id);
            },
          };
        },
        (message) => {
          if (socket.readyState === WebSocket.OPEN)
            (socket as unknown as WebSocket).send(
              JSON.stringify(new AttractapEvent(AttractapEventType.READER_ENROLLMENT_STATUS, { message })),
            );
        },
      );
    } catch (error) {
      if (socket.readyState === WebSocket.OPEN)
        (socket as unknown as WebSocket).send(
          JSON.stringify(
            new AttractapEvent(AttractapEventType.READER_ENROLLMENT_STATUS, {
              message: error instanceof Error ? error.message : 'ENROLLMENT_FAILED',
            }),
          ),
        );
    }
  }

  public async handleAuthentication(socket: AuthenticatedWebSocket, data: AttractapEvent['data']) {
    if (socket.readyState !== WebSocket.OPEN) return;
    setDeviceFrameLimit(socket, false);
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
      await socket.sendMessage(unauthorizedResponse);
      if (previousReaderId && isCurrentAttempt()) (socket as unknown as WebSocket).close();
      return;
    }

    this.logger.debug('Checking if token is valid');
    const isValidToken = await verifyToken(data.payload.token, reader.apiTokenHash);
    if (!isCurrentAttempt()) return;
    if (!isValidToken) {
      this.logger.error('Invalid token, sending UNAUTHORIZED response to client');
      await socket.sendMessage(unauthorizedResponse);
      if (previousReaderId && isCurrentAttempt()) (socket as unknown as WebSocket).close();
      return;
    }

    const storedLanguage = await this.settingsService.getDefaultLanguage();
    if (!isCurrentAttempt()) return;
    // A broadcast during the read supersedes its snapshot, even before this
    // socket becomes eligible for language broadcasts.
    const language = this.websocketService.readerLanguage ?? storedLanguage;
    this.enrollment.authenticated(socket);
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
