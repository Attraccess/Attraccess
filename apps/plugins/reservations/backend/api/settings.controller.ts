import { Auth, type AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import { Body, Controller, Get, Inject, Param, ParseIntPipe, Put, Req } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { AccessService } from '../reservations/access.service';
import { ReservationError } from '../reservations/errors';
import { DirectoryService } from '../reservations/directory.service';
import { SettingsAdminService } from '../settings/settings-admin.service';
import type { ResourceSettings } from '../settings/settings.model';
import { UpdateGlobalSettingsBody, UpdateResourceSettingsBody } from './dto.request';
import {
  FutureBookingsCountDto,
  GlobalSettingsDto,
  ManagerAccessDto,
  ResourceSettingsDto,
  UpdatedResourceSettingsDto,
} from './dto.response';
import { validated } from './pipes';
import { ApiReservationErrors, principalOf } from './support';

const RESOURCE_ID = { name: 'resourceId', type: Number } as const;

function toDto(settings: ResourceSettings): ResourceSettingsDto {
  return settings as unknown as ResourceSettingsDto;
}

@ApiTags('Reservations')
@Auth()
@Controller('reservations')
export class ReservationSettingsController {
  constructor(
    @Inject(SettingsAdminService) private readonly admin: SettingsAdminService,
    @Inject(AccessService) private readonly access: AccessService,
    @Inject(DirectoryService) private readonly directory: DirectoryService,
  ) {}

  @Get('resources/:resourceId/manager-access')
  @ApiOperation({ summary: 'Whether the caller manages the resource (may edit its reservation settings)' })
  @ApiParam(RESOURCE_ID)
  @ApiOkResponse({ type: ManagerAccessDto })
  @ApiReservationErrors({ notFound: true })
  async managerAccess(
    @Param('resourceId', ParseIntPipe) resourceId: number,
    @Req() request: AuthenticatedRequest,
  ): Promise<ManagerAccessDto> {
    if (!(await this.directory.getResource(resourceId)))
      throw new ReservationError('RESOURCE_NOT_FOUND', 'Resource not found');
    return { isManager: await this.access.isManager(principalOf(request), resourceId) };
  }

  @Get('resources/:resourceId/settings')
  @ApiOperation({ summary: 'Reservation settings of a resource (managers only)' })
  @ApiParam(RESOURCE_ID)
  @ApiOkResponse({ type: ResourceSettingsDto })
  @ApiReservationErrors({ forbidden: true, notFound: true })
  async getSettings(
    @Param('resourceId', ParseIntPipe) resourceId: number,
    @Req() request: AuthenticatedRequest,
  ): Promise<ResourceSettingsDto> {
    return toDto(await this.admin.getForManager(principalOf(request), resourceId));
  }

  @Get('resources/:resourceId/settings/future-bookings-count')
  @ApiOperation({ summary: 'Number of future pending/confirmed bookings that disabling reservations would affect' })
  @ApiParam(RESOURCE_ID)
  @ApiOkResponse({ type: FutureBookingsCountDto })
  @ApiReservationErrors({ forbidden: true, notFound: true })
  async futureBookingsCount(
    @Param('resourceId', ParseIntPipe) resourceId: number,
    @Req() request: AuthenticatedRequest,
  ): Promise<FutureBookingsCountDto> {
    return { count: await this.admin.futureBookingsCount(principalOf(request), resourceId) };
  }

  @Put('resources/:resourceId/settings')
  @ApiOperation({
    summary: 'Update the reservation settings of a resource (managers only)',
    description:
      'Partial update. Settings only affect new bookings. Disabling with future bookings requires cancelFutureBookings (409 FUTURE_BOOKINGS_EXIST otherwise).',
  })
  @ApiParam(RESOURCE_ID)
  @ApiBody({ type: UpdateResourceSettingsBody })
  @ApiOkResponse({ type: UpdatedResourceSettingsDto })
  @ApiReservationErrors({ badRequest: true, forbidden: true, notFound: true, conflict: ['FUTURE_BOOKINGS_EXIST'] })
  async updateSettings(
    @Param('resourceId', ParseIntPipe) resourceId: number,
    @Body(validated(UpdateResourceSettingsBody)) body: UpdateResourceSettingsBody,
    @Req() request: AuthenticatedRequest,
  ): Promise<UpdatedResourceSettingsDto> {
    const result = await this.admin.update(principalOf(request), resourceId, body as never);
    return { settings: toDto(result.settings), cancelledBookings: result.cancelledBookings };
  }

  @Get('settings/global')
  @ApiOperation({ summary: 'Plugin-wide settings (timezone); any signed-in user' })
  @ApiOkResponse({ type: GlobalSettingsDto })
  getGlobal(): Promise<GlobalSettingsDto> {
    return this.admin.getGlobal();
  }

  @Put('settings/global')
  @Auth('system.settings.manage')
  @ApiOperation({ summary: 'Update plugin-wide settings (requires system.settings.manage)' })
  @ApiBody({ type: UpdateGlobalSettingsBody })
  @ApiOkResponse({ type: GlobalSettingsDto })
  @ApiReservationErrors({ badRequest: true })
  updateGlobal(
    @Body(validated(UpdateGlobalSettingsBody)) body: UpdateGlobalSettingsBody,
    @Req() request: AuthenticatedRequest,
  ): Promise<GlobalSettingsDto> {
    return this.admin.setTimezone(principalOf(request), body.timezone);
  }
}
