import WebSocket from 'ws';
import { EventEmitter } from 'events';

// ─── Payload types (mirrors companion.types.ts on the API side) ──────────────
// These will be replaced by the generated client once ATT-623 is complete.

export interface CompanionAuthenticatePayload {
  id?: number;
  token?: string;
}

export interface CompanionResource {
  id: number;
  name: string;
}

export interface AuthenticatedPayload {
  deviceId: number;
  deviceName: string;
  resources: CompanionResource[];
}

export interface RegisterResponsePayload {
  id: number;
  token: string;
}

export interface UpdateAvailablePayload {
  downloadUrl: string;
  version: string;
}

// ─── Typed event emitter ──────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export declare interface CompanionWsClient {
  on(event: 'request_authentication', listener: () => void): this;
  on(event: 'authenticated', listener: (payload: AuthenticatedPayload) => void): this;
  on(event: 'register_response', listener: (payload: RegisterResponsePayload) => void): this;
  on(event: 'lock_pc', listener: () => void): this;
  on(event: 'unlock_pc', listener: () => void): this;
  on(event: 'update_available', listener: (payload: UpdateAvailablePayload) => void): this;
  on(event: 'connected', listener: () => void): this;
  on(event: 'disconnected', listener: () => void): this;
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
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
        const msg = JSON.parse(raw.toString()) as { event: string; data: unknown };
        this.dispatch(msg.event, msg.data);
      } catch {
        // ignore malformed messages
      }
    });

    this.ws.on('close', () => {
      this.emit('disconnected');
      if (!this.stopped) this.scheduleReconnect();
    });

    this.ws.on('error', () => {
      // close fires after error; reconnect handled there
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

  // ─── Send methods (Client → Server) ────────────────────────────────────────

  sendRegister() {
    this.send('COMPANION_REGISTER', {});
  }

  sendAuthenticate(payload: CompanionAuthenticatePayload) {
    this.send('COMPANION_AUTHENTICATE', payload);
  }

  private send(event: string, data: unknown) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ event, data }));
    }
  }

  // ─── Receive dispatch (Server → Client) ────────────────────────────────────

  private dispatch(event: string, data: unknown) {
    switch (event) {
      case 'COMPANION_REQUEST_AUTHENTICATION':
        this.emit('request_authentication');
        break;
      case 'COMPANION_AUTHENTICATED':
        this.emit('authenticated', data as AuthenticatedPayload);
        break;
      case 'COMPANION_REGISTER_RESPONSE':
        this.emit('register_response', data as RegisterResponsePayload);
        break;
      case 'COMPANION_LOCK_PC':
        this.emit('lock_pc');
        break;
      case 'COMPANION_UNLOCK_PC':
        this.emit('unlock_pc');
        break;
      case 'COMPANION_UPDATE_AVAILABLE':
        this.emit('update_available', data as UpdateAvailablePayload);
        break;
    }
  }
}
