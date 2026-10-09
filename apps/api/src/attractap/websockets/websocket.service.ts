import { Injectable } from '@nestjs/common';
import { AuthenticatedWebSocket } from './websocket.types';

@Injectable()
export class WebsocketService {
  public readonly sockets: Map<string, AuthenticatedWebSocket> = new Map();

  // Latest persisted change, including updates while a reader is authenticating.
  public readerLanguage: 'en' | 'de' | undefined;
}
