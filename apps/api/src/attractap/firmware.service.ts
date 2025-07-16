import { Injectable, Logger } from '@nestjs/common';
import { AttractapFirmware } from './dtos/firmware.dto';
import { readFileSync, createReadStream, existsSync } from 'fs';
import { join } from 'path';
import { ConfigService } from '@nestjs/config';
import { AppConfigType } from '../config/app.config';

@Injectable()
export class AttractapFirmwareService {
  private readonly firmwareAssetsDirectory: string;
  private readonly logger = new Logger(AttractapFirmwareService.name);
  private readonly apiUrl: string;

  private firmwares: AttractapFirmware[] = [];

  public constructor(private readonly configService: ConfigService) {
    this.firmwareAssetsDirectory = join(__dirname, 'assets', 'attractap-firmwares');
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

    this.logger.debug(`Loaded ${this.firmwares.length} firmware definitions`);

    const appConfig = this.configService.get<AppConfigType>('app');
    this.apiUrl = appConfig.VITE_ATTRACCESS_URL;
    this.logger.debug(`API URL configured: ${this.apiUrl}`);
  }

  public async getFirmwares(): Promise<AttractapFirmware[]> {
    this.logger.debug(`Returning ${this.firmwares.length} firmwares`);
    return this.firmwares;
  }

  public getFirmwareDefinition(firmwareName: string, variantName: string): AttractapFirmware {
    this.logger.debug(`Looking for firmware definition: ${firmwareName}, variant: ${variantName}`);
    const firmware = this.firmwares.find(
      (firmware) => firmware.name === firmwareName && firmware.variant === variantName
    );

    if (firmware) {
      this.logger.debug(`Found firmware definition: ${firmware.name} v${firmware.version}`);
    } else {
      this.logger.debug(`Firmware definition not found for: ${firmwareName}, variant: ${variantName}`);
    }

    return firmware;
  }

  public getFirmwareBinaryStream(firmwareName: string, variantName: string, filename: string): NodeJS.ReadableStream {
    this.logger.debug(
      `Getting firmware binary stream for: ${firmwareName}, variant: ${variantName}, filename: ${filename}`
    );

    const firmwareDefinition = this.getFirmwareDefinition(firmwareName, variantName);
    if (!firmwareDefinition) {
      this.logger.error(`Firmware definition not found for: ${firmwareName}, variant: ${variantName}`);
      throw new Error('Firmware definition not found');
    }

    this.logger.debug(
      `Firmware definition found. Available files: ${firmwareDefinition.filename}, ${firmwareDefinition.filenameFlashz}`
    );

    if (![firmwareDefinition.filename, firmwareDefinition.filenameFlashz].includes(filename)) {
      this.logger.error(
        `Requested filename '${filename}' not found in firmware definition. Available: ${firmwareDefinition.filename}, ${firmwareDefinition.filenameFlashz}`
      );
      throw new Error('Firmware binary not found');
    }

    const firmwarePath = join(this.firmwareAssetsDirectory, filename);
    this.logger.debug(`Checking firmware binary path: ${firmwarePath}`);

    if (!existsSync(firmwarePath)) {
      this.logger.error(`Firmware binary file does not exist: ${firmwarePath}`);
      throw new Error('Firmware binary not found');
    }

    this.logger.debug(`Creating read stream for firmware binary: ${firmwarePath}`);
    return createReadStream(firmwarePath);
  }

  public getFirmwareDownloadUrl(firmwareName: string, variantName: string, filename: string): string {
    const url = `${this.apiUrl}/api/attractap/firmwares/${firmwareName}/variants/${variantName}/${filename}`;
    this.logger.debug(`Generated firmware download URL: ${url}`);
    return url;
  }
}
