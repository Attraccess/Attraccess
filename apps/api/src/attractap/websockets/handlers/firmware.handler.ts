import { Inject, Injectable, Logger } from '@nestjs/common';
import { existsSync, statSync, openSync, readSync } from 'fs';
import { join } from 'path';
import { AttractapService } from '../../attractap.service';
import { AttractapFirmwareService } from '../../firmware.service';
import { MetricsService } from '../../../metrics/metrics.service';
import { AttractapFirmware } from '../../dtos/firmware.dto';
import { AuthenticatedWebSocket, AttractapEvent, AttractapEventType } from '../websocket.types';

@Injectable()
export class AttractapFirmwareHandler {
  private readonly logger = new Logger(AttractapFirmwareHandler.name);

  @Inject(AttractapService)
  private attractapService: AttractapService;

  @Inject(AttractapFirmwareService)
  private firmwareService: AttractapFirmwareService;

  @Inject(MetricsService)
  private metricsService: MetricsService;

  public async handleFirmwareChunkRequest(socket: AuthenticatedWebSocket, data: AttractapEvent['data']) {
    try {
      if (!socket.state.ota || !socket.state.ota.path || !socket.state.ota.size) {
        this.logger.error(`FIRMWARE_REQUEST_CHUNK received but no OTA context set for client ${socket.id}`);
        return;
      }

      const { offset, length } = data.payload;
      const total = socket.state.ota.size;
      if (typeof offset !== 'number' || typeof length !== 'number' || offset < 0 || length <= 0 || offset >= total) {
        this.logger.error(`Invalid chunk request from client ${socket.id}: offset=${offset} length=${length}`);
        return;
      }

      const maxChunk = 4096; // hard cap chunk size
      const safeLen = Math.min(length, maxChunk, total - offset);

      // Lazily open file descriptor
      if (!socket.state.ota.fd) {
        try {
          socket.state.ota.fd = openSync(socket.state.ota.path, 'r');
        } catch (e) {
          this.logger.error(`Failed to open firmware for client ${socket.id}: ${(e as Error).message}`);
          return;
        }
      }

      const fd = socket.state.ota.fd as number;
      const buffer = Buffer.allocUnsafe(safeLen);
      let bytesRead = 0;
      try {
        bytesRead = readSync(fd, buffer, 0, safeLen, offset);
      } catch (e) {
        this.logger.error(`Failed to read firmware chunk for client ${socket.id}: ${(e as Error).message}`);
        return;
      }

      if (bytesRead > 0) {
        socket.sendBinaryData(buffer.subarray(0, bytesRead));
        const progressPct = Math.round(((offset + bytesRead) / total) * 100);
        const pctBucket = Math.floor(progressPct / 10) * 10;
        const lastLogged = socket.state.ota.lastLoggedPct ?? -1;
        if (pctBucket > lastLogged) {
          socket.state.ota.lastLoggedPct = pctBucket;
          this.logger.log(
            `Attractap firmware update progress: ${pctBucket}% (reader ${socket.readerId ?? 'unknown'})`,
          );
        }
      }
    } catch (err) {
      this.logger.error(`handleFirmwareChunkRequest error: ${(err as Error).message}`);
    }
  }

  public async handleFirmwareInfo(socket: AuthenticatedWebSocket, data: AttractapEvent['data']) {
    await this.attractapService.updateReaderFirmware(socket.readerId, data.payload);

    const firmwareIsUpToDate = await this.isFirmwareLatest(data.payload);
    if (!firmwareIsUpToDate) {
      this.logger.debug('Firmware is not up to date, notifying client to start OTA');

      try {
        const current = data.payload as AttractapFirmware;
        const latest = await this.firmwareService.getFirmwareDefinition(current.name, current.variant);
        if (!latest) {
          this.logger.warn(
            `No firmware definition found for ${current.name}/${current.variant}; treating as up-to-date for now.`,
          );
          return;
        }

        const assetsDir = join(__dirname, 'assets', 'attractap-firmwares');
        const otaFilename = latest.filenameOTA || latest.filename;
        const firmwarePath = join(assetsDir, otaFilename);
        if (!existsSync(firmwarePath)) {
          this.logger.error(`OTA firmware binary not found at ${firmwarePath}`);
          return;
        }
        const size = statSync(firmwarePath).size;
        if (!size || size < 1024) {
          this.logger.error(`OTA firmware size is suspicious (${size} bytes) for ${otaFilename}`);
          return;
        }

        // Store OTA context for this socket
        socket.state.ota = { path: firmwarePath, size } as AuthenticatedWebSocket['state']['ota'];

        await socket.sendMessage(
          new AttractapEvent(AttractapEventType.READER_FIRMWARE_UPDATE_REQUIRED, {
            available: {
              name: latest.name,
              variant: latest.variant,
              version: String(latest.version),
              totalSize: size,
            },
          }),
        );
        this.metricsService.attractapFirmwareUpdatesTotal.inc({ reader_id: String(socket.readerId) });
      } catch (err) {
        this.logger.error(`Failed to prepare firmware update notice: ${(err as Error).message}`);
      }
      return;
    }
  }

  private async isFirmwareLatest(firmware: AttractapFirmware): Promise<boolean> {
    const firmwareDefinition = await this.firmwareService.getFirmwareDefinition(firmware.name, firmware.variant);

    if (!firmwareDefinition) {
      return true;
    }

    return String(firmwareDefinition.version) === String(firmware.version);
  }
}
