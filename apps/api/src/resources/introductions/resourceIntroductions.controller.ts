import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ResourceIntroductionsService } from './resouceIntroductions.service';
import { ResourceIntroduction, ResourceIntroductionHistoryItem } from '@attraccess/database-entities';
import { IsResourceIntroducer } from './isIntroducer.decorator';
import { UpdateResourceIntroductionDto } from './dtos/update.request.dto';
import { RenewIntroductionRequestDto } from './dtos/renewIntroduction.request.dto';
import {
  IntroductionStatus,
  IntroductionStatusResponseDto,
} from './dtos/introductionStatus.response.dto';
import { IntroductionScheduleEvaluatorService } from './schedules/introduction-schedule-evaluator.service';

@ApiTags('Access Control')
@Controller('resources/:resourceId/introductions')
export class ResourceIntroductionsController {
  constructor(
    private readonly resourceIntroductionsService: ResourceIntroductionsService,
    private readonly scheduleEvaluator: IntroductionScheduleEvaluatorService,
  ) {}

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
    @Body() data: UpdateResourceIntroductionDto
  ): Promise<ResourceIntroductionHistoryItem> {
    return await this.resourceIntroductionsService.grant(resourceId, userId, data);
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
    @Body() data: UpdateResourceIntroductionDto
  ): Promise<ResourceIntroductionHistoryItem> {
    return await this.resourceIntroductionsService.revoke(resourceId, userId, data);
  }

  @Post('/:userId/renew')
  @IsResourceIntroducer()
  @ApiOperation({
    summary: 'Renew (refresh baseline) a user introduction',
    operationId: 'resourceIntroductionsRenew',
  })
  @ApiResponse({
    status: 200,
    description: 'Introduction renewed',
    type: ResourceIntroductionHistoryItem,
  })
  async renew(
    @Param('resourceId', ParseIntPipe) resourceId: number,
    @Param('userId', ParseIntPipe) userId: number,
    @Body() data: RenewIntroductionRequestDto
  ): Promise<ResourceIntroductionHistoryItem> {
    return await this.resourceIntroductionsService.renew(resourceId, userId, data);
  }

  @Get('/:userId/status')
  @ApiOperation({
    summary: 'Get introduction status for a user on a resource',
    operationId: 'resourceIntroductionsGetStatus',
  })
  @ApiParam({ name: 'resourceId', description: 'The ID of the resource', type: Number })
  @ApiParam({ name: 'userId', description: 'The ID of the user', type: Number })
  @ApiResponse({
    status: 200,
    description: 'Introduction status',
    type: IntroductionStatusResponseDto,
  })
  async getStatus(
    @Param('resourceId', ParseIntPipe) resourceId: number,
    @Param('userId', ParseIntPipe) userId: number,
  ): Promise<IntroductionStatusResponseDto> {
    const evalResult = await this.scheduleEvaluator.evaluateUserOnResource(userId, resourceId);
    const valid = await this.resourceIntroductionsService.hasValidIntroduction(resourceId, userId);
    return {
      hasValidIntroduction: valid,
      status: evalResult.status as IntroductionStatus,
      expiresAt: evalResult.expiresAt ? evalResult.expiresAt.toISOString() : null,
      schedules: evalResult.schedules.map((s) => ({
        scheduleId: s.scheduleId,
        dueAt: s.dueAt ? s.dueAt.toISOString() : null,
        isWarning: s.isWarning,
        isDue: s.isDue,
        blockAccess: s.blockAccess,
      })),
    };
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
