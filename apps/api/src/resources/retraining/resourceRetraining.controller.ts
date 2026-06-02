import { Controller, Get, Param, ParseIntPipe, Req } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Auth, AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import { ResourceRetrainingService } from './resourceRetraining.service';
import { RetrainingStatusResponseDto } from './dtos/retrainingStatus.response.dto';

@ApiTags('Resources')
@Controller('resources/:resourceId/retraining')
export class ResourceRetrainingController {
  constructor(private readonly resourceRetrainingService: ResourceRetrainingService) {}

  @Get('status')
  @Auth()
  @ApiOperation({
    summary: 'Get the retraining status of the current user for a resource',
    operationId: 'resourceRetrainingGetStatus',
  })
  @ApiResponse({
    status: 200,
    description: 'Retraining status retrieved successfully.',
    type: RetrainingStatusResponseDto,
  })
  async getStatus(
    @Param('resourceId', ParseIntPipe) resourceId: number,
    @Req() req: AuthenticatedRequest,
  ): Promise<RetrainingStatusResponseDto> {
    const status = await this.resourceRetrainingService.getResourceRetrainingStatus(resourceId, req.user.id);
    return {
      hasIntroduction: status.hasIntroduction,
      applies: status.applies,
      isDue: status.isDue,
      blocksAccess: status.blocksAccess,
      dueAt: status.dueAt ? status.dueAt.toISOString() : null,
      reason: status.reason,
    };
  }
}
