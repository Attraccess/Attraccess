import { Transport, ESPLoader, IEspLoaderTerminal } from 'esptool-js';

export enum ESPToolsErrorType {
  NO_PORT_SELECTED = 'NO_PORT_SELECTED',
  CONNECTION_FAILED = 'CONNECTION_FAILED',
  PORT_OPEN_FAILED = 'PORT_OPEN_FAILED',
  FLASH_FAILED = 'FLASH_FAILED',
  DEVICE_NOT_FOUND = 'DEVICE_NOT_FOUND',
  FIRMWARE_READ_FAILED = 'FIRMWARE_READ_FAILED',
  RESET_FAILED = 'RESET_FAILED',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}

export interface ESPToolsResult<T = unknown> {
  success: boolean;
  error: { type: ESPToolsErrorType; details?: unknown } | null;
  data: T | null;
}

export class ESPTools {
  private static _instance: ESPTools;

  private constructor() {
    // Private constructor to prevent instantiation
  }

  public static getInstance(): ESPTools {
    if (!ESPTools._instance) {
      ESPTools._instance = new ESPTools();
    }
    return ESPTools._instance;
  }

  public async connectToDevice(): Promise<ESPToolsResult<SerialPort>> {
    let port: SerialPort;

    try {
      // Request port from user
      port = await navigator.serial.requestPort();
    } catch (err) {
      const error = err as Error;
      if (error.name === 'NotFoundError') {
        return {
          success: false,
          error: { type: ESPToolsErrorType.NO_PORT_SELECTED, details: error.message },
          data: null
        };
      }
      return {
        success: false,
        error: { type: ESPToolsErrorType.CONNECTION_FAILED, details: error.message },
        data: null
      };
    }

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
        data: null
      };
    }

    return {
      success: true,
      error: null,
      data: port
    };
  }

  public async flashFirmware(options: {
    port: SerialPort;
    firmware: Blob;
    terminal?: IEspLoaderTerminal;
    onProgress?: (progressPct: number) => unknown;
  }): Promise<ESPToolsResult<void>> {
    const { port, firmware, terminal, onProgress } = options;

    try {
      await port.close();

      const transport = new Transport(port);
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
          data: null
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
        await this.hardReset(transport.device);
      } catch (err) {
        return {
          success: false,
          error: { type: ESPToolsErrorType.RESET_FAILED, details: err },
          data: null
        };
      }

      return {
        success: true,
        error: null,
        data: undefined
      };

    } catch (err) {
      const error = err as Error;
      return {
        success: false,
        error: { type: ESPToolsErrorType.FLASH_FAILED, details: error.message },
        data: null
      };
    }
  }

  public async hardReset(port: SerialPort): Promise<void> {
    console.log('Resetting device...');

    await port.setSignals({
      dataTerminalReady: false,
      requestToSend: true,
      dataCarrierDetect: false,
      clearToSend: false,
      ringIndicator: false,
      dataSetReady: false,
    });

    await new Promise((resolve) => setTimeout(resolve, 250));

    await port.setSignals({
      dataTerminalReady: false,
      requestToSend: false,
      dataCarrierDetect: false,
      clearToSend: false,
      ringIndicator: false,
      dataSetReady: false,
    });

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  public async getSerialOutput(port: SerialPort, baudRate: number, onWrite: (data: Uint8Array) => unknown) {
    await port.close();
    const transport = new Transport(port, true);
    await transport.connect(baudRate);

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
      transport.disconnect();
    };
  }
}
