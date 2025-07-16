import { Controller, Get, Inject, Param, Logger, Res } from '@nestjs/common';
import { Auth } from '@attraccess/plugins-backend-sdk';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AttractapFirmwareService } from './firmware.service';
import { AttractapFirmware } from './dtos/firmware.dto';
import { Response } from 'express';

@ApiTags('Attractap')
@Controller('attractap/firmware')
export class AttractapFirmwareController {
  private readonly logger = new Logger(AttractapFirmwareController.name);

  public constructor(
    @Inject(AttractapFirmwareService)
    private readonly attractapFirmwareService: AttractapFirmwareService
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get all firmwares', operationId: 'getFirmwares' })
  @ApiResponse({
    status: 200,
    description: 'Firmwares fetched successfully',
    type: [AttractapFirmware],
  })
  @Auth('canManageSystemConfiguration')
  async getFirmwares(): Promise<AttractapFirmware[]> {
    this.logger.debug('GET /attractap/firmware - Fetching all firmwares');
    const firmwares = await this.attractapFirmwareService.getFirmwares();
    this.logger.debug(`Returning ${firmwares.length} firmwares`);
    return firmwares;
  }

  @Get('/:firmwareName/variants/:variantName/:filename')
  @ApiOperation({ summary: 'Get a firmware by name and variant', operationId: 'getFirmwareBinary' })
  @ApiResponse({
    status: 200,
    description: 'Firmware fetched successfully',
    type: String,
  })
  @Auth('canManageSystemConfiguration')
  async getFirmwareBinary(
    @Param('firmwareName') firmwareName: string,
    @Param('variantName') variantName: string,
    @Param('filename') filename: string,
    @Res() res: Response
  ): Promise<void> {
    this.logger.debug(
      `GET /attractap/firmware/${firmwareName}/variants/${variantName}/${filename} - Fetching firmware binary`
    );
    this.logger.debug(`Parameters: firmwareName=${firmwareName}, variantName=${variantName}, filename=${filename}`);

    try {
      const stream = this.attractapFirmwareService.getFirmwareBinaryStream(firmwareName, variantName, filename);

      this.logger.debug('Setting response headers for firmware binary download');
      res.set({
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="firmware.bin"`,
      });

      this.logger.debug('Piping firmware binary stream to response');
      stream.pipe(res);

      this.logger.debug('Firmware binary stream piped successfully');
    } catch (err) {
      this.logger.error(`Error serving firmware binary: ${err.message}`, err.stack);
      this.logger.debug(
        `Error occurred for request: firmwareName=${firmwareName}, variantName=${variantName}, filename=${filename}`
      );
      res.status(404).send('Firmware binary not found');
    }
  }
}
