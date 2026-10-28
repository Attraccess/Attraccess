import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Auth } from '@attraccess/plugins-backend-sdk';
import { Attractap } from '@attraccess/database-entities';
import { LicenseModuleType } from '../license/license.service';
import { RequiresLicense } from '../license/require-license.decorator';
import { AttractapService } from './attractap.service';

/** Readers seen from the resource side; visible to every signed-in user, like `GET /attractap/readers`. */
@ApiTags('Attractap')
@Controller()
@RequiresLicense(LicenseModuleType.ATTRACTAP)
export class ResourceAttractapsController {
  constructor(private readonly attractapService: AttractapService) {}

  @Get('resources/:resourceId/attractaps')
  @Auth()
  @ApiOperation({ summary: 'Get the readers linked to a resource', operationId: 'getResourceAttractaps' })
  @ApiResponse({ status: 200, type: [Attractap] })
  async getResourceAttractaps(@Param('resourceId', ParseIntPipe) resourceId: number): Promise<Attractap[]> {
    return this.attractapService.getAllReaders({ where: { resources: { id: resourceId } } });
  }

  @Get('resource-groups/:groupId/attractaps')
  @Auth()
  @ApiOperation({
    summary: 'Get the readers linked to any resource of a resource group',
    operationId: 'getResourceGroupAttractaps',
  })
  @ApiResponse({ status: 200, type: [Attractap] })
  async getResourceGroupAttractaps(@Param('groupId', ParseIntPipe) groupId: number): Promise<Attractap[]> {
    return this.attractapService.getAllReaders({ where: { resources: { groups: { id: groupId } } } });
  }
}
