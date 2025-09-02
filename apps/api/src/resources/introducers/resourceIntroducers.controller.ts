import { Controller, Delete, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ResourceIntroducersService } from './resourceIntroducers.service';
import { ResourceIntroducer } from '@attraccess/database-entities';
import { Auth } from '@attraccess/plugins-backend-sdk';
import { IsResourceIntroducerResponseDto } from './dtos/isIntroducer.response.dto';

@ApiTags('Access Control')
@Controller('resources/:resourceId/introducers')
export class ResourceIntroducersController {
  constructor(private readonly resourceIntroducersService: ResourceIntroducersService) {}

  @Get('/:userId/is-introducer')
  @ApiOperation({
    summary: 'Check if a user is an introducer for a resource',
    operationId: 'resourceIntroducersIsIntroducer',
  })
  @ApiResponse({
    status: 200,
    description: 'User is an introducer for the resource',
    type: IsResourceIntroducerResponseDto,
  })
  async isIntroducer(
    @Param('resourceId', ParseIntPipe) resourceId: number,
    @Param('userId', ParseIntPipe) userId: number,
    @Query('includeGroups') includeGroups: boolean
  ): Promise<IsResourceIntroducerResponseDto> {
    const isResourceIntroducer = await this.resourceIntroducersService.isIntroducer(resourceId, userId, includeGroups);

    return {
      isIntroducer: isResourceIntroducer,
    };
  }

  @Get()
  @ApiOperation({ summary: 'Get all introducers for a resource', operationId: 'resourceIntroducersGetMany' })
  @ApiResponse({
    status: 200,
    description: 'All introducers for a resource',
    type: [ResourceIntroducer],
  })
  async getMany(@Param('resourceId', ParseIntPipe) resourceId: number): Promise<ResourceIntroducer[]> {
    return await this.resourceIntroducersService.getMany(resourceId);
  }

  @Post('/:userId/grant')
  @ApiOperation({
    summary: 'Grant a user introduction permission for a resource',
    operationId: 'resourceIntroducersGrant',
  })
  @ApiResponse({
    status: 200,
    description: 'Introduction permissions granted',
    type: ResourceIntroducer,
  })
  @Auth('canManageResources')
  async grant(
    @Param('resourceId', ParseIntPipe) resourceId: number,
    @Param('userId', ParseIntPipe) userId: number
  ): Promise<ResourceIntroducer> {
    return await this.resourceIntroducersService.grant(resourceId, userId);
  }

  @Delete('/:userId/revoke')
  @ApiOperation({
    summary: 'Revoke a user introduction permission for a resource',
    operationId: 'resourceIntroducersRevoke',
  })
  @ApiResponse({
    status: 200,
    description: 'Introduction permissions revoked',
  })
  @Auth('canManageResources')
  async revoke(
    @Param('resourceId', ParseIntPipe) resourceId: number,
    @Param('userId', ParseIntPipe) userId: number
  ): Promise<{ OK: true }> {
    await this.resourceIntroducersService.revoke(resourceId, userId);

    return {
      OK: true,
    };
  }
}
