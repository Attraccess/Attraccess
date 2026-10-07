import { createReadStream, existsSync, statSync } from 'fs';
import { join } from 'path';
import { FirmwareSymbolArchiveImplementation } from './firmware-symbol-archive';
export abstract class FirmwareDownloadImplementation extends FirmwareSymbolArchiveImplementation {
  public getFirmwareDownloadUrl(firmwareName: string, variantName: string): string {
    // Return path only; devices will prepend their configured host/scheme/port
    const path = `/api/attractap/firmwares/${firmwareName}/variants/${variantName}`;
    this.logger.debug(`Generated firmware download path: ${path}`);
    return path;
  }

  /**
   * Get OTA file info (stream, size, filename) preferring OTA-specific file when available
   */
  public getOtaFile(
    firmwareName: string,
    variantName: string,
  ): { stream: NodeJS.ReadableStream; size: number; filename: string } {
    const firmwareDefinition = this.getFirmwareDefinition(firmwareName, variantName);
    if (!firmwareDefinition) {
      this.logger.error(`Firmware definition not found for: ${firmwareName}, variant: ${variantName}`);
      throw new Error('Firmware definition not found');
    }

    const otaFilename = firmwareDefinition.filenameOTA || firmwareDefinition.filename;
    const firmwarePath = join(this.firmwareAssetsDirectory, otaFilename);

    if (!existsSync(firmwarePath)) {
      this.logger.error(`OTA firmware binary file does not exist: ${firmwarePath}`);
      throw new Error('OTA firmware binary not found');
    }

    const stats = statSync(firmwarePath);
    const stream = createReadStream(firmwarePath, { highWaterMark: 1024 });

    return { stream, size: stats.size, filename: otaFilename };
  }

  // WebSocket firmware update methods - use OTA-specific firmware
  public getFirmwareStream(firmwareName: string, variantName: string): NodeJS.ReadableStream {
    this.logger.debug(`Getting firmware stream for OTA: ${firmwareName}, variant: ${variantName}`);

    const firmwareDefinition = this.getFirmwareDefinition(firmwareName, variantName);
    if (!firmwareDefinition) {
      this.logger.error(`Firmware definition not found for: ${firmwareName}, variant: ${variantName}`);
      throw new Error('Firmware definition not found');
    }

    // Use OTA-specific firmware file if available, otherwise fall back to main firmware
    const otaFilename = firmwareDefinition.filenameOTA || firmwareDefinition.filename;
    const firmwarePath = join(this.firmwareAssetsDirectory, otaFilename);

    this.logger.debug(`Using firmware file for OTA: ${otaFilename}`);
    this.logger.debug(`Checking OTA firmware path: ${firmwarePath}`);

    if (!existsSync(firmwarePath)) {
      this.logger.error(`OTA firmware binary file does not exist: ${firmwarePath}`);
      throw new Error('OTA firmware binary not found');
    }

    this.logger.debug(`Creating read stream for OTA firmware: ${firmwarePath}`);
    return createReadStream(firmwarePath, {
      highWaterMark: 1024, // 1KB chunks for ESP32 compatibility
    });
  }

  public getFirmwareStats(firmwareName: string, variantName: string): { size: number } {
    this.logger.debug(`Getting firmware stats for OTA: ${firmwareName}, variant: ${variantName}`);

    const firmwareDefinition = this.getFirmwareDefinition(firmwareName, variantName);
    if (!firmwareDefinition) {
      this.logger.error(`Firmware definition not found for: ${firmwareName}, variant: ${variantName}`);
      throw new Error('Firmware definition not found');
    }

    // Use OTA-specific firmware file if available, otherwise fall back to main firmware
    const otaFilename = firmwareDefinition.filenameOTA || firmwareDefinition.filename;
    const firmwarePath = join(this.firmwareAssetsDirectory, otaFilename);

    if (!existsSync(firmwarePath)) {
      this.logger.error(`OTA firmware binary file does not exist: ${firmwarePath}`);
      throw new Error('OTA firmware binary not found');
    }

    const stats = statSync(firmwarePath);
    this.logger.debug(`OTA firmware size: ${stats.size} bytes (file: ${otaFilename})`);
    return { size: stats.size };
  }
}
