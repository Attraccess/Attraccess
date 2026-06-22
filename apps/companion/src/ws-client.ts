import WebSocket from 'ws';
import { EventEmitter } from 'events';

export type CompanionEventType =
  | 'COMPANION_REQUEST_AUTHENTICATION'
  | 'COMPANION_AUTHENTICATED'
  | 'COMPANION_REGISTER'
  | 'COMPANION_LOCK_PC'
  | 'COMPANION_UNLOCK_PC'
  | 'COMPANION_UPDATE_AVAILABLE';

export interface CompanionResource {
  id: number;
  name: string;
}

export interface AuthenticatedPayload {
  deviceId: number;
  deviceName: string;
  resources: CompanionResource[];
}

export interface RegisterPayload {
  id: number;
  token: string;
}

export interface UpdateAvailablePayload {
  downloadUrl: string;
  version: string;
}

export declare interface CompanionWsClient {
  on(event: 'request_authentication', listener: () => void): this;
  on(event: 'authenticated', listener: (payload: AuthenticatedPayload) => void): this;
  on(event: 'register', listener: (payload: RegisterPayload) => void): this;
  on(event: 'lock_pc', listener: () => void): this;
  on(event: 'unlock_pc', listener: () => void): this;
  on(event: 'update_available', listener: (payload: UpdateAvailablePayload) => void): this;
  on(event: 'connected', listener: () => void): this;
  on(event: 'disconnected', listener: () => void): this;
}

export class CompanionWsClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private reconnectDelay = 2000;
  private readonly maxDelay = 60000;
  private stopped = false;
  private reconnectTimer: NodeJS.Timeout | null = null;

  constructor(private readonly serverUrl: string) {
    super();
  }

  connect() {
    this.stopped = false;
    this.reconnectDelay = 2000;
    this.openSocket();
  }

  private openSocket() {
    const url = this.serverUrl.replace(/^http/, 'ws') + '/api/companion/websocket';
    this.ws = new WebSocket(url);

    this.ws.on('open', () => {
      this.reconnectDelay = 2000;
      this.emit('connected');
    });

    this.ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as { event: string; data: { type: CompanionEventType; payload: unknown } };
        if (msg.event !== 'EVENT') return;
        this.dispatch(msg.data.type, msg.data.payload);
      } catch {
        // ignore malformed messages
      }
    });

    this.ws.on('close', () => {
      this.emit('disconnected');
      if (!this.stopped) this.scheduleReconnect();
    });

    this.ws.on('error', () => {
      // close event fires after error, reconnect handled there
    });
  }

  private scheduleReconnect() {
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.openSocket();
    }, this.reconnectDelay);
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxDelay);
  }

  stop() {
    this.stopped = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
  }

  sendAuthenticate(id?: number, token?: string) {
    this.send('COMPANION_AUTHENTICATE', id !== undefined && token !== undefined ? { id, token } : {});
  }

  sendRegister() {
    this.send('COMPANION_REGISTER', {});
  }

  private send(type: string, payload: unknown) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ event: 'EVENT', data: { type, payload } }));
    }
  }

  private dispatch(type: CompanionEventType, payload: unknown) {
    switch (type) {
      case 'COMPANION_REQUEST_AUTHENTICATION':
        this.emit('request_authentication');
        break;
      case 'COMPANION_AUTHENTICATED':
        this.emit('authenticated', payload as AuthenticatedPayload);
        break;
      case 'COMPANION_REGISTER':
        this.emit('register', payload as RegisterPayload);
        break;
      case 'COMPANION_LOCK_PC':
        this.emit('lock_pc');
        break;
      case 'COMPANION_UNLOCK_PC':
        this.emit('unlock_pc');
        break;
      case 'COMPANION_UPDATE_AVAILABLE':
        this.emit('update_available', payload as UpdateAvailablePayload);
        break;
    }
  }
}
