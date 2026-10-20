import { ReaderIdentityService } from '../../../security/reader-identity.service';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { existsSync, statSync, openSync, readSync, fstatSync, closeSync, constants } from 'fs';
import { join } from 'path';
import { AttractapService } from '../../../attractap.service';
import { AttractapFirmwareService } from '../../../firmware.service';
import { MetricsService } from '../../../../metrics/metrics.service';
import { AttractapFirmware } from '../../../dtos/firmware.dto';
import { AuthenticatedWebSocket, AttractapEvent, AttractapEventType } from '../../websocket.types';
import { protectedReaderConnection } from '../../reader-connection-transport';

@Injectable()
export class AttractapFirmwareHandler {
  private readonly contexts = new WeakMap<
    AuthenticatedWebSocket,
    {
      ota: NonNullable<AuthenticatedWebSocket['state']['ota']>;
      tokens: number;
      at: number;
      pending?: boolean;
    }
  >();
  private readonly logger = new Logger(AttractapFirmwareHandler.name);

  @Inject(ReaderIdentityService)
  private identities: ReaderIdentityService;

  private async eligible(socket: AuthenticatedWebSocket): Promise<boolean> {
    const readerId = socket.readerId;
    return (
      !!readerId &&
      (!!protectedReaderConnection(socket) || (await this.identities.isLegacy(readerId))) &&
      socket.readerId === readerId
    );
  }

  @Inject(AttractapService)
  private attractapService: AttractapService;

  @Inject(AttractapFirmwareService)
  private firmwareService: AttractapFirmwareService;

  @Inject(MetricsService)
  private metricsService: MetricsService;

  public async handleFirmwareChunkRequest(socket: AuthenticatedWebSocket, data: AttractapEvent['data']) {
    try {
      if (!(await this.eligible(socket))) return;
      if (!socket.state.ota || !socket.state.ota.path || !socket.state.ota.size) {
        this.logger.error(`FIRMWARE_REQUEST_CHUNK received but no OTA context set for client ${socket.id}`);
        return;
      }

      const { offset, length } = data?.payload ?? {};
      const total = socket.state.ota.size;
      if (
        !Number.isSafeInteger(offset) ||
        !Number.isSafeInteger(length) ||
        offset < 0 ||
        length <= 0 ||
        offset >= total
      ) {
        this.logger.error(`Invalid chunk request from client ${socket.id}: offset=${offset} length=${length}`);
        return;
      }

      const maxChunk = 4096; // hard cap chunk size
      const safeLen = Math.min(length, maxChunk, total - offset);
      const context = this.contexts.get(socket);
      if (!socket.readerId || !context || context.ota !== socket.state.ota) return;
      if (context.pending) {
        socket.close();
        return;
      }
      const refill = () => {
        const now = performance.now();
        context.tokens = Math.min(16, context.tokens + ((now - context.at) * 16) / 1000);
        context.at = now;
      };
      refill();
      if (context.tokens < 1) {
        // One paced response per socket. Extra concurrent requests are abuse;
        // sequential old firmware can download without reconnecting.
        context.pending = true;
        try {
          await new Promise((resolve) => setTimeout(resolve, Math.ceil(((1 - context.tokens) * 1000) / 16)));
          if (!(await this.eligible(socket)) || socket.state.ota !== context.ota) return;
          refill();
        } finally {
          context.pending = false;
        }
      }
      if (socket.bufferedAmount + safeLen > 32768) {
        socket.close();
        return;
      }
      context.tokens--;

      // Lazily open file descriptor
      if (socket.state.ota.fd === undefined) {
        try {
          const fd = openSync(socket.state.ota.path, constants.O_RDONLY | constants.O_NOFOLLOW);
          const info = fstatSync(fd);
          if (!info.isFile() || info.size !== total) {
            closeSync(fd);
            return;
          }
          socket.state.ota.fd = fd;
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
          this.logger.log(`Attractap firmware update progress: ${pctBucket}% (reader ${socket.readerId ?? 'unknown'})`);
        }
      }
    } catch (err) {
      this.logger.error(`handleFirmwareChunkRequest error: ${(err as Error).message}`);
    }
  }

  public async handleFirmwareInfo(socket: AuthenticatedWebSocket, data: AttractapEvent['data']) {
    if (!(await this.eligible(socket))) return;
    const readerId = socket.readerId;
    const updated = await this.attractapService.updateReaderFirmware(
      socket.readerId,
      data.payload,
      !protectedReaderConnection(socket),
    );
    if (updated === false) return;

    const firmwareIsUpToDate = await this.isFirmwareLatest(data.payload, !!protectedReaderConnection(socket));
    if (!firmwareIsUpToDate) {
      this.logger.debug('Firmware is not up to date, notifying client to start OTA');

      try {
        const current = data.payload as AttractapFirmware;
        const latest = await this.firmwareService.getFirmwareDefinition(
          current.name,
          current.variant,
          !!protectedReaderConnection(socket),
        );
        if (!latest) {
          this.logger.warn(
            `No firmware definition found for ${current.name}/${current.variant}; treating as up-to-date for now.`,
          );
          return;
        }

        const assetsDir = join(__dirname, 'assets', 'attractap-firmwares');
        const otaFilename = latest.filenameOTA || latest.filename;
        if (!/^[A-Za-z0-9_.-]+\.bin$/.test(otaFilename)) throw new Error('Invalid firmware filename');
        const firmwarePath = join(assetsDir, otaFilename);
        if (!existsSync(firmwarePath)) {
          this.logger.error(`OTA firmware binary not found at ${firmwarePath}`);
          return;
        }
        const size = statSync(firmwarePath).size;
        if (!Number.isSafeInteger(size) || size < 1024 || size > 0x640000) {
          this.logger.error(`OTA firmware size is suspicious (${size} bytes) for ${otaFilename}`);
          return;
        }

        if (!(await this.eligible(socket)) || socket.readerId !== readerId) return;
        // Store OTA context for this socket
        if (socket.state.ota?.fd !== undefined) closeSync(socket.state.ota.fd);
        socket.state.ota = { path: firmwarePath, size } as AuthenticatedWebSocket['state']['ota'];
        this.contexts.set(socket, { ota: socket.state.ota, tokens: 16, at: performance.now() });

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

  private async isFirmwareLatest(firmware: AttractapFirmware, secured: boolean): Promise<boolean> {
    const firmwareDefinition = await this.firmwareService.getFirmwareDefinition(
      firmware.name,
      firmware.variant,
      secured,
    );

    if (!firmwareDefinition) {
      return true;
    }

    return String(firmwareDefinition.version) === String(firmware.version);
  }
}
