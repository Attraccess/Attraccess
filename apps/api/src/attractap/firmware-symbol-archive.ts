import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { AttractapFirmware } from './dtos/firmware.dto';
import { FirmwareSymbolEntry } from './firmware.service.route-context';
import { AttractapFirmwareServiceRouteContext } from './firmware.service.route-context';
export abstract class FirmwareSymbolArchiveImplementation extends AttractapFirmwareServiceRouteContext {
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
