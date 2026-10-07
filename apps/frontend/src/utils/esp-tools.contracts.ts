import { ESPToolsErrorType } from './esp-tools.esptools-error-type';
import { Transport } from 'esptool-js';
export interface Command {
  topic: string;
  payload?: string;
}
export interface ConnectionStateEvent {
  connected: boolean;
  timestamp: number;
}

export type ESPToolsEventData = {
  connectionState: ConnectionStateEvent;
};
export type ESPToolsEvent = 'connectionState';

export interface ESPToolsResult<T = unknown> {
  success: boolean;
  error: { type: ESPToolsErrorType; details?: unknown } | null;
  data: T | null;
}
export type EventListener<T = unknown> = (data: T) => void;

export interface UseTransportOptionsBlocking<TResult = unknown> {
  blocking: true;
  fn: (transport: Transport, release: () => void) => Promise<TResult>;
}

export interface UseTransportOptionsNonBlocking<TResult = unknown> {
  blocking: false;
  fn: (transport: Transport) => Promise<TResult>;
}
