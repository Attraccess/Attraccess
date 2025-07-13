import { Injectable, Logger } from '@nestjs/common';
import { AttractapFirmware } from './dtos/firmware.dto';
import { readFileSync, createReadStream, existsSync } from 'fs';
import { join } from 'path';

@Injectable()
export class AttractapFirmwareService {
  private readonly firmwareAssetsDirectory: string;
  private readonly logger = new Logger(AttractapFirmwareService.name);

  private firmwares: AttractapFirmware[] = [];

  public constructor() {
    this.firmwareAssetsDirectory = join(__dirname, 'assets', 'attractap-firmwares');
    // read firmwares.json from assets/attractap-firmwares
    const firmwares = readFileSync(join(this.firmwareAssetsDirectory, 'firmwares.json'), 'utf8');
    this.firmwares = JSON.parse(firmwares).firmwares;
  }

  public async getFirmwares(): Promise<AttractapFirmware[]> {
    return this.firmwares;
  }

  public getFirmwareBinaryStream(firmwareName: string, variantName: string): NodeJS.ReadableStream {
    const firmwareDefinition = this.firmwares.find(
      (firmware) => firmware.name === firmwareName && firmware.variant === variantName
    );
    if (!firmwareDefinition) {
      throw new Error('Firmware definition not found');
    }

    const firmwarePath = join(this.firmwareAssetsDirectory, firmwareDefinition.filename);

    if (!existsSync(firmwarePath)) {
      throw new Error('Firmware binary not found');
    }
    return createReadStream(firmwarePath);
  }
}
