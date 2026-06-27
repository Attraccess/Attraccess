import { Body, Controller, Get, Param, ParseIntPipe, Post } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ResourceIntroducer } from '@attraccess/database-entities';
import { ResourceGroupsIntroducersService } from './resourceGroups.introducers.service';
import { Auth } from '@attraccess/plugins-backend-sdk';
import { IsResourceGroupIntroducerResponseDto } from './dtos/isIntroducer.response.dto';
import { GrantIntroducerDto } from '../../introducers/dtos/grantIntroducer.dto';

@ApiTags('Access Control')
@Controller('resource-groups/:groupId/introducers')
export class ResourceGroupsIntroducersController {
  constructor(private readonly resourceGroupsIntroducersService: ResourceGroupsIntroducersService) {}

  @Get()
  @ApiOperation({ summary: 'Get all introducers for a resource group', operationId: 'resourceGroupIntroducersGetMany' })
  @ApiParam({ name: 'groupId', description: 'The ID of the resource group', type: Number })
  @ApiResponse({
    status: 200,
    description: 'The introducers have been successfully retrieved.',
    type: [ResourceIntroducer],
  })
  @ApiResponse({
    status: 404,
    description: 'The resource group has not been found.',
  })
  async getMany(@Param('groupId', ParseIntPipe) groupId: number): Promise<ResourceIntroducer[]> {
    return await this.resourceGroupsIntroducersService.getMany(groupId);
  }

  @Get('/:userId/is-introducer')
  @ApiOperation({
    summary: 'Check if a user is an introducer for a resource group',
    operationId: 'resourceGroupIntroducersIsIntroducer',
  })
  @ApiParam({ name: 'userId', description: 'The ID of the user', type: Number })
  @ApiParam({ name: 'groupId', description: 'The ID of the resource group', type: Number })
  @ApiResponse({
    status: 200,
    description: 'The user is an introducer for the resource group.',
    type: IsResourceGroupIntroducerResponseDto,
  })
  async isIntroducer(
    @Param('userId', ParseIntPipe) userId: number,
    @Param('groupId', ParseIntPipe) groupId: number
  ): Promise<IsResourceGroupIntroducerResponseDto> {
    return {
      isIntroducer: await this.resourceGroupsIntroducersService.isIntroducer({ groupId, userId }),
    };
  }

  @Post('/:userId/grant')
  @Auth('resources.access.manage')
  @ApiOperation({
    summary: 'Grant a user introduction permission for a resource group',
    operationId: 'resourceGroupIntroducersGrant',
  })
  @ApiParam({ name: 'userId', description: 'The ID of the user', type: Number })
  @ApiParam({ name: 'groupId', description: 'The ID of the resource group', type: Number })
  @ApiResponse({
    status: 200,
    description: 'The introducer has been successfully granted.',
  })
  async grant(
    @Param('userId', ParseIntPipe) userId: number,
    @Param('groupId', ParseIntPipe) groupId: number,
    @Body() body?: GrantIntroducerDto
  ): Promise<ResourceIntroducer> {
    return await this.resourceGroupsIntroducersService.grant(groupId, userId, body?.type);
  }

  @Post('/:userId/revoke')
  @Auth('resources.access.manage')
  @ApiOperation({
    summary: 'Revoke a user introduction permission for a resource group',
    operationId: 'resourceGroupIntroducersRevoke',
  })
  @ApiParam({ name: 'userId', description: 'The ID of the user', type: Number })
  @ApiParam({ name: 'groupId', description: 'The ID of the resource group', type: Number })
  @ApiResponse({
    status: 200,
    description: 'The introducer has been successfully revoked.',
  })
  async revoke(
    @Param('userId', ParseIntPipe) userId: number,
    @Param('groupId', ParseIntPipe) groupId: number
  ): Promise<ResourceIntroducer> {
    return this.resourceGroupsIntroducersService.revoke(groupId, userId);
  }
}
