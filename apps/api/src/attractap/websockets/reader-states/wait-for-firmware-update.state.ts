import { AuthenticatedWebSocket, AttractapEvent, AttractapEventType } from '../websocket.types';
import { ReaderState } from './reader-state.interface';
import { GatewayServices } from '../websocket.gateway';

export class WaitForFirmwareUpdateState implements ReaderState {
  public constructor(private readonly socket: AuthenticatedWebSocket, private readonly services: GatewayServices) {}

  public async onStateEnter(): Promise<void> {
    const firmwareDefinition = this.services.firmwareService.getFirmwareDefinition(
      this.socket.reader.firmware.name,
      this.socket.reader.firmware.variant
    );

    this.socket.sendMessage(
      new AttractapEvent(AttractapEventType.FIRMWARE_UPDATE_REQUIRED, {
        current: this.socket.reader.firmware,
        available: this.services.firmwareService.getFirmwareDefinition(
          this.socket.reader.firmware.name,
          this.socket.reader.firmware.variant
        ),
        firmware: {
          aio: this.services.firmwareService.getFirmwareDownloadUrl(
            firmwareDefinition.name,
            firmwareDefinition.variant,
            firmwareDefinition.filename
          ),
          flashz: this.services.firmwareService.getFirmwareDownloadUrl(
            firmwareDefinition.name,
            firmwareDefinition.variant,
            firmwareDefinition.filenameFlashz
          ),
        },
      })
    );
  }

  public async onStateExit(): Promise<void> {
    // nothing to do here
  }

  public async onEvent() {
    return undefined;
  }

  public async onResponse() {
    return undefined;
  }
}
