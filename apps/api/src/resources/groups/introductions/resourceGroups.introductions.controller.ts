import { Body, Controller, Get, Param, ParseIntPipe, Post } from '@nestjs/common';
import { ResourceGroupsIntroductionsService } from './resourceGroups.introductions.service';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ResourceIntroduction, ResourceIntroductionHistoryItem } from '@attraccess/database-entities';
import { IsResourceGroupIntroducer } from './isIntroducer.decorator';
import { UpdateResourceGroupIntroductionDto } from './dtos/update.request.dto';
import { RenewIntroductionRequestDto } from '../../introductions/dtos/renewIntroduction.request.dto';

@ApiTags('Access Control')
@Controller('resource-groups/:groupId/introductions')
export class ResourceGroupsIntroductionsController {
  constructor(private readonly resourceGroupsIntroductionsService: ResourceGroupsIntroductionsService) {}

  @Get()
  @ApiOperation({ summary: 'Get many introductions by group ID', operationId: 'resourceGroupIntroductionsGetMany' })
  @ApiParam({ name: 'groupId', description: 'The ID of the resource group', type: Number })
  @ApiResponse({
    status: 200,
    description: 'The introductions have been successfully retrieved.',
    type: [ResourceIntroduction],
  })
  @IsResourceGroupIntroducer()
  async getMany(@Param('groupId', ParseIntPipe) groupId: number): Promise<ResourceIntroduction[]> {
    return await this.resourceGroupsIntroductionsService.getManyByGroupId(groupId);
  }

  @Get('/:userId/history')
  @ApiOperation({
    summary: 'Get history of introductions by group ID and user ID',
    operationId: 'resourceGroupIntroductionsGetHistory',
  })
  @ApiParam({ name: 'groupId', description: 'The ID of the resource group', type: Number })
  @ApiParam({ name: 'userId', description: 'The ID of the user', type: Number })
  @ApiResponse({
    status: 200,
    description: 'The history has been successfully retrieved.',
    type: [ResourceIntroductionHistoryItem],
  })
  @IsResourceGroupIntroducer()
  async getHistory(
    @Param('groupId', ParseIntPipe) groupId: number,
    @Param('userId', ParseIntPipe) userId: number
  ): Promise<ResourceIntroductionHistoryItem[]> {
    return await this.resourceGroupsIntroductionsService.getHistoryByGroupIdAndUserId(groupId, userId);
  }

  @Post('/:userId/grant')
  @IsResourceGroupIntroducer()
  @ApiOperation({
    summary: 'Grant introduction permission for a resource group to a user',
    operationId: 'resourceGroupIntroductionsGrant',
  })
  @ApiParam({ name: 'groupId', description: 'The ID of the resource group', type: Number })
  @ApiParam({ name: 'userId', description: 'The ID of the user', type: Number })
  @ApiResponse({
    status: 200,
    description: 'The introduction has been successfully granted.',
    type: ResourceIntroductionHistoryItem,
  })
  async grant(
    @Param('groupId', ParseIntPipe) groupId: number,
    @Param('userId', ParseIntPipe) userId: number,
    @Body() data: UpdateResourceGroupIntroductionDto
  ): Promise<ResourceIntroductionHistoryItem> {
    return await this.resourceGroupsIntroductionsService.grant(groupId, userId, data);
  }

  @Post('/:userId/revoke')
  @IsResourceGroupIntroducer()
  @ApiOperation({
    summary: 'Revoke introduction permission for a resource group from a user',
    operationId: 'resourceGroupIntroductionsRevoke',
  })
  @ApiParam({ name: 'groupId', description: 'The ID of the resource group', type: Number })
  @ApiParam({ name: 'userId', description: 'The ID of the user', type: Number })
  @ApiResponse({
    status: 200,
    description: 'The introduction has been successfully revoked.',
    type: ResourceIntroductionHistoryItem,
  })
  async revoke(
    @Param('groupId', ParseIntPipe) groupId: number,
    @Param('userId', ParseIntPipe) userId: number,
    @Body() data: UpdateResourceGroupIntroductionDto
  ): Promise<ResourceIntroductionHistoryItem> {
    return await this.resourceGroupsIntroductionsService.revoke(groupId, userId, data);
  }

  @Post('/:userId/renew')
  @IsResourceGroupIntroducer()
  @ApiOperation({
    summary: 'Renew (refresh baseline) a user group introduction',
    operationId: 'resourceGroupIntroductionsRenew',
  })
  @ApiParam({ name: 'groupId', description: 'The ID of the resource group', type: Number })
  @ApiParam({ name: 'userId', description: 'The ID of the user', type: Number })
  @ApiResponse({
    status: 200,
    description: 'The introduction has been successfully renewed.',
    type: ResourceIntroductionHistoryItem,
  })
  async renew(
    @Param('groupId', ParseIntPipe) groupId: number,
    @Param('userId', ParseIntPipe) userId: number,
    @Body() data: RenewIntroductionRequestDto
  ): Promise<ResourceIntroductionHistoryItem> {
    return await this.resourceGroupsIntroductionsService.renew(groupId, userId, data);
  }
}
