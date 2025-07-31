import { Controller, Get, Inject, Param, Logger, Res } from '@nestjs/common';
import { Auth } from '@attraccess/plugins-backend-sdk';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AttractapFirmwareService } from './firmware.service';
import { AttractapFirmware } from './dtos/firmware.dto';
import { Response } from 'express';
import { AttractapGateway } from './websockets/websocket.gateway';

@ApiTags('Attractap')
@Controller('attractap/firmwares')
export class AttractapFirmwareController {
  private readonly logger = new Logger(AttractapFirmwareController.name);

  public constructor(
    @Inject(AttractapFirmwareService)
    private readonly attractapFirmwareService: AttractapFirmwareService,
    @Inject(AttractapGateway)
    private readonly attractapGateway: AttractapGateway
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
    this.logger.debug('GET /attractap/firmwares - Fetching all firmwares');
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
  async getFirmwareBinary(
    @Param('firmwareName') firmwareName: string,
    @Param('variantName') variantName: string,
    @Param('filename') filename: string,
    @Res() res: Response
  ): Promise<void> {
    this.logger.debug(
      `GET /attractap/firmwares/${firmwareName}/variants/${variantName}/${filename} - Fetching firmware binary`
    );
    this.logger.debug(`Parameters: firmwareName=${firmwareName}, variantName=${variantName}, filename=${filename}`);

    try {
      const stream = this.attractapFirmwareService.getFirmwareBinaryStream(firmwareName, variantName);
      const fileSize = this.attractapFirmwareService.getFirmwareBinarySize(firmwareName, variantName);

      this.logger.debug('Setting response headers for firmware binary download');
      res.set({
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="firmware.bin"`,
        'Content-Length': fileSize.toString(),
        Connection: 'keep-alive',
        'Cache-Control': 'no-cache',
      });

      this.logger.debug('Piping firmware binary stream to response');

      // Add stream event handlers for better debugging
      stream.on('error', (error) => {
        this.logger.error(`Stream error during firmware download: ${error.message}`, error.stack);
        if (!res.headersSent) {
          res.status(500).send('Stream error during firmware download');
        }
      });

      stream.on('end', () => {
        this.logger.debug('Firmware binary stream completed successfully');
      });

      let bytesTransferred = 0;
      const logInterval = 128 * 1024; // Log every 128KB
      let nextLogPoint = logInterval;

      stream.on('data', (chunk) => {
        bytesTransferred += chunk.length;
        if (bytesTransferred >= nextLogPoint) {
          this.logger.debug(
            `Firmware download progress: ${bytesTransferred} / ${fileSize} bytes (${Math.round(
              (bytesTransferred / fileSize) * 100
            )}%)`
          );
          nextLogPoint += logInterval;
        }
      });

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
