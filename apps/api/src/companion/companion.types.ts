import { CompanionDevice } from '@attraccess/database-entities';

export enum CompanionEventType {
  // Server → Client
  COMPANION_REQUEST_AUTHENTICATION = 'COMPANION_REQUEST_AUTHENTICATION',
  COMPANION_AUTHENTICATED = 'COMPANION_AUTHENTICATED',
  COMPANION_LOCK_PC = 'COMPANION_LOCK_PC',
  COMPANION_UNLOCK_PC = 'COMPANION_UNLOCK_PC',
  COMPANION_UPDATE_AVAILABLE = 'COMPANION_UPDATE_AVAILABLE',

  // Client → Server
  COMPANION_REGISTER = 'COMPANION_REGISTER',
  COMPANION_AUTHENTICATE = 'COMPANION_AUTHENTICATE',
}

export interface CompanionResourceDto {
  id: number;
  name: string;
}

export interface CompanionAuthenticatedPayload {
  deviceId: number;
  deviceName: string;
  resources: CompanionResourceDto[];
}

export interface CompanionRegisterPayload {
  id?: number;
  token?: string;
}

export interface CompanionUpdateAvailablePayload {
  downloadUrl: string;
  version: string;
}

export interface CompanionWebSocket extends Omit<WebSocket, 'send'> {
  id: string;
  deviceId: CompanionDevice['id'] | null;
  send: (data: string) => void;
  sendEvent: (type: CompanionEventType, payload?: unknown) => void;
}
