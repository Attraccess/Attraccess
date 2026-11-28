import { BadRequestException, Body, Controller, Get, Patch, Req } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Auth, AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import { DashboardPinsService } from './dashboard-pins.service';
import { ResourceListVisibilityService } from '../resources/visibility/resource-list-visibility.service';
import { DashboardPinDto, UpdateDashboardPinsDto } from './dtos/dashboard-pin.dto';

@ApiTags('Dashboard')
@Controller('dashboard/pins')
export class DashboardPinsController {
  constructor(
    private readonly pinsService: DashboardPinsService,
    private readonly listVisibility: ResourceListVisibilityService,
  ) {}

  /** Pins of machines the user may not see are kept (they return with an introduction) but never sent (ATT-843). */
  private async onlyVisible(req: AuthenticatedRequest, pins: DashboardPinDto[]): Promise<DashboardPinDto[]> {
    const ids = pins.filter((pin) => pin.itemType === 'resource').map((pin) => Number(pin.itemId));
    const visible = new Set(await this.listVisibility.filterVisible(req.user, ids));
    return pins.filter((pin) => pin.itemType !== 'resource' || visible.has(Number(pin.itemId)));
  }

  @Get()
  @Auth()
  @ApiOperation({ summary: 'Get the authenticated user dashboard pins in order', operationId: 'dashboardGetPins' })
  @ApiResponse({ status: 200, type: DashboardPinDto, isArray: true })
  async getPins(@Req() req: AuthenticatedRequest): Promise<DashboardPinDto[]> {
    return this.onlyVisible(req, await this.pinsService.getPins(req.user.id));
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
    const item = dto.item;
    if (
      dto.kind === 'add' &&
      item.itemType === 'resource' &&
      !(await this.listVisibility.canSee(req.user, Number(item.itemId)))
    ) {
      // Same answer as for a machine that does not exist.
      throw new BadRequestException(`Resource ${item.itemId} does not exist`);
    }
    return this.onlyVisible(req, await this.pinsService.updatePins(req.user.id, dto));
  }
}
