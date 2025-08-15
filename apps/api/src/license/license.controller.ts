import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Auth } from '@attraccess/plugins-backend-sdk';
import { LicenseService } from './license.service';
import { LicenseDataDto } from './dtos/license.dto';

@ApiTags('License')
@Controller('license-data')
export class LicenseController {
  constructor(private readonly licenseService: LicenseService) {}

  @Get()
  @Auth()
  @ApiOperation({ summary: 'Get license information', operationId: 'getLicenseInformation' })
  @ApiResponse({ status: 200, description: 'The current license data.', type: LicenseDataDto })
  @ApiResponse({ status: 401, description: 'Unauthorized - User is not authenticated' })
  async getLicense(): Promise<LicenseDataDto> {
    return await this.licenseService.getLicenseData();
  }
}
