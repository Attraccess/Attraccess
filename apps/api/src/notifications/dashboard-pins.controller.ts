import { Body, Controller, Get, Patch, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Auth, AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import { DashboardPinItem, DashboardPinsService } from './dashboard-pins.service';
import { UpdateDashboardPinsDto } from './dtos/dashboard-pins.dto';

@ApiTags('Dashboard')
@Controller('dashboard/pins')
@Auth()
export class DashboardPinsController {
  constructor(private readonly service: DashboardPinsService) {}
  @Get()
  @ApiOperation({ summary: 'Get ordered pins for the authenticated user', operationId: 'dashboardGetPins' })
  get(@Req() req: AuthenticatedRequest): Promise<DashboardPinItem[]> { return this.service.get(req.user.id); }
  @Patch()
  @ApiOperation({ summary: 'Replace ordered pins for the authenticated user', operationId: 'dashboardUpdatePins' })
  update(@Req() req: AuthenticatedRequest, @Body() body: UpdateDashboardPinsDto): Promise<DashboardPinItem[]> {
    return this.service.replace(req.user.id, body?.items, body?.operation);
  }
}
