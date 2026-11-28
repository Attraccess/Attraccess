import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Auth } from '@attraccess/plugins-backend-sdk';
import { LicenseModuleType } from '../license/license.service';
import { RequiresLicense } from '../license/require-license.decorator';
import { AttractapService } from './attractap.service';
import { AttractapReaderDto, toReaderDto } from './dtos/reader.dto';
import { ResourceListVisible } from '../resources/visibility/resource-list-visible.interceptor';

/** Readers seen from the resource side; visible to every signed-in user, like `GET /attractap/readers`. */
@ApiTags('Attractap')
@ResourceListVisible()
@Controller()
@RequiresLicense(LicenseModuleType.ATTRACTAP)
export class ResourceAttractapsController {
  constructor(private readonly attractapService: AttractapService) {}

  @Get('resources/:resourceId/attractaps')
  @Auth()
  @ApiOperation({ summary: 'Get the readers linked to a resource', operationId: 'getResourceAttractaps' })
  @ApiResponse({ status: 200, type: [AttractapReaderDto] })
  async getResourceAttractaps(@Param('resourceId', ParseIntPipe) resourceId: number): Promise<AttractapReaderDto[]> {
    return (await this.attractapService.getPairedReaders({ resourceId })).map(toReaderDto);
  }

  @Get('resource-groups/:groupId/attractaps')
  @Auth()
  @ApiOperation({
    summary: 'Get the readers linked to any resource of a resource group',
    operationId: 'getResourceGroupAttractaps',
  })
  @ApiResponse({ status: 200, type: [AttractapReaderDto] })
  async getResourceGroupAttractaps(@Param('groupId', ParseIntPipe) groupId: number): Promise<AttractapReaderDto[]> {
    return (await this.attractapService.getPairedReaders({ resourceGroupId: groupId })).map(toReaderDto);
  }
}
