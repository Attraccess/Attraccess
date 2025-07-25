import { Transport, ESPLoader, IEspLoaderTerminal } from 'esptool-js';

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

export class ESPTools {
  private static _instance: ESPTools;
  private _transport: Transport | null = null;
  private _transportIsInUse = false;

  public get isConnected(): boolean {
    return !!this._transport;
  }

  public get isTransportInUse(): boolean {
    return this._transportIsInUse;
  }

  private async useTransport<TResult = unknown>(fn: (transport: Transport) => Promise<TResult>): Promise<TResult> {
    while (this.isTransportInUse) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    if (!this._transport) {
      throw new Error('No transport available');
    }

    this._transportIsInUse = true;

    try {
      return await fn(this._transport);
    } finally {
      this._transportIsInUse = false;
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

    console.log('calling useTransport');
    return await this.useTransport(async (transport) => {
      try {
        console.log('calling esploader');
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

        let firmwareDataString: string;
        try {
          firmwareDataString = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = () => reject(reader.error);
            reader.readAsBinaryString(firmware);
          });
        } catch (err) {
          return {
            success: false,
            error: { type: ESPToolsErrorType.FIRMWARE_READ_FAILED, details: err },
            data: null,
          };
        }

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

        try {
          await this._hardReset(transport);
        } catch (err) {
          return {
            success: false,
            error: { type: ESPToolsErrorType.RESET_FAILED, details: err },
            data: null,
          };
        }

        return {
          success: true,
          error: null,
          data: undefined,
        };
      } catch (err) {
        const error = err as Error;
        return {
          success: false,
          error: { type: ESPToolsErrorType.FLASH_FAILED, details: error.message },
          data: null,
        };
      }
    });
  }

  private async _hardReset(transport: Transport): Promise<void> {
    console.log('Resetting device...');

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
    return await this.useTransport(async (transport) => {
      await this._hardReset(transport);
    });
  }

  public async getSerialOutput(onWrite: (data: Uint8Array) => unknown) {
    return await this.useTransport(async (transport) => {
      let isConsoleClosed = false;

      setTimeout(async () => {
        while (!isConsoleClosed) {
          const readLoop = transport.rawRead();
          const { value, done } = await readLoop.next();

          if (done || !value) {
            break;
          }
          onWrite(value);
        }
      }, 1);

      return () => {
        isConsoleClosed = true;
      };
    });
  }

  public async sendCommand(command: Command, waitForResponse = true, timeout = 15000): Promise<string | null> {
    return await this.useTransport(async (transport) => {
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
    });
  }
}
