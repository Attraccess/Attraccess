import { Transport } from 'esptool-js';
import { Mutex } from 'async-mutex';
import { EventListener } from './esp-tools.contracts';
import { ESPToolsEmitContract } from './esp-tools.esptools-emit-contract';

export abstract class ESPToolsState extends ESPToolsEmitContract {
  protected _transport: Transport | null = null;

  protected _transportMutex = new Mutex();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected _eventListeners: Map<string, Set<EventListener<any>>> = new Map();

  public get isConnected(): boolean {
    return !!this._transport;
  }

  protected constructor() {
    super();
    // Private constructor to prevent instantiation
  }
}
