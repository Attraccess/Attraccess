import { Body, Controller, Get, Patch, Req } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Auth, AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import { DashboardPinsService } from './dashboard-pins.service';
import { DashboardPinDto, UpdateDashboardPinsDto } from './dtos/dashboard-pin.dto';

@ApiTags('Dashboard')
@Controller('dashboard/pins')
export class DashboardPinsController {
  constructor(private readonly pinsService: DashboardPinsService) {}

  @Get()
  @Auth()
  @ApiOperation({ summary: 'Get the authenticated user dashboard pins in order', operationId: 'dashboardGetPins' })
  @ApiResponse({ status: 200, type: DashboardPinDto, isArray: true })
  async getPins(@Req() req: AuthenticatedRequest): Promise<DashboardPinDto[]> {
    return this.pinsService.getPins(req.user.id);
  }

  @Patch()
  @Auth()
  @ApiOperation({
    summary: 'Add, remove, move or resize one dashboard pin of the authenticated user',
    operationId: 'dashboardUpdatePins',
  })
  @ApiResponse({ status: 200, type: DashboardPinDto, isArray: true })
  @ApiResponse({ status: 400, description: 'Invalid operation, item that cannot be pinned, or too many pins' })
  async updatePins(@Req() req: AuthenticatedRequest, @Body() dto: UpdateDashboardPinsDto): Promise<DashboardPinDto[]> {
    return this.pinsService.updatePins(req.user.id, dto);
  }
}
