import { Transport } from 'esptool-js';
import { ESPToolsErrorType } from './esp-tools.esptools-error-type';
import { ESPToolsResult } from './esp-tools.contracts';
import { ESPToolsUseTransportOperation } from './esp-tools.esptools-use-transport-operation';

export abstract class ESPToolsConnectToDeviceOperation extends ESPToolsUseTransportOperation {
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
}
