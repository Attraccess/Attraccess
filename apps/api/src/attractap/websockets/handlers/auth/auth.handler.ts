import { SettingsService } from '../../../../settings/settings.service';
import { WebSocket } from 'ws';
import type { AttractapReader } from '@attraccess/application-models';
import { WebsocketService } from '../../websocket.service';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { AttractapService } from '../../../attractap.service';
import { ResourceListService } from '../resource-list/resource-list.service';
import { MetricsService } from '../../../../metrics/metrics.service';
import { AuthenticatedWebSocket, AttractapEvent, AttractapEventType } from '../../websocket.types';
import { ReaderTimeZoneService } from '../../reader-time-zone.service';

/** The reader's resource ids from the sign-in lookup, so the zone resolve needs no second one. */
const resourceIdsOf = (reader: AttractapReader): number[] | undefined =>
  reader.resources?.map((resource) => resource.id);

@Injectable()
export class AttractapAuthHandler {
  private readonly logger = new Logger(AttractapAuthHandler.name);

  @Inject(AttractapService)
  private attractapService: AttractapService;

  @Inject(ResourceListService)
  private resourceListService: ResourceListService;

  @Inject(MetricsService)
  private metricsService: MetricsService;

  @Inject(ReaderTimeZoneService)
  private readerTimeZone: ReaderTimeZoneService;

  @Inject(SettingsService)
  private settingsService: SettingsService;

  @Inject(WebsocketService)
  private websocketService: WebsocketService;

  /**
   * Resolves the reader's time zone before the socket becomes the reader's, so a superseded attempt claims and
   * sends nothing. Meanwhile the socket counts as signing in as the reader: a closing sibling socket (a reconnect)
   * does not drop the zone. A superseded attempt leaves nothing behind unless another socket uses the reader.
   */
  private async resolveTimeZone(
    socket: AuthenticatedWebSocket,
    reader: AttractapReader,
    resourceGeneration: number,
    attempt: symbol,
    isCurrentAttempt: () => boolean,
  ): Promise<boolean> {
    socket.state.signingIn = { readerId: reader.id, attempt };
    try {
      await this.readerTimeZone.resolve(reader.id, resourceIdsOf(reader), resourceGeneration);
    } finally {
      if (socket.state.signingIn?.attempt === attempt) delete socket.state.signingIn;
    }
    if (isCurrentAttempt()) return true;
    this.readerTimeZone.forgetUnlessInUse(reader.id);
    return false;
  }

  /**
   * Signs in a reader whose identity was already proven by its TLS client certificate.
   */
  public async authenticateSessionReader(socket: AuthenticatedWebSocket, readerId: number): Promise<boolean> {
    const attempt = Symbol('reader-session-authentication');
    socket.state.readerAuthenticationAttempt = attempt;
    const isCurrentAttempt = () =>
      socket.state.readerAuthenticationAttempt === attempt && socket.readyState === WebSocket.OPEN;

    const resourceGeneration = this.readerTimeZone.resourceGeneration(readerId);
    const reader = await this.attractapService.findReaderById(readerId);
    if (!reader || reader.pairingState !== 'paired' || !isCurrentAttempt()) return false;

    const storedLanguage = await this.settingsService.getDefaultLanguage();
    if (!isCurrentAttempt()) return false;
    if (!(await this.resolveTimeZone(socket, reader, resourceGeneration, attempt, isCurrentAttempt))) return false;
    const language = this.websocketService.readerLanguage ?? storedLanguage;
    socket.readerId = reader.id;
    socket.readerName = reader.name;
    this.metricsService.attractapReaderConnected.set({ reader_id: String(reader.id), reader_name: reader.name }, 1);

    await socket.sendMessage(
      new AttractapEvent(AttractapEventType.READER_AUTHENTICATED, {
        name: reader.name,
        language,
        serverTime: this.readerTimeZone.serverTimeFor(reader.id),
      }),
    );
    if (!isCurrentAttempt()) return false;
    await this.resourceListService.sendResourceListToSocket(socket);
    return true;
  }
}
