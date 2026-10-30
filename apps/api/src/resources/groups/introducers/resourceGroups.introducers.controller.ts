import { Body, Controller, ForbiddenException, Get, Param, ParseIntPipe, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ResourceIntroducer } from '@attraccess/database-entities';
import { ResourceGroupsIntroducersService } from './resourceGroups.introducers.service';
import { Auth, AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import { IsResourceGroupIntroducerResponseDto } from './dtos/isIntroducer.response.dto';
import { GrantIntroducerDto } from '../../introducers/dtos/grantIntroducer.dto';

@ApiTags('Access Control')
@Controller('resource-groups/:groupId/introducers')
export class ResourceGroupsIntroducersController {
  constructor(private readonly resourceGroupsIntroducersService: ResourceGroupsIntroducersService) {}

  @Get()
  @Auth()
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
  @ApiResponse({ status: 403, description: 'Only managers and group introducers may read the full list' })
  async getMany(
    @Param('groupId', ParseIntPipe) groupId: number,
    @Req() req: AuthenticatedRequest,
  ): Promise<ResourceIntroducer[]> {
    const permissions = req.user.effectivePermissions;
    if (
      !permissions?.has('resources.update') &&
      !permissions?.has('resources.access.manage') &&
      !(await this.resourceGroupsIntroducersService.isIntroducer({ groupId, userId: req.user.id }))
    ) {
      throw new ForbiddenException('User cannot view the introducers of this resource group');
    }
    return await this.resourceGroupsIntroducersService.getMany(groupId);
  }

  @Get('/:userId/is-introducer')
  @Auth()
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
  @ApiResponse({ status: 403, description: 'Only managers may ask about other users' })
  async isIntroducer(
    @Param('userId', ParseIntPipe) userId: number,
    @Param('groupId', ParseIntPipe) groupId: number,
    @Req() req: AuthenticatedRequest,
  ): Promise<IsResourceGroupIntroducerResponseDto> {
    const permissions = req.user.effectivePermissions;
    if (
      userId !== req.user.id &&
      !permissions?.has('resources.update') &&
      !permissions?.has('resources.access.manage')
    ) {
      throw new ForbiddenException('You can only check your own introducer status');
    }
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
    @Body() body?: GrantIntroducerDto,
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
    @Param('groupId', ParseIntPipe) groupId: number,
    @Body() body?: GrantIntroducerDto,
  ): Promise<ResourceIntroducer> {
    return this.resourceGroupsIntroducersService.revoke(groupId, userId, body?.type);
  }
}
