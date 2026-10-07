import { randomBytes } from 'crypto';
import { closeSync } from 'fs';
import { LicenseModuleType } from '../../license/license.service';
import { ATTRACTAP_GATEWAY_LABEL } from '../../metrics/definitions/ws.metrics';
import { AttractapGatewayRouteContext } from './websocket.gateway.route-context';
import { AttractapEvent, AttractapEventType, AttractapMessage, AuthenticatedWebSocket } from './websocket.types';
export abstract class ReaderConnectionImplementation extends AttractapGatewayRouteContext {
  public async handleConnection(client: WebSocket) {
    this.connectedAt.set(client as unknown as object, process.hrtime.bigint());
    this.logger.log('Client connected via WebSocket');

    try {
      await this.licenseService.verifyLicense({
        modules: [LicenseModuleType.ATTRACTAP],
      });
    } catch (error) {
      this.logger.error('Closing connection due to license error');
      this.logger.error(error);
      client.close();
      return;
    }

    const id = randomBytes(4).toString('base64url').slice(0, 5);
    let messageCount = 0;

    const sendMessage = async (message: AttractapMessage) => {
      messageCount++;
      message.data.messageId = messageCount;

      const RETRY_COUNT = 3;

      let lastError: Error | undefined;

      for (let i = 0; i < RETRY_COUNT; i++) {
        this.logger.debug(
          `Sending ${message.event} of type ${message.data.type} (attempt ${i + 1}/${RETRY_COUNT})`,
          message.data.payload,
        );
        const stringifiedMessage = JSON.stringify(this.sanitizeForLVGL(message));
        client.send(stringifiedMessage);

        this.logger.debug(
          `Waiting for response for ${message.event} of type ${message.data.type} (attempt ${i + 1}/${RETRY_COUNT})`,
        );
        try {
          await this.waitForClientResponse(client as unknown as AuthenticatedWebSocket, message.data.type);
          lastError = undefined;
          break;
        } catch (error) {
          lastError = error as Error;
          this.logger.debug(`Attempt ${i + 1} failed: ${error.message}`);
        }
      }

      if (lastError) {
        this.logger.error(
          `Client did not send ACK for ${message.data.type} after ${RETRY_COUNT} attempts. Won't try again.`,
        );
        return false;
      }

      return true;
    };

    const sendBinaryData = (data: Buffer) => {
      try {
        client.send(data as unknown as BufferSource);
      } catch (e) {
        this.logger.error(`Failed to send binary data to client ${id}: ${(e as Error).message}`);
      }
    };

    Object.assign(client, {
      id,
      messageCount,
      readerId: null,
      readerName: null,
      sendMessage,
      sendBinaryData,
      state: {
        lastAuthenticatedUserId: null,
        enrollment: null,
        enrollNewCardData: null,
        resetNfcCardData: null,
        ota: null,
        supervisionFlow: null,
      },
    });

    this.websocketService.sockets.set(id, client as unknown as AuthenticatedWebSocket);
    this.metricsService.attractapDevicesConnected.set(this.websocketService.sockets.size);

    await this.clientWasActive(client as unknown as AuthenticatedWebSocket);

    this.logger.debug('Sending authentication request');
    try {
      await sendMessage(new AttractapEvent(AttractapEventType.READER_REQUEST_AUTHENTICATION, {}));
    } catch (error) {
      this.logger.error(`Initial authentication request failed for client ${id}. Closing connection.`);
      this.logger.error(error as Error);
      try {
        client.close();
      } catch {
        // ignore error
      }
      return;
    }
  }

  public async handleDisconnect(socket: AuthenticatedWebSocket) {
    const connectedAt = this.connectedAt.get(socket as unknown as object);
    this.connectedAt.delete(socket as unknown as object);
    if (connectedAt !== undefined && this.metricsToggle.isEnabledCached('ws')) {
      const seconds = Number(process.hrtime.bigint() - connectedAt) / 1e9;
      this.wsMetrics.connectionDuration.observe({ gateway: ATTRACTAP_GATEWAY_LABEL }, seconds);
    }

    this.logger.debug(`Client ${socket.id} disconnected.`);

    await this.clientResponseAwaitersMutex.runExclusive(async () => {
      this.clientResponseAwaiters = this.clientResponseAwaiters.filter((awaiter) => awaiter.clientId !== socket.id);
    });

    const readerId = socket.readerId;
    const readerName = socket.readerName;
    if (readerId) {
      this.logger.log(`Client for reader ${readerId} disconnected.`);
      // ponytail: only zero gauge when no other socket for this reader exists —
      // prevents a stale-socket disconnect from marking a reconnected reader offline.
      const hasOtherSocket = Array.from(this.websocketService.sockets.values()).some(
        (other) => other.id !== socket.id && other.readerId === readerId,
      );
      if (!hasOtherSocket) {
        this.metricsService.attractapReaderConnected.set(
          { reader_id: String(readerId), reader_name: readerName ?? '' },
          0,
        );
      }
    } else {
      this.logger.log('An unidentified client disconnected.');
    }

    // Tear down any in-progress two-card supervision so the supervisor's web popup doesn't linger.
    if (socket.state?.supervisionFlow) {
      this.supervisionHandler.cancelForSocket(socket);
    }

    // Clean up OTA file descriptor if present
    if (socket.state?.ota?.fd) {
      try {
        closeSync(socket.state.ota.fd);
      } catch {
        // nothing to do
      }
    }
    this.websocketService.sockets.delete(socket.id);
    this.metricsService.attractapDevicesConnected.set(this.websocketService.sockets.size);
  }

  protected async clientWasActive(socket: AuthenticatedWebSocket) {
    if (socket.readerId) {
      await this.attractapService.updateLastReaderConnection(socket.readerId);
    }
  }
}
