import { Transport, ESPLoader, IEspLoaderTerminal, FlashModeValues, FlashFreqValues, FlashSizeValues } from 'esptool-js';
import { Mutex } from 'async-mutex';

export enum ESPToolsErrorType {
  NO_PORT_SELECTED = 'NO_PORT_SELECTED',
  CONNECTION_FAILED = 'CONNECTION_FAILED',
  PORT_OPEN_FAILED = 'PORT_OPEN_FAILED',
  FLASH_FAILED = 'FLASH_FAILED',
  DEVICE_NOT_FOUND = 'DEVICE_NOT_FOUND',
  FIRMWARE_READ_FAILED = 'FIRMWARE_READ_FAILED',
  RESET_FAILED = 'RESET_FAILED',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
  NO_TRANSPORT_AVAILABLE = 'NO_TRANSPORT_AVAILABLE',
}

export interface ESPToolsResult<T = unknown> {
  success: boolean;
  error: { type: ESPToolsErrorType; details?: unknown } | null;
  data: T | null;
}

export interface Command {
  topic: string;
  payload?: string;
}

export interface ConnectionStateEvent {
  connected: boolean;
  /**
   * True while the device dropped off the bus (e.g. it rebooted after flashing
   * and is re-enumerating on USB) and we are trying to re-attach automatically.
   */
  reconnecting: boolean;
  timestamp: number;
}

interface UseTransportOptionsBlocking<TResult = unknown> {
  blocking: true;
  fn: (transport: Transport, release: () => void) => Promise<TResult>;
}

interface UseTransportOptionsNonBlocking<TResult = unknown> {
  blocking: false;
  fn: (transport: Transport) => Promise<TResult>;
}

type EventListener<T = unknown> = (data: T) => void;

export type ESPToolsEvent = 'connectionState';

export type ESPToolsEventData = {
  connectionState: ConnectionStateEvent;
};

export class ESPTools {
  private static _instance: ESPTools;
  private _transport: Transport | null = null;
  private _transportMutex = new Mutex();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _eventListeners: Map<string, Set<EventListener<any>>> = new Map();
  private _lastPortInfo: SerialPortInfo | null = null;
  private _isReconnecting = false;

  private static readonly RECONNECT_TIMEOUT_MS = 30_000;
  private static readonly RECONNECT_POLL_INTERVAL_MS = 1_000;

  public get isConnected(): boolean {
    return !!this._transport;
  }

  /**
   * True while the transport mutex is held (a flash or command is in flight).
   * Used by polling UIs to avoid queueing commands behind long operations.
   */
  public get isBusy(): boolean {
    return this._transportMutex.isLocked();
  }

  private emit<TEvent extends ESPToolsEvent>(event: TEvent, data: ESPToolsEventData[TEvent]): void {
    const listeners = this._eventListeners.get(event);
    if (listeners) {
      listeners.forEach((listener) => {
        try {
          listener(data);
        } catch (error) {
          console.error(`Error in event listener for ${event}:`, error);
        }
      });
    }
  }

  public on<TEvent extends ESPToolsEvent>(event: TEvent, listener: EventListener<ESPToolsEventData[TEvent]>): void {
    if (!this._eventListeners.has(event)) {
      this._eventListeners.set(event, new Set());
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this._eventListeners.get(event) as Set<EventListener<any>>).add(listener);
  }

  public off<TEvent extends ESPToolsEvent>(event: TEvent, listener: EventListener<ESPToolsEventData[TEvent]>): void {
    const listeners = this._eventListeners.get(event);
    if (listeners) {
      listeners.delete(listener);
      if (listeners.size === 0) {
        this._eventListeners.delete(event);
      }
    }
  }

  private setConnectionState(connected: boolean, reconnecting = false): void {
    this.emit('connectionState', {
      connected,
      reconnecting,
      timestamp: Date.now(),
    } as ConnectionStateEvent);
  }

  /**
   * The device rebooted or was power-cycled and dropped off the USB bus.
   * Since the user already granted permission for the port, we can re-attach
   * without a new picker dialog once the device re-enumerates (ATT-556).
   */
  private async tryAutoReconnect(): Promise<void> {
    if (this._isReconnecting) {
      return;
    }
    this._isReconnecting = true;
    this.setConnectionState(false, true);

    try {
      const deadline = Date.now() + ESPTools.RECONNECT_TIMEOUT_MS;
      while (!this._transport && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, ESPTools.RECONNECT_POLL_INTERVAL_MS));
        if (this._transport) {
          return;
        }

        let ports: SerialPort[] = [];
        try {
          ports = await navigator.serial.getPorts();
        } catch (err) {
          console.debug('Failed to enumerate serial ports during reconnect', err);
          continue;
        }

        const match = ports.find((candidate) => {
          if (!this._lastPortInfo) {
            return true;
          }
          const info = candidate.getInfo();
          return (
            info.usbVendorId === this._lastPortInfo.usbVendorId &&
            info.usbProductId === this._lastPortInfo.usbProductId
          );
        });

        if (!match) {
          continue;
        }

        try {
          await this.openTransport(match);
          console.debug('Auto-reconnected to device after disconnect');
          return;
        } catch (err) {
          console.debug('Reconnect attempt failed, retrying', err);
        }
      }

      if (!this._transport) {
        // Give up — surface the disconnect so the UI can offer manual reconnect.
        this.setConnectionState(false, false);
      }
    } finally {
      this._isReconnecting = false;
    }
  }

  // Single stable handler so re-attaching to the same SerialPort instance on
  // reconnect does not stack duplicate listeners (EventTarget dedupes by ref).
  private readonly _onPortDisconnect = () => {
    this._transport = null;
    this.tryAutoReconnect().catch((err) => console.error('Auto-reconnect failed', err));
  };

  private async openTransport(port: SerialPort, baudRate = 115200): Promise<void> {
    port.addEventListener('disconnect', this._onPortDisconnect);

    this._lastPortInfo = port.getInfo();

    // Open once with ESP-specific settings to validate the port, then hand it
    // to the esptool-js Transport (which opens it again itself).
    await port.open({
      baudRate,
      bufferSize: 8192,
    });

    try {
      await port.close();
    } catch (err) {
      console.error(err);
    }

    const transport = new Transport(port);
    try {
      await transport.connect(baudRate);
    } catch (err) {
      // Leave the port closed so a later attempt can re-open it cleanly.
      try {
        await port.close();
      } catch {
        // already closed
      }
      throw err;
    }

    this._transport = transport;
    this.setConnectionState(true);
  }

  private async useTransport<TResult = unknown>(
    opts: UseTransportOptionsBlocking<TResult> | UseTransportOptionsNonBlocking<TResult>,
  ): Promise<TResult> {
    let transport: Transport = this._transport as Transport;

    if (!this._transport) {
      const connectionResult = await this.connectToDevice();
      if (!connectionResult.success) {
        throw new Error('Failed to connect to device');
      }
      transport = this._transport as unknown as Transport;
    }

    const release = await this._transportMutex.acquire();

    try {
      if (opts.blocking) {
        return await opts.fn(transport, release);
      }

      return await (opts as UseTransportOptionsNonBlocking<TResult>).fn(transport);
    } catch (err) {
      if (!transport.device.connected) {
        console.debug('Device disconnected, disconnecting transport');
        this.setConnectionState(false);
        this._transport = null;
        throw err;
      }

      console.error('Error using transport:', err);
      if (
        err instanceof Error &&
        (err.message.includes('The port is closed') || err.message.includes('The device has been lost.'))
      ) {
        this.disconnect().catch((err) => {
          console.error('Error disconnecting transport:', err);
        });
      }

      throw err;
    } finally {
      release();
    }
  }

  private constructor() {
    // Private constructor to prevent instantiation
  }

  public static getInstance(): ESPTools {
    if (!ESPTools._instance) {
      ESPTools._instance = new ESPTools();
    }
    return ESPTools._instance;
  }

  public async connectToDevice(baudRate = 115200): Promise<ESPToolsResult<null>> {
    if (this.isConnected) {
      return {
        success: true,
        error: null,
        data: null,
      };
    }

    try {
      // Request port from user
      const port = await navigator.serial.requestPort();

      try {
        await this.openTransport(port, baudRate);
      } catch (err) {
        const error = err as Error;
        console.error(error);
        return {
          success: false,
          error: { type: ESPToolsErrorType.PORT_OPEN_FAILED, details: error.message },
          data: null,
        };
      }
    } catch (err) {
      const error = err as Error;
      if (error.name === 'NotFoundError') {
        return {
          success: false,
          error: { type: ESPToolsErrorType.NO_PORT_SELECTED, details: error.message },
          data: null,
        };
      }
      return {
        success: false,
        error: { type: ESPToolsErrorType.CONNECTION_FAILED, details: error.message },
        data: null,
      };
    }

    return {
      success: true,
      error: null,
      data: null,
    };
  }

  /**
   * NVS region of the merged firmware image. Matches
   * apps/attractap/firmware/partitions.csv (nvs @ 0x9000, size 0x5000).
   * The merged binary pads this gap with 0xFF, so writing it would wipe the
   * device configuration (wifi credentials, server config, PIN) on every
   * flash. When eraseFlash is false we skip this region to preserve settings
   * (ATT-556). The otadata region right after (0xE000-0x10000) IS written
   * (0xFF = invalidated) so the bootloader boots the freshly flashed app0
   * instead of a stale OTA slot.
   */
  private static readonly NVS_OFFSET = 0x9000;
  private static readonly NVS_END = 0xe000;

  private buildFlashFileArray(firmwareData: Uint8Array, preserveNvs: boolean): { data: Uint8Array; address: number }[] {
    if (!preserveNvs || firmwareData.length <= ESPTools.NVS_END) {
      return [{ data: firmwareData, address: 0 }];
    }

    const nvsRegion = firmwareData.subarray(ESPTools.NVS_OFFSET, ESPTools.NVS_END);
    const nvsRegionIsPadding = nvsRegion.every((byte) => byte === 0xff);
    if (!nvsRegionIsPadding) {
      // Image actually carries data in the NVS region — flash it as-is.
      console.warn('Firmware image contains data in the NVS region, flashing full image');
      return [{ data: firmwareData, address: 0 }];
    }

    return [
      { data: firmwareData.subarray(0, ESPTools.NVS_OFFSET), address: 0 },
      { data: firmwareData.subarray(ESPTools.NVS_END), address: ESPTools.NVS_END },
    ];
  }

  public async flashFirmware(options: {
    firmware: Blob;
    terminal?: IEspLoaderTerminal;
    onProgress?: (progressPct: number) => unknown;
    flashMode?: FlashModeValues;
    flashFreq?: FlashFreqValues;
    flashSize?: FlashSizeValues;
    /**
     * Erase the entire flash (factory reset) before writing. When false
     * (default) the device configuration stored in NVS survives the flash.
     */
    eraseFlash?: boolean;
  }): Promise<ESPToolsResult<void>> {
    const { firmware, terminal, onProgress, flashMode, flashFreq, flashSize, eraseFlash = false } = options;

    let firmwareData: Uint8Array;
    try {
      firmwareData = await new Promise<Uint8Array>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(firmware);
      });
    } catch (err) {
      return {
        success: false,
        error: { type: ESPToolsErrorType.FIRMWARE_READ_FAILED, details: err },
        data: null,
      };
    }

    let result: ESPToolsResult<void>;
    try {
      result = await this.useTransport({
        blocking: true,
        fn: async (transport) => {
          try {
            await transport.disconnect();
          } catch (err) {
            console.error(err);
          }

          const esploader = new ESPLoader({
            transport,
            baudrate: 115200,
            enableTracing: false,
            terminal,
          });

          await esploader.main();
          await esploader.flashId();

          // When not erasing, skip the NVS region so device settings survive.
          const fileArray = this.buildFlashFileArray(firmwareData, !eraseFlash);

          const totalSize = fileArray.reduce((sum, file) => sum + file.data.length, 0);
          let totalWritten = 0;

          await esploader.writeFlash({
            fileArray,
            flashSize: flashSize ?? 'keep',
            flashMode: flashMode ?? 'dio',
            flashFreq: flashFreq ?? '80m',
            eraseAll: eraseFlash,
            compress: true,
            reportProgress: (fileIndex: number, written: number, total: number) => {
              const uncompressedWritten = (written / total) * fileArray[fileIndex].data.length;
              const currentProgress = totalWritten + uncompressedWritten;
              const percentage = Math.floor((currentProgress / totalSize) * 100);

              const cappedPercentage = Math.min(percentage, 99);

              console.debug(`Writing firmware: ${cappedPercentage}%`);
              if (onProgress) {
                onProgress(cappedPercentage);
              }

              if (written === total) {
                totalWritten += uncompressedWritten;
              }
            },
          });

          return {
            success: true,
            error: null,
            data: undefined,
          };
        },
      });
    } catch (err) {
      const error = err as Error;
      return {
        success: false,
        error: { type: ESPToolsErrorType.FLASH_FAILED, details: error.message },
        data: null,
      };
    }

    let resetResult: ESPToolsResult<void>;
    if (!this._transport) {
      // The port dropped right after flashing — on ESP32-S3 native USB this is
      // the chip resetting and re-enumerating; auto-reconnect re-attaches.
      console.debug('Transport gone after flashing, device is rebooting on its own');
      resetResult = result;
    } else {
      try {
        resetResult = await this.useTransport({
          blocking: true,
          fn: async (transport) => {
            try {
              await this._hardReset(transport);

              return result;
            } catch (err) {
              return {
                success: false,
                error: { type: ESPToolsErrorType.RESET_FAILED, details: err },
                data: null,
              };
            }
          },
        });
      } catch (err) {
        resetResult = {
          success: false,
          error: { type: ESPToolsErrorType.RESET_FAILED, details: err },
          data: null,
        };
      }
    }

    // Signal completion only after the reset so the UI doesn't start sending
    // config commands while the chip is still in the bootloader.
    if (resetResult.success) {
      console.debug('Writing firmware: 100%');
      if (onProgress) {
        onProgress(100);
      }
    }

    return resetResult;
  }

  private async _hardReset(transport: Transport): Promise<void> {
    // esptool's hard_reset sequence: assert RTS (pulls EN low / chip into
    // reset), hold, release. transport.setRTS also re-applies the DTR state,
    // which is required for adapters on Windows (see esptool-js webserial.ts).
    await transport.setRTS(true);
    await new Promise((resolve) => setTimeout(resolve, 250));

    try {
      await transport.setRTS(false);
    } catch (err) {
      // On ESP32-S3 native USB the chip reset tears down the USB session: the
      // port may die between asserting and releasing RTS. The chip still
      // reboots (the latched signal state is cleared with the USB session), so
      // treat this as success and let auto-reconnect re-attach (ATT-556).
      console.debug('Releasing RTS failed after reset, device likely re-enumerating', err);
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  public async hardReset(): Promise<void> {
    return await this.useTransport({
      blocking: true,
      fn: async (transport) => {
        await this._hardReset(transport);
      },
    });
  }

  public async disconnect(): Promise<void> {
    if (!this._transport) {
      return;
    }

    try {
      // User-initiated disconnect: stop listening for device loss so we don't
      // auto-reconnect to a port the user intentionally released.
      (this._transport.device as unknown as SerialPort).removeEventListener('disconnect', this._onPortDisconnect);
      await this._transport.disconnect();
    } catch (err) {
      console.error('Error disconnecting transport:', err);
    } finally {
      this._transport = null;
      this.setConnectionState(false);
    }
  }

  public async getSerialOutput(onWrite: (data: Uint8Array) => unknown) {
    return await this.useTransport({
      blocking: false,
      fn: async (transport) => {
        let isConsoleClosed = false;
        const readLoopPromise = transport.rawRead(
          (data) => onWrite(data),
          () => isConsoleClosed,
        );

        return async () => {
          isConsoleClosed = true;
          await readLoopPromise;
        };
      },
    });
  }

  public async sendCommand(command: Command, waitForResponse = true, timeout = 15000): Promise<string | null> {
    return await this.useTransport({
      blocking: true,
      fn: async (transport, release) => {
        let commandString = `CMND ${command.topic}`;
        if (command.payload) {
          commandString += ` ${command.payload}`;
        }

        commandString += '\n';

        const commandBuffer = new TextEncoder().encode(commandString + '\n');
        console.debug(`Sending command: "${commandString}"`);
        await transport.write(commandBuffer);

        if (!waitForResponse) {
          return null;
        }

        // Read with our own reader so the timeout can cancel a pending read().
        // The previous implementation used transport.rawRead with a promise
        // that was never resolved on timeout: the mutex stayed locked forever
        // and the orphaned reader kept the stream locked, freezing every
        // subsequent command until a page reload (ATT-556).
        const readable = transport.device.readable;
        if (!readable) {
          throw new Error('Serial port is not readable');
        }

        const reader = readable.getReader();
        const timeoutId = setTimeout(() => {
          // cancel() resolves the pending read() with done=true
          reader.cancel().catch(() => undefined);
        }, timeout);

        try {
          let buffer = '';
          while (true) {
            const { value, done } = await reader.read();
            if (done || !value) {
              // Timed out (reader cancelled) or stream ended
              console.debug(`No response for topic ${command.topic} within ${timeout}ms`);
              return null;
            }

            buffer += new TextDecoder().decode(value);

            const bufferEndsWithNewLine = buffer.endsWith('\n');
            const lines = buffer.split('\n');
            if (!bufferEndsWithNewLine) {
              buffer = lines.pop() || '';
            } else {
              buffer = '';
            }

            for (const line of lines) {
              const trimmedLine = line.trim();
              if (!trimmedLine) continue;

              const cleaned = trimmedLine.replace(/^[^\x20-\x7E]*/g, '');
              console.debug('Cleaned line:', cleaned);

              const respMatch = cleaned.match(/^RESP\s+(\S+)\s+(.+)$/);
              if (!respMatch) {
                console.debug('No response match');
                continue;
              }

              const responseTopic = respMatch[1];
              const payload = respMatch[2];
              console.debug('Response topic:', responseTopic);

              if (responseTopic !== command.topic) {
                console.debug('Response topic does not match command topic:', responseTopic, '!==', command.topic);
                continue;
              }

              return payload ?? null;
            }
          }
        } finally {
          clearTimeout(timeoutId);
          reader.releaseLock();
        }
      },
    });
  }
}
