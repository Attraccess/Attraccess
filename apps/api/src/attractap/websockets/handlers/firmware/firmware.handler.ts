import { Inject, Injectable, Logger } from '@nestjs/common';
import { existsSync, statSync, openSync, readSync } from 'fs';
import { join } from 'path';
import { AttractapService } from '../../../attractap.service';
import { AttractapFirmwareService } from '../../../firmware.service';
import { MetricsService } from '../../../../metrics/metrics.service';
import { AttractapFirmware } from '../../../dtos/firmware.dto';
import { validateReaderUiCapabilities } from '../../../../resources/forms/reader-ui.validation';
import { parseReportedBuild } from '../../../security/session-security-state';
import { AttractapUiHandler } from '../ui/ui.handler';
import { ConversionTransferService } from '../../../secure-conversion/conversion-transfer.service';
import { SecuredReaderUpdates } from '../../../secure-conversion/secured-reader-updates';
import { parseBleCapability } from '../ble/ble-wire';
import { AuthenticatedWebSocket, AttractapEvent, AttractapEventType } from '../../websocket.types';

@Injectable()
export class AttractapFirmwareHandler {
  private readonly logger = new Logger(AttractapFirmwareHandler.name);

  @Inject(AttractapService)
  private attractapService: AttractapService;

  @Inject(AttractapFirmwareService)
  private firmwareService: AttractapFirmwareService;

  @Inject(MetricsService)
  private metricsService: MetricsService;

  @Inject(AttractapUiHandler)
  private uiHandler: AttractapUiHandler;

  @Inject(ConversionTransferService)
  private conversionTransfer: ConversionTransferService;

  @Inject(SecuredReaderUpdates)
  private securedUpdates: SecuredReaderUpdates;

  public async handleFirmwareChunkRequest(socket: AuthenticatedWebSocket, data: AttractapEvent['data']) {
    // "Secure this reader" (ATT-1208) streams its signed images through the same request, marked `conversion`.
    if (data.payload?.conversion !== undefined) {
      if (!socket.sessionSecurity) return;
      const chunk = await this.conversionTransfer.chunk(socket.sessionSecurity, data.payload).catch((error: Error) => {
        this.logger.warn(`Conversion chunk failed: ${error.message}`);
        return null;
      });
      if (chunk && chunk.length > 0) socket.sendBinaryData(chunk);
      return;
    }
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

      // A chunk answer carries no offset: the reader writes whatever arrives next. On one connection it never
      // needs the same bytes twice (after a lost answer it reconnects), so a repeated request is a duplicate,
      // and answering it too would corrupt the image.
      if (offset < (socket.state.ota.servedUntil ?? 0)) {
        this.logger.warn(`Ignoring repeated chunk request from client ${socket.id}: offset=${offset}`);
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
        socket.state.ota.servedUntil = offset + bytesRead;
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
    // Only readers that relay card APDUs (firmware 2.0.0+) get card functions. Set before the
    // database write so a card tapped right after connecting is not refused.
    socket.state.cardRelay = data.payload?.capabilities?.cardRelay === true;
    socket.state.sessionDuration = data.payload?.capabilities?.sessionDuration === true;
    // Firmware before 2.10.0 does not report nfc; only the BLE Bridge reports false.
    socket.state.nfc = data.payload?.capabilities?.nfc !== false;
    // Image form fields (ATT-879): only firmware that announces it can render the QR code of the phone handoff.
    socket.state.formImages = data.payload?.capabilities?.formImages === true;
    // Plugin BLE (protocol v1): older or incompatible firmware makes plugins see READER_UNSUPPORTED.
    socket.state.ble = parseBleCapability(data.payload?.capabilities?.ble);
    // The eFuse report on the control channel waits for the build: hand it over before the database writes,
    // so a slow write cannot run it into its wait limit.
    const build = parseReportedBuild(data.payload);
    if (socket.sessionSecurity) {
      socket.sessionSecurity.secureConversion = data.payload?.capabilities?.secureConversion === true;
      socket.sessionSecurity.conversionStopBeforeBurn = data.payload?.capabilities?.conversionStopBeforeBurn === true;
      socket.sessionSecurity.firmware = reportedFirmware(data.payload);
    }
    socket.sessionSecurity?.setBuild(build);
    await this.attractapService.recordReaderBuild(socket.readerId, build);
    await this.attractapService.updateReaderFirmware(socket.readerId, this.withValidatedUi(data.payload));
    // Initial full slot sync and crash-loop protection, in the background: it must not stop or delay the OTA check.
    void this.uiHandler.onFirmwareInfo(socket, data.payload).catch((error) => {
      this.logger.warn(`Reader UI sync after firmware info failed: ${(error as Error).message}`);
    });

    if (await this.isFirmwareLatest(data.payload)) return;
    // A reader on the secure profile only ever gets an image signed for its digests (never the plain image).
    if (build.profile === 'secure') await this.offerSecuredUpdate(socket, data.payload, build.secureVersion);
    else await this.offerFirmwareUpdate(socket, data.payload);
  }

  /** Signed secure app for a secured reader; nothing when no held key matches its digests (shown in the UI). */
  private async offerSecuredUpdate(
    socket: AuthenticatedWebSocket,
    current: AttractapFirmware,
    reportedSecureVersion: number | null,
  ): Promise<boolean> {
    if (socket.readerId === null) return false;
    const offer = await this.securedUpdates.prepare(
      socket.readerId,
      current.name,
      current.variant,
      reportedSecureVersion,
    );
    if (!offer) return false;
    socket.state.ota = { path: offer.image.path, size: offer.image.size } as AuthenticatedWebSocket['state']['ota'];
    await socket.sendMessage(
      new AttractapEvent(AttractapEventType.READER_FIRMWARE_UPDATE_REQUIRED, {
        available: {
          name: current.name,
          variant: current.variant,
          version: offer.version,
          totalSize: offer.image.size,
        },
      }),
    );
    this.metricsService.attractapFirmwareUpdatesTotal.inc({ reader_id: String(socket.readerId) });
    return true;
  }

  /**
   * Offers the latest image to an old reader on the update-only token connection (LegacyFirmwareUpdateService).
   * False when there is none: unknown firmware or variant, already the latest, or the image is missing.
   */
  public async offerLegacyUpdate(socket: AuthenticatedWebSocket, current: AttractapFirmware): Promise<boolean> {
    if (await this.isFirmwareLatest(current)) return false;
    return this.offerFirmwareUpdate(socket, current);
  }

  /** Sends READER_FIRMWARE_UPDATE_REQUIRED; false when no update can be offered. */
  private async offerFirmwareUpdate(socket: AuthenticatedWebSocket, current: AttractapFirmware): Promise<boolean> {
    this.logger.debug('Firmware is not up to date, notifying client to start OTA');
    try {
      const latest = await this.firmwareService.getFirmwareDefinition(current.name, current.variant);
      if (!latest) {
        this.logger.warn(
          `No firmware definition found for ${current.name}/${current.variant}; treating as up-to-date for now.`,
        );
        return false;
      }

      const assetsDir = process.env.ATTRACTAP_FIRMWARE_ASSETS_DIR || join(__dirname, 'assets', 'attractap-firmwares');
      const otaFilename = latest.filenameOTA || latest.filename;
      const firmwarePath = join(assetsDir, otaFilename);
      if (!existsSync(firmwarePath)) {
        this.logger.error(`OTA firmware binary not found at ${firmwarePath}`);
        return false;
      }
      const size = statSync(firmwarePath).size;
      if (!size || size < 1024) {
        this.logger.error(`OTA firmware size is suspicious (${size} bytes) for ${otaFilename}`);
        return false;
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
      return true;
    } catch (err) {
      this.logger.error(`Failed to prepare firmware update notice: ${(err as Error).message}`);
      return false;
    }
  }

  /** Capabilities are reader-supplied: store `ui` only when it validates (missing means schemaVersion 0). */
  private withValidatedUi(payload: AttractapEvent['data']['payload']) {
    const capabilities = payload?.capabilities;
    if (!capabilities) return payload;
    const rawUi = capabilities.ui;
    const ui = validateReaderUiCapabilities(rawUi);
    if (rawUi !== undefined && rawUi !== null && ui === null) {
      this.logger.warn('Ignoring invalid capabilities.ui from reader firmware info');
    }
    const resetReason = typeof payload.resetReason === 'string' ? payload.resetReason.slice(0, 32) : null;
    return { ...payload, capabilities: { ...capabilities, nfc: capabilities.nfc !== false, ui, resetReason } };
  }

  private async isFirmwareLatest(firmware: AttractapFirmware): Promise<boolean> {
    const firmwareDefinition = await this.firmwareService.getFirmwareDefinition(firmware.name, firmware.variant);

    if (!firmwareDefinition) {
      return true;
    }

    return String(firmwareDefinition.version) === String(firmware.version);
  }
}

/** Name, variant and version as the reader reported them; null when any is missing. */
function reportedFirmware(payload: AttractapEvent['data']['payload']) {
  const pick = (value: unknown) => (typeof value === 'string' && value.length > 0 ? value.slice(0, 64) : null);
  const name = pick(payload?.name);
  const variant = pick(payload?.variant);
  const version = pick(payload?.version);
  return name && variant && version ? { name, variant, version } : null;
}
