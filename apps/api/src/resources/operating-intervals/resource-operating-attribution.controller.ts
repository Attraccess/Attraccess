import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Auth } from '@attraccess/plugins-backend-sdk';
import {
  ResourceOperatingAttributionService,
  ResourceOperatingAttributionSummary,
} from './resource-operating-attribution.service';

@ApiTags('Resources')
@Controller('resources/:resourceId/operating-attribution')
export class ResourceOperatingAttributionController {
  constructor(private readonly attributionService: ResourceOperatingAttributionService) {}

  @Get()
  @Auth('resources.update')
  @ApiOperation({
    summary: 'Get operating time attributed to usage sessions',
    operationId: 'resourceOperatingAttributionGet',
  })
  @ApiResponse({ status: 200, description: 'Operating attribution retrieved successfully.' })
  async getForResource(
    @Param('resourceId', ParseIntPipe) resourceId: number,
  ): Promise<ResourceOperatingAttributionSummary> {
    return this.attributionService.getForResource(resourceId);
  }
}
