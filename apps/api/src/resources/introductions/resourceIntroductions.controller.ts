import { ResourceIntroduction } from '../../transport/models/resourceIntroduction.dto';
import { ResourceIntroductionHistoryItem } from '../../transport/models/resourceIntroductionHistoryItem.dto';
import { mapResponse } from '../../transport/response-mapper';
import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Req, ForbiddenException } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Auth, AuthenticatedRequest } from '@attraccess/plugins-backend-sdk/v2';
import { ResourceIntroductionsService } from './resouceIntroductions.service';

import { IsResourceIntroducer } from './isIntroducer.decorator';
import { ResourceIntroducersService } from '../introducers/resourceIntroducers.service';
import { UpdateResourceIntroductionDto } from './dtos/update.request.dto';

@ApiTags('Access Control')
@Controller('resources/:resourceId/introductions')
export class ResourceIntroductionsController {
  constructor(
    private readonly resourceIntroductionsService: ResourceIntroductionsService,
    private readonly resourceIntroducersService: ResourceIntroducersService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get all introductions for a resource', operationId: 'resourceIntroductionsGetMany' })
  @ApiResponse({
    status: 200,
    description: 'All introductions for a resource',
    type: [ResourceIntroduction],
  })
  async getManyByResource(@Param('resourceId', ParseIntPipe) resourceId: number): Promise<ResourceIntroduction[]> {
    return (await this.resourceIntroductionsService.getMany(resourceId)).map((record) =>
      mapResponse(ResourceIntroduction, record),
    );
  }

  @Get('people')
  @Auth()
  @ApiOperation({
    summary: 'Get direct and inherited introductions for the People tab',
    operationId: 'resourceIntroductionsGetPeople',
  })
  @ApiResponse({ status: 200, type: [ResourceIntroduction] })
  @ApiResponse({ status: 403, description: 'User cannot view this resource’s People tab' })
  async getPeople(
    @Param('resourceId', ParseIntPipe) resourceId: number,
    @Req() req: AuthenticatedRequest,
  ): Promise<ResourceIntroduction[]> {
    const permissions = req.user.effectivePermissions;
    if (
      !permissions?.has('resources.update') &&
      !permissions?.has('resources.access.manage') &&
      !(await this.resourceIntroducersService.isIntroducer(resourceId, req.user.id, true))
    ) {
      throw new ForbiddenException('User cannot view this resource’s People tab');
    }
    return (await this.resourceIntroductionsService.getMany(resourceId, true)).map((record) =>
      mapResponse(ResourceIntroduction, record),
    );
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
    return mapResponse(
      ResourceIntroductionHistoryItem,
      await this.resourceIntroductionsService.grant(resourceId, userId, data, {
        performedByUserId: req.user.id,
        authenticationMethod: req.user.authenticationMethod,
        apiTokenId: req.user.apiTokenId,
      }),
    );
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
    return mapResponse(
      ResourceIntroductionHistoryItem,
      await this.resourceIntroductionsService.revoke(resourceId, userId, data, {
        performedByUserId: req.user.id,
        authenticationMethod: req.user.authenticationMethod,
        apiTokenId: req.user.apiTokenId,
      }),
    );
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
    @Param('userId', ParseIntPipe) userId: number,
  ): Promise<ResourceIntroductionHistoryItem[]> {
    return (await this.resourceIntroductionsService.getHistoryByResourceIdAndUserId(resourceId, userId)).map((record) =>
      mapResponse(ResourceIntroductionHistoryItem, record),
    );
  }
}
