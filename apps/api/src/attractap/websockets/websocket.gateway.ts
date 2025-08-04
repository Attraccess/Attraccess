import {
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
  WebSocketServer,
  OnGatewayDisconnect,
  OnGatewayConnection,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server } from 'ws';
import { Inject, Logger } from '@nestjs/common';
import { WebsocketService } from './websocket.service';
import { InitialReaderState } from './reader-states/initial.state';
import { EnrollNTAG424State } from './reader-states/enroll-ntag424.state';
import { AuthenticatedWebSocket, AttractapEvent, AttractapMessage, AttractapEventType } from './websocket.types';
import { AttractapService } from '../attractap.service';
import { nanoid } from 'nanoid';
import { ResetNTAG424State } from './reader-states/reset-ntag424.state';
import { ReaderState } from './reader-states/reader-state.interface';
import { UsersService } from '../../users-and-auth/users/users.service';
import { ResourcesService } from '../../resources/resources.service';
import { ResourceUsageService } from '../../resources/usage/resourceUsage.service';
import { WaitForResourceSelectionState } from './reader-states/wait-for-resource-selection.state';
import { WaitForNFCTapState, WaitForNFCTapStateStep } from './reader-states/wait-for-nfc-tap.state';
import { AttractapFirmwareService } from '../firmware.service';
import { ResourceMaintenanceService } from '../../resources/maintenances/maintenance.service';
import { Mutex } from 'async-mutex';

export interface GatewayServices {
  websocketService: WebsocketService;
  attractapService: AttractapService;
  resourcesService: ResourcesService;
  resourceUsageService: ResourceUsageService;
  usersService: UsersService;
  firmwareService: AttractapFirmwareService;
  gateway: AttractapGateway;
  resourceMaintenanceService: ResourceMaintenanceService;
}

@WebSocketGateway({ path: '/api/attractap/websocket' })
export class AttractapGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(AttractapGateway.name);
  private readonly clientResponseAwaitersMutex = new Mutex();

  @Inject(WebsocketService)
  private websocketService: WebsocketService;

  @Inject(AttractapService)
  private attractapService: AttractapService;

  @Inject(UsersService)
  private usersService: UsersService;

  @Inject(ResourcesService)
  private resourcesService: ResourcesService;

  @Inject(ResourceUsageService)
  private resourceUsageService: ResourceUsageService;

  @Inject(AttractapFirmwareService)
  private firmwareService: AttractapFirmwareService;

  @Inject(ResourceMaintenanceService)
  private resourceMaintenanceService: ResourceMaintenanceService;

  public async handleConnection(client: AuthenticatedWebSocket) {
    this.logger.log('Client connected via WebSocket');

    client.id = nanoid(5);

    client.transitionToState = async (state: ReaderState) => {
      if (client.state) {
        try {
          await client.state.onStateExit();
        } catch (error) {
          this.logger.error('Error exiting state', error);
          client.close();
          this.handleDisconnect(client);
          const stackTrace = new Error().stack;
          this.logger.error(stackTrace);
          throw error;
        }
      }
      client.state = state;
      try {
        await client.state.onStateEnter();
      } catch (error) {
        this.logger.error('Error entering state', error);
        client.close();
        this.handleDisconnect(client);
        const stackTrace = new Error().stack;
        this.logger.error(stackTrace);
      }
    };

    client.sendMessage = async (message: AttractapMessage) => {
      const RETRY_COUNT = 3;

      let lastError: Error | undefined;

      for (let i = 0; i < RETRY_COUNT; i++) {
        this.logger.debug(
          `Sending ${message.event} of type ${message.data.type} (attempt ${i + 1}/${RETRY_COUNT})`,
          message.data.payload
        );
        (client as unknown as WebSocket).send(JSON.stringify(message));

        this.logger.debug(
          `Waiting for response for ${message.event} of type ${message.data.type} (attempt ${i + 1}/${RETRY_COUNT})`
        );
        try {
          await this.waitForClientResponse(client, message.data.type);
          lastError = undefined;
          break;
        } catch (error) {
          lastError = error as Error;
          this.logger.debug(`Attempt ${i + 1} failed: ${error.message}`);
        }
      }

      if (lastError) {
        this.logger.error(
          `Client did not send ACK for ${message.data.type} after ${RETRY_COUNT} attempts. Closing connection.`
        );
        throw lastError;
      }
    };

    client.sendBinaryData = (data: Buffer) => {
      this.logger.verbose(`Sending binary data: ${data.length} bytes`);
      (client as unknown as WebSocket).send(data);
    };

    this.websocketService.sockets.set(client.id, client);

    await this.clientWasActive(client);

    this.logger.debug('Transitioning to initial state');
    await client.transitionToState(
      new InitialReaderState(client, {
        websocketService: this.websocketService,
        attractapService: this.attractapService,
        usersService: this.usersService,
        resourceUsageService: this.resourceUsageService,
        resourcesService: this.resourcesService,
        firmwareService: this.firmwareService,
        gateway: this,
        resourceMaintenanceService: this.resourceMaintenanceService,
      })
    );
  }

  private clientResponseAwaiters: Array<{
    id: string;
    clientId: string;
    type: AttractapEventType;
    resolve: () => void;
    timeoutId: NodeJS.Timeout;
  }> = [];

  private async waitForClientResponse(client: AuthenticatedWebSocket, type: AttractapEventType, timeoutMs = 4000) {
    const id = nanoid(5);

    const removeAwaiter = async () => {
      await this.clientResponseAwaitersMutex.runExclusive(async () => {
        this.clientResponseAwaiters = this.clientResponseAwaiters.filter((awaiter) => awaiter.id !== id);
      });
    };

    // TODO: refactor wait for response to rely on ACK messages instead of response mesaages
    return await new Promise<void>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        removeAwaiter();
        reject(new Error('Timeout waiting for client response'));
      }, timeoutMs);

      const onResolve = () => {
        clearTimeout(timeoutId);
        resolve();
        removeAwaiter();
      };

      this.clientResponseAwaiters.push({ id, clientId: client.id, type, resolve: onResolve, timeoutId });
    });
  }

  private async resolveClientResponseAwaiters(client: AuthenticatedWebSocket, type: AttractapEventType) {
    await this.clientResponseAwaitersMutex.runExclusive(async () => {
      const matchingAwaiters = this.clientResponseAwaiters.filter(
        (awaiter) => awaiter.clientId === client.id && awaiter.type === type
      );

      this.logger.debug(
        `Found ${matchingAwaiters.length} awaiters for client ${client.id} for event ${type} to resolve`
      );

      matchingAwaiters.forEach((awaiter) => {
        awaiter.resolve();
        clearTimeout(awaiter.timeoutId);
      });

      this.clientResponseAwaiters = this.clientResponseAwaiters.filter((awaiter) => awaiter.clientId !== client.id);
    });
  }

  public async handleDisconnect(client: AuthenticatedWebSocket) {
    this.logger.debug(`Client ${client.id} disconnected.`);

    await this.clientResponseAwaitersMutex.runExclusive(async () => {
      this.clientResponseAwaiters = this.clientResponseAwaiters.filter((awaiter) => awaiter.clientId !== client.id);
    });

    const readerId = client.reader?.id;
    if (readerId) {
      this.logger.log(`Client for reader ${readerId} disconnected.`);
    } else {
      this.logger.log('An unidentified client disconnected.');
    }

    this.websocketService.sockets.delete(client.id);
  }

  private async clientWasActive(client: AuthenticatedWebSocket) {
    if (client.reader) {
      await this.attractapService.updateLastReaderConnection(client.reader.id);
    }
  }

  @SubscribeMessage('HEARTBEAT')
  public async onHeartbeat(@ConnectedSocket() client: AuthenticatedWebSocket) {
    this.logger.debug(`Heartbeat from client ${client.id}.`);

    await this.clientWasActive(client);
  }

  @SubscribeMessage('EVENT')
  public async onClientEvent(
    @MessageBody() eventData: AttractapEvent['data'],
    @ConnectedSocket() client: AuthenticatedWebSocket
  ) {
    if (!client.state) {
      this.logger.error('Client has no state attached. Closing connection.');
      return;
    }

    await this.clientWasActive(client);

    this.logger.debug(`Received event from client ${client.id}: ${JSON.stringify(eventData)}`);

    if (eventData.type === AttractapEventType.NFC_TAP) {
      this.logger.debug(`Updating last seen for NFC card ${eventData.payload.cardUID}`);
      await this.attractapService.updateNFCCardLastSeen(eventData.payload.cardUID);
    }

    await client.state.onEvent(eventData);

    return undefined;
  }

  @SubscribeMessage('RESPONSE')
  public async onResponse(
    @MessageBody() responseData: AttractapEvent['data'],
    @ConnectedSocket() client: AuthenticatedWebSocket
  ) {
    if (!client.state) {
      this.logger.error('Client has no state attached. Closing connection.');
      return;
    }

    await this.clientWasActive(client);

    if (responseData.type.startsWith('ACK_')) {
      this.logger.debug(`Received ACK response from client ${client.id}: ${JSON.stringify(responseData)}`);

      this.resolveClientResponseAwaiters(client, responseData.type.replace('ACK_', '') as AttractapEventType);
      return;
    }

    this.logger.debug(`Received response from client ${client.id}: ${JSON.stringify(responseData)}`);

    await client.state.onResponse(responseData);

    return undefined;
  }

  public async startEnrollOfNewNfcCard(data: { readerId: number; userId: number }) {
    const reader = await this.attractapService.findReaderById(data.readerId);

    if (!reader) {
      throw new Error(`Reader not found: ${data.readerId}`);
    }

    const user = await this.usersService.findOne({ id: data.userId });

    if (!user) {
      throw new Error(`User not found: ${data.userId}`);
    }

    const socket = Array.from(this.websocketService.sockets.values()).find(
      (socket) => socket.reader?.id === data.readerId
    );

    if (!socket) {
      throw new Error(`Reader not connected: ${data.readerId}`);
    }

    const nextState = new EnrollNTAG424State(
      socket,
      {
        websocketService: this.websocketService,
        attractapService: this.attractapService,
        usersService: this.usersService,
        resourceUsageService: this.resourceUsageService,
        resourcesService: this.resourcesService,
        firmwareService: this.firmwareService,
        gateway: this,
        resourceMaintenanceService: this.resourceMaintenanceService,
      },
      user
    );

    await socket.transitionToState(nextState);
  }

  public async startResetOfNfcCard(data: { readerId: number; userId: number; cardId: number }) {
    const reader = await this.attractapService.findReaderById(data.readerId);

    if (!reader) {
      throw new Error(`Reader not found: ${data.readerId}`);
    }

    const user = await this.usersService.findOne({ id: data.userId });

    if (!user) {
      throw new Error(`User not found: ${data.userId}`);
    }

    const socket = Array.from(this.websocketService.sockets.values()).find(
      (socket) => socket.reader?.id === data.readerId
    );

    if (!socket) {
      throw new Error(`Reader not connected: ${data.readerId}`);
    }

    const nfcCard = await this.attractapService.getNFCCardByID(data.cardId);

    if (!nfcCard) {
      throw new Error(`NFC card not found: ${data.cardId}`);
    }

    const nextState = new ResetNTAG424State(
      socket,
      {
        websocketService: this.websocketService,
        attractapService: this.attractapService,
        usersService: this.usersService,
        resourceUsageService: this.resourceUsageService,
        resourcesService: this.resourcesService,
        firmwareService: this.firmwareService,
        gateway: this,
        resourceMaintenanceService: this.resourceMaintenanceService,
      },
      nfcCard.id
    );
    await socket.transitionToState(nextState);
  }

  public async restartReader(readerId: number) {
    this.logger.debug(`Restarting reader ${readerId}.`);
    const sockets = Array.from(this.websocketService.sockets.values()).filter(
      (socket) => socket.reader?.id === readerId
    );

    await Promise.all(
      sockets.map(async (socket) => {
        this.logger.debug(`Resetting client ${socket.id} for reader ${readerId}.`);

        const nextState = new InitialReaderState(socket, {
          websocketService: this.websocketService,
          attractapService: this.attractapService,
          usersService: this.usersService,
          resourceUsageService: this.resourceUsageService,
          resourcesService: this.resourcesService,
          firmwareService: this.firmwareService,
          gateway: this,
          resourceMaintenanceService: this.resourceMaintenanceService,
        });

        await socket.transitionToState(nextState);
      })
    );
  }

  public async onResourceUsageChanged(resourceId: number) {
    const sockets = Array.from(this.websocketService.sockets.values()).filter((socket) =>
      socket.reader?.resources.some((r) => r.id === resourceId)
    );

    await Promise.all(
      sockets.map(async (socket) => {
        if (socket.state instanceof WaitForNFCTapState || socket.state instanceof WaitForResourceSelectionState) {
          if (
            ![WaitForNFCTapStateStep.IDLE, WaitForNFCTapStateStep.WAIT_FOR_TAP].includes(
              (socket.state as WaitForNFCTapState).state
            )
          ) {
            return;
          }
          await socket.transitionToState(
            new InitialReaderState(socket, {
              websocketService: this.websocketService,
              attractapService: this.attractapService,
              usersService: this.usersService,
              resourceUsageService: this.resourceUsageService,
              resourcesService: this.resourcesService,
              firmwareService: this.firmwareService,
              gateway: this,
              resourceMaintenanceService: this.resourceMaintenanceService,
            })
          );
        }
      })
    );
  }
}
