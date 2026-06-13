import { Injectable, Logger } from '@nestjs/common';
import { AttractapFirmware } from './dtos/firmware.dto';
import { copyFileSync, createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { join } from 'path';

interface FirmwareSymbolEntry {
  firmware: AttractapFirmware;
  elfPath: string;
}

@Injectable()
export class AttractapFirmwareService {
  private readonly firmwareAssetsDirectory: string;
  private readonly firmwareSymbolDirectory: string;
  private readonly logger = new Logger(AttractapFirmwareService.name);

  private firmwares: AttractapFirmware[] = [];
  private symbolFirmwares: FirmwareSymbolEntry[] = [];

  public constructor() {
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

  private getSymbolEntryByBuildId(buildId: string): FirmwareSymbolEntry | undefined {
    const normalized = buildId.trim().toLowerCase();
    if (!normalized) {
      return undefined;
    }
    return this.symbolFirmwares.find(({ firmware }) => {
      const candidate = firmware.buildId?.toLowerCase();
      return !!candidate && (candidate.startsWith(normalized) || normalized.startsWith(candidate));
    });
  }

  private buildBundledSymbolIndex(): FirmwareSymbolEntry[] {
    return this.firmwares
      .map((firmware) => this.buildBundledSymbolEntry(firmware))
      .filter((entry): entry is FirmwareSymbolEntry => !!entry);
  }

  private buildBundledSymbolEntry(firmware: AttractapFirmware): FirmwareSymbolEntry | null {
    if (!firmware.elfFilename) {
      return null;
    }
    return {
      firmware,
      elfPath: join(this.firmwareAssetsDirectory, firmware.elfFilename),
    };
  }

  private archiveBundledSymbols(): void {
    const archiveEntries = this.readArchivedFirmwareEntries();
    let changed = false;

    for (const firmware of this.firmwares) {
      if (!firmware.buildId || !firmware.elfFilename) {
        continue;
      }

      const bundledElf = join(this.firmwareAssetsDirectory, firmware.elfFilename);
      if (!existsSync(bundledElf)) {
        continue;
      }

      mkdirSync(this.firmwareSymbolDirectory, { recursive: true });
      const archivedElfFilename = `${firmware.buildId.toLowerCase()}-${firmware.elfFilename}`;
      const archivedElfPath = join(this.firmwareSymbolDirectory, archivedElfFilename);
      if (!existsSync(archivedElfPath)) {
        copyFileSync(bundledElf, archivedElfPath);
      }

      if (!archiveEntries.some((entry) => entry.buildId?.toLowerCase() === firmware.buildId?.toLowerCase())) {
        archiveEntries.push({ ...firmware, elfFilename: archivedElfFilename });
        changed = true;
      }
    }

    if (changed) {
      writeFileSync(
        join(this.firmwareSymbolDirectory, 'firmwares.json'),
        JSON.stringify({ firmwares: archiveEntries }, null, 2),
      );
    }
  }

  private loadArchivedSymbols(): void {
    const archiveEntries = this.readArchivedFirmwareEntries();
    for (const firmware of archiveEntries) {
      if (!firmware.elfFilename || !firmware.buildId) {
        continue;
      }
      const elfPath = join(this.firmwareSymbolDirectory, firmware.elfFilename);
      if (!existsSync(elfPath)) {
        continue;
      }
      if (this.getSymbolEntryByBuildId(firmware.buildId)) {
        continue;
      }
      this.symbolFirmwares.push({ firmware, elfPath });
    }
  }

  private readArchivedFirmwareEntries(): AttractapFirmware[] {
    const archiveManifest = join(this.firmwareSymbolDirectory, 'firmwares.json');
    if (!existsSync(archiveManifest)) {
      return [];
    }

    try {
      const parsed = JSON.parse(readFileSync(archiveManifest, 'utf8')) as { firmwares?: AttractapFirmware[] };
      return Array.isArray(parsed.firmwares) ? parsed.firmwares : [];
    } catch (error) {
      this.logger.error(`Failed to read archived firmware symbols manifest: ${(error as Error).message}`);
      return [];
    }
  }

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
