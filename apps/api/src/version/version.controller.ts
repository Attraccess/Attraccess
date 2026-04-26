import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Auth } from '@attraccess/plugins-backend-sdk';
import { VersionService } from './version.service';
import { VersionInfoDto } from './dto/version-info.dto';
import { UpdateStatusDto } from './dto/update-status.dto';

@ApiTags('System')
@Controller('version')
export class VersionController {
  constructor(private readonly versionService: VersionService) {}

  @Get()
  @ApiOperation({
    summary: 'Return the currently running Attraccess version',
    operationId: 'getCurrentVersion',
  })
  @ApiResponse({ status: 200, description: 'The currently running version.', type: VersionInfoDto })
  getCurrentVersion(): VersionInfoDto {
    return this.versionService.getCurrentVersion();
  }

  @Get('updates')
  @Auth('canManageSystemConfiguration')
  @ApiOperation({
    summary: 'Check whether a newer Attraccess release is available on GitHub',
    operationId: 'getUpdateStatus',
    description:
      'Compares the currently running version against the highest stable GitHub release. Results are cached for one hour to avoid hitting the GitHub API rate limit.',
  })
  @ApiQuery({
    name: 'refresh',
    required: false,
    type: String,
    description: 'Set to "true" or "1" to bypass the 1-hour server-side cache and re-query GitHub immediately.',
  })
  @ApiResponse({ status: 200, description: 'Update availability status.', type: UpdateStatusDto })
  @ApiResponse({ status: 401, description: 'Unauthorized - User is not authenticated' })
  @ApiResponse({ status: 403, description: 'Forbidden - User does not have permission to check for updates' })
  async getUpdateStatus(@Query('refresh') refresh?: string): Promise<UpdateStatusDto> {
    const forceRefresh = refresh === 'true' || refresh === '1';
    return this.versionService.getUpdateStatus(forceRefresh);
  }
}
