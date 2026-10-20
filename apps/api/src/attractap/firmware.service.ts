import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { tmpdir } from 'node:os';
import { Injectable, Logger } from '@nestjs/common';

import { createReadStream, existsSync, readFileSync, statSync, copyFileSync, mkdirSync, writeFileSync } from 'fs';

import { join } from 'path';

import { AttractapFirmware } from './dtos/firmware.dto';

export interface FirmwareSymbolEntry {
  firmware: AttractapFirmware;
  elfPath: string;
}

@Injectable()
export class AttractapFirmwareService {
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

  protected readonly firmwareAssetsDirectory: string;

  protected readonly firmwareSymbolDirectory: string;

  protected readonly logger = new Logger(AttractapFirmwareService.name);

  protected firmwares: AttractapFirmware[] = [];

  protected symbolFirmwares: FirmwareSymbolEntry[] = [];

  public async getFirmwares(): Promise<AttractapFirmware[]> {
    this.logger.debug(`Returning ${this.firmwares.length} firmwares`);
    return this.firmwares.filter((firmware) => {
      try {
        checkFirmwareQualification(firmware, this.firmwareAssetsDirectory);
        return firmware.securityProfile !== 'production';
      } catch {
        return false;
      }
    });
  }

  public getFirmwareDefinition(firmwareName: string, variantName: string, secured = false): AttractapFirmware {
    const firmware = this.firmwares.find(
      (firmware) =>
        firmware.name === firmwareName &&
        firmware.variant === variantName &&
        (secured ? firmware.securityProfile === 'production' : firmware.securityProfile !== 'production'),
    );

    if (!firmware) {
      this.logger.debug(`Firmware definition not found for: ${firmwareName}, variant: ${variantName}`);
    }

    if (firmware) checkFirmwareQualification(firmware, this.firmwareAssetsDirectory);
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

  protected buildBundledSymbolIndex(): FirmwareSymbolEntry[] {
    return this.firmwares
      .map((firmware) => this.buildBundledSymbolEntry(firmware))
      .filter((entry): entry is FirmwareSymbolEntry => !!entry);
  }

  protected buildBundledSymbolEntry(firmware: AttractapFirmware): FirmwareSymbolEntry | null {
    if (!firmware.elfFilename) {
      return null;
    }
    return {
      firmware,
      elfPath: join(this.firmwareAssetsDirectory, firmware.elfFilename),
    };
  }

  protected archiveBundledSymbols(): void {
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

  protected loadArchivedSymbols(): void {
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

  protected readArchivedFirmwareEntries(): AttractapFirmware[] {
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
}

function contained(root: string, filename: string) {
  if (typeof filename !== 'string' || !/^[A-Za-z0-9_.-]+$/.test(filename)) throw new Error('Invalid firmware filename');
  const result = path.join(root, filename);
  if (!fs.lstatSync(result).isFile() || fs.lstatSync(result).isSymbolicLink())
    throw new Error('Invalid firmware artifact');
  return result;
}

function canonical(value: unknown): string {
  if (value && typeof value === 'object' && !Array.isArray(value))
    return (
      '{' +
      Object.keys(value)
        .sort()
        .map((key) => JSON.stringify(key) + ':' + canonical((value as Record<string, unknown>)[key]))
        .join(',') +
      '}'
    );
  return JSON.stringify(value);
}

export function checkFirmwareQualification(
  firmware: AttractapFirmware,
  root: string,
  trustFile = process.env.ATTRACTAP_QUALIFICATION_PUBLIC_KEY_FILE,
  snapshot?: ReadonlyMap<string, Buffer>,
) {
  const binaries = [firmware.filename, firmware.filenameOTA].filter(Boolean);
  const artifacts: Record<string, string> = {};
  let signed = false;
  for (const filename of binaries) {
    const artifact = contained(root, filename);
    if (fs.statSync(artifact).size > 16 * 1024 * 1024) throw new Error('Firmware exceeds supported flash geometry');
    const bytes = snapshot ? snapshot.get(filename) : fs.readFileSync(artifact);
    if (!bytes) throw new Error('Missing firmware snapshot');
    if (bytes.length > 16 * 1024 * 1024) throw new Error('Firmware exceeds supported flash geometry');
    for (let offset = 0; offset + 4 <= bytes.length; offset += 4096)
      if (bytes.readUInt32LE(offset) === 0x000002e7) signed = true;
    artifacts[filename] = crypto.createHash('sha256').update(bytes).digest('hex');
  }
  const production = firmware.securityProfile === 'production' || signed;
  if (!production) {
    if (firmware.securityProfile && !['bridge', 'development'].includes(firmware.securityProfile))
      throw new Error('Unknown firmware security profile');
    return;
  }
  if (firmware.securityProfile !== 'production' || !trustFile || !firmware.qualificationFile)
    throw new Error('Production firmware requires independently signed hardware qualification');
  verifyHardwareQualification(firmware.qualificationFile, root, trustFile, artifacts);
}

export function verifyHardwareQualification(
  qualificationFile: string,
  root: string,
  trustFile: string,
  artifacts: Record<string, string>,
  inventoryDigest?: string,
): void {
  if (!trustFile) throw new Error('Independent qualification trust is required');
  const trustDirectory = fs.lstatSync(path.dirname(trustFile));
  const trust = fs.lstatSync(trustFile);
  if (
    !trustDirectory.isDirectory() ||
    trustDirectory.uid !== process.getuid() ||
    (trustDirectory.mode & 0o777) !== 0o700 ||
    !trust.isFile() ||
    trust.uid !== process.getuid() ||
    (trust.mode & 0o777) !== 0o600 ||
    trust.isSymbolicLink()
  )
    throw new Error('Unsafe qualification trust');
  const receiptBytes = fs.readFileSync(contained(root, qualificationFile));
  if (receiptBytes.length > 16384) throw new Error('Qualification exceeds limit');
  const receipt = JSON.parse(receiptBytes.toString('utf8'));
  const body = receipt.payload;
  const now = Math.floor(Date.now() / 1000);
  const expected = [
    'version',
    'model',
    'evidenceClass',
    'result',
    'reviewer',
    'qualifiedAt',
    'expiresAt',
    'inventoryDigest',
    'evidenceDigest',
    'artifacts',
  ];
  if (
    !body ||
    Object.keys(body).length !== expected.length ||
    expected.some((key) => !(key in body)) ||
    body.version !== 1 ||
    body.model !== 'existing-board-v1' ||
    body.evidenceClass !== 'hardware' ||
    body.result !== 'passed' ||
    !/^[A-Za-z0-9@._ -]{1,100}$/.test(body.reviewer) ||
    !Number.isSafeInteger(body.qualifiedAt) ||
    !Number.isSafeInteger(body.expiresAt) ||
    !(
      0 <= body.qualifiedAt &&
      body.qualifiedAt <= now &&
      now < body.expiresAt &&
      body.expiresAt <= body.qualifiedAt + 366 * 86400
    ) ||
    !/^[a-f0-9]{64}$/.test(body.inventoryDigest) ||
    !/^[a-f0-9]{64}$/.test(body.evidenceDigest) ||
    (inventoryDigest !== undefined && inventoryDigest !== body.inventoryDigest) ||
    !body.artifacts ||
    Array.isArray(body.artifacts) ||
    Object.entries(body.artifacts).some(
      ([name, digest]) =>
        !/^[A-Za-z0-9_.-]{1,128}$/.test(name) || typeof digest !== 'string' || !/^[a-f0-9]{64}$/.test(digest),
    ) ||
    Object.entries(artifacts).some(([name, digest]) => body.artifacts[name] !== digest)
  )
    throw new Error('Qualification does not match firmware');
  const key = crypto.createPublicKey(fs.readFileSync(trustFile));
  if (
    key.asymmetricKeyType !== 'rsa' ||
    key.asymmetricKeyDetails.modulusLength < 3072 ||
    !crypto.verify(
      'sha256',
      Buffer.from('ATTR-QUAL-V1\n' + canonical(body), 'ascii'),
      { key, padding: crypto.constants.RSA_PKCS1_PSS_PADDING, saltLength: 32 },
      Buffer.from(receipt.signature, 'base64'),
    )
  )
    throw new Error('Invalid qualification signature');
}

/** Copy once, qualify those bytes and return an unlinked, read-only OTA snapshot.
 * The descriptor stays valid across asset replacement and cannot be reopened by path.
 */
export function openQualifiedOtaSnapshot(firmware: AttractapFirmware, root: string): { fd: number; size: number } {
  const snapshot = new Map<string, Buffer>();
  for (const filename of [firmware.filename, firmware.filenameOTA].filter(Boolean)) {
    const file = contained(root, filename);
    if (fs.statSync(file).size > 16 * 1024 * 1024) throw new Error('Firmware exceeds supported flash geometry');
    const bytes = fs.readFileSync(file);
    if (bytes.length > 16 * 1024 * 1024) throw new Error('Firmware exceeds supported flash geometry');
    snapshot.set(filename, bytes);
  }
  checkFirmwareQualification(firmware, root, process.env.ATTRACTAP_QUALIFICATION_PUBLIC_KEY_FILE, snapshot);
  const bytes = snapshot.get(firmware.filenameOTA || firmware.filename);
  if (!bytes || bytes.length < 1024 || bytes.length > 0x640000) throw new Error('OTA firmware size is suspicious');
  const directory = fs.mkdtempSync(path.join(tmpdir(), 'attractap-ota-'));
  const file = path.join(directory, 'firmware.bin');
  try {
    fs.writeFileSync(file, bytes, { mode: 0o400, flag: 'wx' });
    return { fd: fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW), size: bytes.length };
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}
