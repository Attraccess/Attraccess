import { ESPLoader, IEspLoaderTerminal, FlashModeValues, FlashFreqValues, FlashSizeValues } from 'esptool-js';
import { ESPToolsErrorType } from './esp-tools.esptools-error-type';
import { ESPToolsResult } from './esp-tools.contracts';
import { ESPToolsConnectToDeviceOperation } from './esp-tools.esptools-connect-to-device-operation';
export abstract class ESPToolsFlashFirmwareOperation extends ESPToolsConnectToDeviceOperation {
  public async flashFirmware(options: {
    firmware: Blob;
    terminal?: IEspLoaderTerminal;
    onProgress?: (progressPct: number) => unknown;
    flashMode?: FlashModeValues;
    flashFreq?: FlashFreqValues;
    flashSize?: FlashSizeValues;
  }): Promise<ESPToolsResult<void>> {
    const { firmware, terminal, onProgress, flashMode, flashFreq, flashSize } = options;

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

          const ERASE_FIRST = false;

          if (ERASE_FIRST) {
            await esploader.eraseFlash();
          }

          const totalSize = firmware.size;
          let totalWritten = 0;

          await esploader.writeFlash({
            fileArray: [{ data: firmwareData, address: 0 }],
            flashSize: flashSize ?? 'keep',
            flashMode: flashMode ?? 'dio',
            flashFreq: flashFreq ?? '80m',
            eraseAll: false,
            compress: true,
            reportProgress: (_fileIndex: number, written: number, total: number) => {
              const uncompressedWritten = (written / total) * firmwareData.length;
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
}
