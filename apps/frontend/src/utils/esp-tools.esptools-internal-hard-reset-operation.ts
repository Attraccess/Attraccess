import { Transport } from 'esptool-js';
import { ESPToolsFlashFirmwareOperation } from './esp-tools.esptools-flash-firmware-operation';

export abstract class ESPToolsInternalHardResetOperation extends ESPToolsFlashFirmwareOperation {
  protected async _hardReset(transport: Transport): Promise<void> {
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
}
