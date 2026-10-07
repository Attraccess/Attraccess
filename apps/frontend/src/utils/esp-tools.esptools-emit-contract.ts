import { Transport } from 'esptool-js';
import { ESPToolsResult } from './esp-tools.contracts';
import { IEspLoaderTerminal } from 'esptool-js';
import { FlashModeValues } from 'esptool-js';
import { FlashFreqValues } from 'esptool-js';
import { FlashSizeValues } from 'esptool-js';
import { Command } from './esp-tools.contracts';
import { UseTransportOptionsBlocking } from './esp-tools.contracts';
import { UseTransportOptionsNonBlocking } from './esp-tools.contracts';
import { EventListener } from './esp-tools.contracts';
import { ESPToolsEvent } from './esp-tools.contracts';
import { ESPToolsEventData } from './esp-tools.contracts';

export abstract class ESPToolsEmitContract {
  protected abstract emit<TEvent extends ESPToolsEvent>(event: TEvent, data: ESPToolsEventData[TEvent]): void;
  abstract on<TEvent extends ESPToolsEvent>(event: TEvent, listener: EventListener<ESPToolsEventData[TEvent]>): void;
  abstract off<TEvent extends ESPToolsEvent>(event: TEvent, listener: EventListener<ESPToolsEventData[TEvent]>): void;
  protected abstract setConnectionState(connected: boolean): void;
  protected abstract useTransport<TResult = unknown>(
    opts: UseTransportOptionsBlocking<TResult> | UseTransportOptionsNonBlocking<TResult>,
  ): Promise<TResult>;
  abstract connectToDevice(baudRate?: number): Promise<ESPToolsResult<null>>;
  abstract flashFirmware(options: {
    firmware: Blob;
    terminal?: IEspLoaderTerminal;
    onProgress?: (progressPct: number) => unknown;
    flashMode?: FlashModeValues;
    flashFreq?: FlashFreqValues;
    flashSize?: FlashSizeValues;
  }): Promise<ESPToolsResult<void>>;
  protected abstract _hardReset(transport: Transport): Promise<void>;
  abstract hardReset(): Promise<void>;
  abstract disconnect(): Promise<void>;
  abstract getSerialOutput(onWrite: (data: Uint8Array) => unknown): Promise<() => Promise<void>>;
  abstract sendCommand(command: Command, waitForResponse?: boolean, timeout?: number): Promise<string | null>;
}
