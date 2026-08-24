import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import { ResourceIntroductionsService } from './resouceIntroductions.service';
import { ResourceIntroduction, ResourceIntroductionHistoryItem } from '@attraccess/database-entities';
import { IsResourceIntroducer } from './isIntroducer.decorator';
import { UpdateResourceIntroductionDto } from './dtos/update.request.dto';

@ApiTags('Access Control')
@Controller('resources/:resourceId/introductions')
export class ResourceIntroductionsController {
  constructor(private readonly resourceIntroductionsService: ResourceIntroductionsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all introductions for a resource', operationId: 'resourceIntroductionsGetMany' })
  @ApiResponse({
    status: 200,
    description: 'All introductions for a resource',
    type: [ResourceIntroduction],
  })
  async getManyByResource(@Param('resourceId', ParseIntPipe) resourceId: number): Promise<ResourceIntroduction[]> {
    return await this.resourceIntroductionsService.getMany(resourceId);
  }

  @Post('/:userId/grant')
  @ApiOperation({ summary: 'Grant a user usage permission for a resource', operationId: 'resourceIntroductionsGrant' })
  @ApiResponse({
    status: 200,
    description: 'Introduction granted',
    type: ResourceIntroductionHistoryItem,
  })
  @IsResourceIntroducer()
  async grant(
    @Param('resourceId', ParseIntPipe) resourceId: number,
    @Param('userId', ParseIntPipe) userId: number,
    @Body() data: UpdateResourceIntroductionDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<ResourceIntroductionHistoryItem> {
    return await this.resourceIntroductionsService.grant(resourceId, userId, data, { performedByUserId: req.user.id });
  }

  @Delete('/:userId/revoke')
  @ApiOperation({
    summary: 'Revoke a user usage permission for a resource',
    operationId: 'resourceIntroductionsRevoke',
  })
  @ApiResponse({
    status: 200,
    description: 'Introduction revoked',
    type: ResourceIntroductionHistoryItem,
  })
  @IsResourceIntroducer()
  async revoke(
    @Param('resourceId', ParseIntPipe) resourceId: number,
    @Param('userId', ParseIntPipe) userId: number,
    @Body() data: UpdateResourceIntroductionDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<ResourceIntroductionHistoryItem> {
    return await this.resourceIntroductionsService.revoke(resourceId, userId, data, { performedByUserId: req.user.id });
  }

  @Get('/:userId/history')
  @ApiOperation({
    summary: 'Get history of introductions by resource ID and user ID',
    operationId: 'resourceIntroductionsGetHistory',
  })
  @ApiParam({ name: 'resourceId', description: 'The ID of the resource', type: Number })
  @ApiParam({ name: 'userId', description: 'The ID of the user', type: Number })
  @ApiResponse({
    status: 200,
    description: 'The history has been successfully retrieved.',
    type: [ResourceIntroductionHistoryItem],
  })
  @IsResourceIntroducer()
  async getHistory(
    @Param('resourceId', ParseIntPipe) resourceId: number,
    @Param('userId', ParseIntPipe) userId: number
  ): Promise<ResourceIntroductionHistoryItem[]> {
    return await this.resourceIntroductionsService.getHistoryByResourceIdAndUserId(resourceId, userId);
  }
}
