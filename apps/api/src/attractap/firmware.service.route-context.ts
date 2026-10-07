import { AttractapFirmware } from './dtos/firmware.dto';
import { Logger } from '@nestjs/common';

export interface FirmwareSymbolEntry {
  firmware: AttractapFirmware;
  elfPath: string;
}

export abstract class AttractapFirmwareServiceRouteContext {
  protected abstract firmwares: AttractapFirmware[];
  protected abstract buildBundledSymbolEntry(firmware: AttractapFirmware): FirmwareSymbolEntry | null;
  protected abstract readonly firmwareAssetsDirectory: string;
  protected abstract readArchivedFirmwareEntries(): AttractapFirmware[];
  protected abstract readonly firmwareSymbolDirectory: string;
  protected abstract getSymbolEntryByBuildId(buildId: string): FirmwareSymbolEntry | undefined;
  protected abstract symbolFirmwares: FirmwareSymbolEntry[];
  protected abstract readonly logger: Logger;
  public abstract getFirmwareDefinition(firmwareName: string, variantName: string): AttractapFirmware;
}
