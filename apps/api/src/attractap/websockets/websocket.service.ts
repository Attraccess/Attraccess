import { Injectable } from '@nestjs/common';
import { AuthenticatedWebSocket } from './websocket.types';

@Injectable()
export class WebsocketService {
  public readonly sockets: Map<string, AuthenticatedWebSocket> = new Map();
}
