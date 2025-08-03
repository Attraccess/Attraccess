import { AuthenticatedWebSocket, AttractapEvent, AttractapEventType } from '../websocket.types';
import { ReaderState } from './reader-state.interface';
import { GatewayServices } from '../websocket.gateway';
import { Logger } from '@nestjs/common';
import { AttractapFirmware } from '../../dtos/firmware.dto';

export class WaitForFirmwareUpdateState implements ReaderState {
  private firmwareDefinition: AttractapFirmware;
  private readonly logger = new Logger(WaitForFirmwareUpdateState.name);
  private static readonly chunks: Map<string, Buffer[]> = new Map();
  private firmwareSize = 0;

  public constructor(private readonly socket: AuthenticatedWebSocket, private readonly services: GatewayServices) {}

  public async onStateEnter(): Promise<void> {
    this.firmwareDefinition = this.services.firmwareService.getFirmwareDefinition(
      this.socket.reader.firmware.name,
      this.socket.reader.firmware.variant
    );

    const chunks = await this.loadFirmware();

    this.socket.sendMessage(
      new AttractapEvent(AttractapEventType.READER_FIRMWARE_UPDATE_REQUIRED, {
        current: this.socket.reader.firmware,
        available: this.services.firmwareService.getFirmwareDefinition(
          this.socket.reader.firmware.name,
          this.socket.reader.firmware.variant
        ),
        firmware: {
          chunks: chunks.length,
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

  private async loadFirmware(): Promise<Buffer[]> {
    if (
      WaitForFirmwareUpdateState.chunks.has(
        JSON.stringify({
          name: this.firmwareDefinition.name,
          variant: this.firmwareDefinition.variant,
        })
      )
    ) {
      return WaitForFirmwareUpdateState.chunks.get(
        JSON.stringify({
          name: this.firmwareDefinition.name,
          variant: this.firmwareDefinition.variant,
        })
      );
    }

    const chunks: Buffer[] = [];

    this.logger.debug(`Loading firmware: ${this.firmwareDefinition.name}, variant: ${this.firmwareDefinition.variant}`);
    this.firmwareSize = await this.services.firmwareService.getFirmwareBinarySize(
      this.firmwareDefinition.name,
      this.firmwareDefinition.variant
    );
    this.logger.debug(`Firmware size: ${this.firmwareSize} bytes`);

    const currentStream = this.services.firmwareService.getFirmwareStream(
      this.firmwareDefinition.name,
      this.firmwareDefinition.variant
    );

    let totalBytesLoaded = 0;
    currentStream.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
      totalBytesLoaded += chunk.length;

      // Log first chunk's first few bytes to verify it's valid ESP32 firmware
      if (chunks.length === 1) {
        const firstBytes = chunk.slice(0, 16);
        this.logger.debug(`First chunk loaded - size: ${chunk.length}, first bytes: ${firstBytes.toString('hex')}`);
        this.logger.debug(`Expected ESP32 magic byte: 0xE9, actual first byte: 0x${chunk[0].toString(16)}`);
      }
    });

    await new Promise<void>((resolve) => {
      currentStream.on('end', () => {
        this.logger.debug(
          `Firmware loading complete - Total chunks: ${chunks.length}, Total bytes: ${totalBytesLoaded}`
        );
        resolve();
      });

      currentStream.on('error', (error) => {
        this.logger.error(`Firmware stream error for reader ${this.socket.reader.id}:`, error);
        resolve();
      });
    });

    WaitForFirmwareUpdateState.chunks.set(
      JSON.stringify({
        name: this.firmwareDefinition.name,
        variant: this.firmwareDefinition.variant,
      }),
      chunks
    );

    return chunks;
  }

  private async onStreamChunk(eventData: AttractapEvent['data']): Promise<void> {
    const chunkIndexRaw = eventData.payload.chunkIndex;
    const chunkIndex = Number(chunkIndexRaw);
    if (chunkIndexRaw === undefined || isNaN(chunkIndex)) {
      this.logger.error(`Chunk index is required for firmware update`);
      return;
    }

    const chunks = await this.loadFirmware();

    if (chunkIndex >= chunks.length) {
      this.logger.error(`Chunk index is out of bounds for firmware update`);
      return;
    }

    const chunk = chunks[chunkIndex];
    this.logger.verbose(`Sending chunk ${chunkIndex}/${chunks.length - 1} - size: ${chunk.length} bytes`);

    // Log first few bytes of first chunk to verify what's being sent
    if (chunkIndex === 0) {
      const firstBytes = chunk.slice(0, 16);
      this.logger.debug(`First chunk being sent - first bytes: ${firstBytes.toString('hex')}`);
      this.logger.debug(`First byte: 0x${chunk[0].toString(16)} (expected ESP32 magic: 0xE9)`);
    }

    this.socket.sendBinaryData(chunk);
  }

  public async onResponse() {
    return undefined;
  }
}
