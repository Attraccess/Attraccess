import { Transport, ESPLoader, IEspLoaderTerminal } from 'esptool-js';
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
  type: 'GET' | 'SET';
  topic: string;
  payload?: string;
}

export interface ConnectionStateEvent {
  connected: boolean;
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

  public get isConnected(): boolean {
    return !!this._transport;
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

  private setConnectionState(connected: boolean): void {
    this.emit('connectionState', {
      connected,
      timestamp: Date.now(),
    } as ConnectionStateEvent);
  }

  private async useTransport<TResult = unknown>(
    opts: UseTransportOptionsBlocking<TResult> | UseTransportOptionsNonBlocking<TResult>
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

      port.addEventListener('disconnect', () => {
        this._transport = null;
        this.setConnectionState(false);
      });

      try {
        // Open connection with ESP-specific settings
        await port.open({
          baudRate: 115200,
          bufferSize: 8192,
        });
      } catch (err) {
        const error = err as Error;
        console.error(error);
        return {
          success: false,
          error: { type: ESPToolsErrorType.PORT_OPEN_FAILED, details: error.message },
          data: null,
        };
      }

      try {
        await port.close();
      } catch (err) {
        console.error(err);
      }

      this._transport = new Transport(port);
      await this._transport.connect(baudRate);
      this.setConnectionState(true);
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

  public async flashFirmware(options: {
    firmware: Blob;
    terminal?: IEspLoaderTerminal;
    onProgress?: (progressPct: number) => unknown;
  }): Promise<ESPToolsResult<void>> {
    const { firmware, terminal, onProgress } = options;

    let firmwareDataString: string;
    try {
      firmwareDataString = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const arrayBuffer = reader.result as ArrayBuffer;
          const uint8Array = new Uint8Array(arrayBuffer);
          // Convert to binary string for compatibility with esploader
          const binaryString = Array.from(uint8Array)
            .map((byte) => String.fromCharCode(byte))
            .join('');
          resolve(binaryString);
        };
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
            romBaudrate: 115200,
            enableTracing: false,
            terminal,
          });

          await esploader.main();
          await esploader.flashId();

          const ERASE_FIRST = true;

          if (ERASE_FIRST) {
            await esploader.eraseFlash();
          }

          const totalSize = firmware.size;
          let totalWritten = 0;

          await esploader.writeFlash({
            fileArray: [{ data: firmwareDataString, address: 0 }],
            flashSize: 'keep',
            flashMode: 'keep',
            flashFreq: 'keep',
            eraseAll: false,
            compress: true,
            reportProgress: (_fileIndex: number, written: number, total: number) => {
              const uncompressedWritten = (written / total) * firmwareDataString.length;
              const currentProgress = totalWritten + uncompressedWritten;
              const percentage = Math.floor((currentProgress / totalSize) * 100);

              // Ensure we don't skip 99% - cap at 99% until we're truly done
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

          // Call onProgress with 100% after flashing is complete
          console.debug('Writing firmware: 100%');
          if (onProgress) {
            onProgress(100);
          }

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

    return await this.useTransport({
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
  }

  private async _hardReset(transport: Transport): Promise<void> {
    await transport.device.setSignals({
      dataTerminalReady: false,
      requestToSend: true,
      dataCarrierDetect: false,
      clearToSend: false,
      ringIndicator: false,
      dataSetReady: false,
    });

    await new Promise((resolve) => setTimeout(resolve, 250));

    await transport.device.setSignals({
      dataTerminalReady: false,
      requestToSend: false,
      dataCarrierDetect: false,
      clearToSend: false,
      ringIndicator: false,
      dataSetReady: false,
    });

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
        let readLoopPromise: Promise<void> | null = null;

        const startReadLoop = async () => {
          const readLoop = transport.rawRead();
          while (!isConsoleClosed) {
            const { value, done } = await readLoop.next();

            if (done || !value) {
              break;
            }
            onWrite(value);
          }
        };

        readLoopPromise = startReadLoop();

        return async () => {
          isConsoleClosed = true;
          if (readLoopPromise) {
            await readLoopPromise;
          }
        };
      },
    });
  }

  public async sendCommand(command: Command, waitForResponse = true, timeout = 15000): Promise<string | null> {
    return await this.useTransport({
      blocking: true,
      fn: async (transport, release) => {
        let commandString = `CMND ${command.type} ${command.topic}`;
        if (command.payload) {
          commandString += ` ${command.payload}`;
        }

        commandString += '\n';

        const commandBuffer = new TextEncoder().encode(commandString);
        await transport.write(commandBuffer);

        if (!waitForResponse) {
          return null;
        }

        // release();

        let continueReading = true;
        let buffer = '';

        const timeoutId = setTimeout(() => {
          continueReading = false;
        }, timeout);

        const readLoop = transport.rawRead();
        while (continueReading) {
          const { value, done } = await readLoop.next();
          if (done || !value) {
            break;
          }

          // Convert Uint8Array to string and add to buffer
          const chunk = new TextDecoder().decode(value);
          buffer += chunk;

          // Process complete lines
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // Keep incomplete line in buffer

          for (const line of lines) {
            const trimmedLine = line.trim();
            if (!trimmedLine) continue;

            // Check if line matches expected RESP format: RESP <topic> <payload>
            const respMatch = trimmedLine.match(/^RESP\s+(\S+)\s+(.+)$/);
            if (!respMatch) {
              continue;
            }

            const [, responseTopic, payload] = respMatch;

            // Check if the response topic matches our command topic
            if (responseTopic !== command.topic) {
              continue;
            }

            clearTimeout(timeoutId);
            continueReading = false;
            return payload;
          }
        }

        clearTimeout(timeoutId);
        return null;
      },
    });
  }
}
