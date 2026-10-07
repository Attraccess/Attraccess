import { Injectable, Logger } from '@nestjs/common';
import { createReadStream, existsSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { AttractapFirmware } from './dtos/firmware.dto';
import { FirmwareDownloadImplementation } from './firmware-download';
import { FirmwareSymbolEntry } from './firmware.service.route-context';

@Injectable()
export class AttractapFirmwareService extends FirmwareDownloadImplementation {
  protected readonly firmwareAssetsDirectory: string;
  protected readonly firmwareSymbolDirectory: string;
  protected readonly logger = new Logger(AttractapFirmwareService.name);

  protected firmwares: AttractapFirmware[] = [];
  protected symbolFirmwares: FirmwareSymbolEntry[] = [];

  public constructor() {
    super();
    this.firmwareAssetsDirectory = join(__dirname, 'assets', 'attractap-firmwares');
    this.firmwareSymbolDirectory = join(
      process.env.STORAGE_ROOT || join(process.cwd(), 'storage'),
      'attractap-firmware-symbols',
    );
    this.logger.debug(`Firmware assets directory: ${this.firmwareAssetsDirectory}`);

    // read firmwares.json from assets/attractap-firmwares
    const firmwaresPath = join(this.firmwareAssetsDirectory, 'firmwares.json');

    if (existsSync(firmwaresPath)) {
      this.logger.debug(`Loading firmwares from: ${firmwaresPath}`);
      const firmwares = readFileSync(firmwaresPath, 'utf8');
      this.firmwares = JSON.parse(firmwares).firmwares;
    } else {
      this.logger.error(`Firmwares file does not exist: ${firmwaresPath}`);
    }

    this.symbolFirmwares = this.buildBundledSymbolIndex();
    this.archiveBundledSymbols();
    this.loadArchivedSymbols();

    this.logger.debug(`Loaded ${this.firmwares.length} firmware definitions`);
  }

  public async getFirmwares(): Promise<AttractapFirmware[]> {
    this.logger.debug(`Returning ${this.firmwares.length} firmwares`);
    return this.firmwares;
  }

  public getFirmwareDefinition(firmwareName: string, variantName: string): AttractapFirmware {
    const firmware = this.firmwares.find(
      (firmware) => firmware.name === firmwareName && firmware.variant === variantName,
    );

    if (!firmware) {
      this.logger.debug(`Firmware definition not found for: ${firmwareName}, variant: ${variantName}`);
    }

    return firmware;
  }

  public getFirmwareBinaryStream(firmwareName: string, variantName: string): NodeJS.ReadableStream {
    this.logger.debug(`Getting firmware binary stream for: ${firmwareName}, variant: ${variantName}`);

    const firmwareDefinition = this.getFirmwareDefinition(firmwareName, variantName);
    if (!firmwareDefinition) {
      this.logger.error(`Firmware definition not found for: ${firmwareName}, variant: ${variantName}`);
      throw new Error('Firmware definition not found');
    }

    const firmwarePath = join(this.firmwareAssetsDirectory, firmwareDefinition.filename);
    this.logger.debug(`Checking firmware binary path: ${firmwarePath}`);

    if (!existsSync(firmwarePath)) {
      this.logger.error(`Firmware binary file does not exist: ${firmwarePath}`);
      throw new Error('Firmware binary not found');
    }

    this.logger.debug(`Creating read stream for firmware binary: ${firmwarePath}`);
    // Use smaller buffer size for ESP32 compatibility
    // ESP32 WebSocket client works better with smaller chunks
    return createReadStream(firmwarePath, {
      highWaterMark: 1024, // 1KB chunks for ESP32 compatibility
    });
  }

  public getFirmwareBinarySize(firmwareName: string, variantName: string): number {
    this.logger.debug(`Getting firmware binary size for: ${firmwareName}, variant: ${variantName}`);

    const firmwareDefinition = this.getFirmwareDefinition(firmwareName, variantName);
    if (!firmwareDefinition) {
      this.logger.error(`Firmware definition not found for: ${firmwareName}, variant: ${variantName}`);
      throw new Error('Firmware definition not found');
    }

    const firmwarePath = join(this.firmwareAssetsDirectory, firmwareDefinition.filename);

    if (!existsSync(firmwarePath)) {
      this.logger.error(`Firmware binary file does not exist: ${firmwarePath}`);
      throw new Error('Firmware binary not found');
    }

    const stats = statSync(firmwarePath);
    this.logger.debug(`Firmware binary size: ${stats.size} bytes`);
    return stats.size;
  }

  public getFirmwareByBuildId(buildId: string): AttractapFirmware | undefined {
    const normalized = buildId.trim().toLowerCase();
    if (!normalized) {
      return undefined;
    }
    return this.symbolFirmwares.find(({ firmware }) => {
      const candidate = firmware.buildId?.toLowerCase();
      return !!candidate && (candidate.startsWith(normalized) || normalized.startsWith(candidate));
    })?.firmware;
  }

  public resolveElfFile(options: {
    buildId?: string | null;
    variant?: string | null;
  }): { path: string; firmware: AttractapFirmware } | null {
    let entry: FirmwareSymbolEntry | undefined;

    if (options.buildId) {
      entry = this.getSymbolEntryByBuildId(options.buildId);
    }

    if (!entry && options.variant) {
      const firmware = this.firmwares.find((entry) => entry.variant === options.variant && !!entry.elfFilename);
      entry = firmware ? (this.buildBundledSymbolEntry(firmware) ?? undefined) : undefined;
    }

    if (!entry || !entry.firmware.elfFilename) {
      this.logger.debug(`No ELF resolved for buildId=${options.buildId ?? 'n/a'}, variant=${options.variant ?? 'n/a'}`);
      return null;
    }

    if (!existsSync(entry.elfPath)) {
      this.logger.error(`ELF file does not exist: ${entry.elfPath}`);
      return null;
    }

    return { path: entry.elfPath, firmware: entry.firmware };
  }

  public hasSymbolForBuildId(buildId?: string | null): boolean {
    return !!buildId && !!this.getSymbolEntryByBuildId(buildId);
  }

  protected getSymbolEntryByBuildId(buildId: string): FirmwareSymbolEntry | undefined {
    const normalized = buildId.trim().toLowerCase();
    if (!normalized) {
      return undefined;
    }
    return this.symbolFirmwares.find(({ firmware }) => {
      const candidate = firmware.buildId?.toLowerCase();
      return !!candidate && (candidate.startsWith(normalized) || normalized.startsWith(candidate));
    });
  }

  // WebSocket firmware update methods - use OTA-specific firmware
}
