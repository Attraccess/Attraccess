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
    return this.attractapFirmwareService.getFirmwares();
  }

  @Get('/:firmwareName/variants/:variantName/firmware.bin')
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
    @Res() res: Response
  ): Promise<void> {
    try {
      const stream = this.attractapFirmwareService.getFirmwareBinaryStream(firmwareName, variantName);
      res.set({
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="firmware.bin"`,
      });
      stream.pipe(res);
    } catch (err) {
      this.logger.error(err);
      res.status(404).send('Firmware binary not found');
    }
  }
}
