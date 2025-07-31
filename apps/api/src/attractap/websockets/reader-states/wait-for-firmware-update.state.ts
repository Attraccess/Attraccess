import { AuthenticatedWebSocket, AttractapEvent, AttractapEventType } from '../websocket.types';
import { ReaderState } from './reader-state.interface';
import { GatewayServices } from '../websocket.gateway';
import { Logger } from '@nestjs/common';

export class WaitForFirmwareUpdateState implements ReaderState {
  private readonly logger = new Logger(WaitForFirmwareUpdateState.name);
  private chunks: Buffer[] = [];
  private firmwareSize = 0;

  public constructor(private readonly socket: AuthenticatedWebSocket, private readonly services: GatewayServices) {}

  public async onStateEnter(): Promise<void> {
    const firmwareDefinition = this.services.firmwareService.getFirmwareDefinition(
      this.socket.reader.firmware.name,
      this.socket.reader.firmware.variant
    );

    await this.loadFirmware(firmwareDefinition.name, firmwareDefinition.variant, firmwareDefinition.filenameFlashz);

    this.socket.sendMessage(
      new AttractapEvent(AttractapEventType.READER_FIRMWARE_UPDATE_REQUIRED, {
        current: this.socket.reader.firmware,
        available: this.services.firmwareService.getFirmwareDefinition(
          this.socket.reader.firmware.name,
          this.socket.reader.firmware.variant
        ),
        firmware: {
          chunks: this.chunks.length,
          totalSize: this.firmwareSize,
        },
      })
    );
  }

  public async onStateExit(): Promise<void> {
    // nothing to do here
  }

  public async onEvent(eventData: AttractapEvent['data']) {
    if (eventData.type === AttractapEventType.READER_FIRMWARE_STREAM_CHUNK) {
      return this.onStreamChunk(eventData);
    }

    return undefined;
  }

  private async loadFirmware(firmwareName: string, variantName: string, filename: string): Promise<void> {
    this.chunks = [];

    this.firmwareSize = await this.services.firmwareService.getFirmwareBinarySize(firmwareName, variantName, filename);
    const currentStream = this.services.firmwareService.getFirmwareStream(firmwareName, variantName, filename);

    currentStream.on('data', (chunk: Buffer) => {
      this.chunks.push(chunk);
    });

    await new Promise<void>((resolve) => {
      currentStream.on('end', () => {
        resolve();
      });

      currentStream.on('error', (error) => {
        this.logger.error(`Firmware stream error for reader ${this.socket.reader.id}:`, error);
        resolve();
      });
    });
  }

  private async onStreamChunk(eventData: AttractapEvent['data']): Promise<void> {
    const chunkIndexRaw = eventData.payload.chunkIndex;
    const chunkIndex = Number(chunkIndexRaw);
    if (chunkIndexRaw === undefined || isNaN(chunkIndex)) {
      this.logger.error(`Chunk index is required for firmware update`);
      return;
    }

    if (chunkIndex >= this.chunks.length) {
      this.logger.error(`Chunk index is out of bounds for firmware update`);
      return;
    }

    const chunk = this.chunks[chunkIndex];
    this.socket.sendBinaryData(chunk);
  }

  public async onResponse() {
    return undefined;
  }
}
