import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ResourceIntroducersService } from './resourceIntroducers.service';
import { ResourceIntroducer, ResourceIntroducerType } from '@attraccess/database-entities';
import { Auth } from '@attraccess/plugins-backend-sdk';
import { IsResourceIntroducerResponseDto } from './dtos/isIntroducer.response.dto';
import { GrantIntroducerDto } from './dtos/grantIntroducer.dto';

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
  @ApiQuery({
    name: 'type',
    required: false,
    enum: ResourceIntroducerType,
    enumName: 'ResourceIntroducerType',
    description: 'Filter by access type. Omit to return both introducers and maintainers.',
  })
  async getMany(
    @Param('resourceId', ParseIntPipe) resourceId: number,
    @Query('type') type?: ResourceIntroducerType
  ): Promise<ResourceIntroducer[]> {
    return await this.resourceIntroducersService.getMany(resourceId, type);
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
    @Param('userId', ParseIntPipe) userId: number,
    @Body() body?: GrantIntroducerDto
  ): Promise<ResourceIntroducer> {
    return await this.resourceIntroducersService.grant(resourceId, userId, body?.type);
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
