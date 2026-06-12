import { Body, Controller, Get, Patch, Req, Sse } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Auth, AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import { Observable } from 'rxjs';
import { NotificationPreferenceService } from './notification-preference.service';
import { NotificationPreferencesDto } from './dtos/notification-preferences.dto';
import { UpdateNotificationPreferencesDto } from './dtos/update-notification-preferences.dto';
import { NotificationLiveService } from './notification-live.service';
import { SseInstrumentation } from '../metrics/instrumentation/sse/sse.helper';
import { SystemNotificationLiveEventDto } from './dtos/system-notification-live-event.dto';

@ApiTags('Notifications')
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly preferenceService: NotificationPreferenceService,
    private readonly liveService: NotificationLiveService,
    private readonly sse: SseInstrumentation,
  ) {}

  @Sse('live')
  @Auth()
  @ApiOperation({ summary: 'Subscribe to live system notifications', operationId: 'notificationsLive' })
  streamNotifications(@Req() req: AuthenticatedRequest): Observable<{ data: SystemNotificationLiveEventDto }> {
    const subject = this.liveService.getUserSubject(req.user.id);
    return this.sse.wrap('notifications', subject.asObservable());
  }

  @Get('preferences')
  @Auth()
  @ApiOperation({ summary: 'Get the authenticated user notification preferences', operationId: 'notificationsGetPreferences' })
  @ApiResponse({ status: 200, type: NotificationPreferencesDto })
  async getPreferences(@Req() req: AuthenticatedRequest): Promise<NotificationPreferencesDto> {
    return this.preferenceService.getPreferences(req.user.id);
  }

  @Patch('preferences')
  @Auth()
  @ApiOperation({ summary: 'Update one notification category preference', operationId: 'notificationsUpdatePreferences' })
  @ApiResponse({ status: 200, type: NotificationPreferencesDto })
  async updatePreferences(
    @Req() req: AuthenticatedRequest,
    @Body() dto: UpdateNotificationPreferencesDto,
  ): Promise<NotificationPreferencesDto> {
    return this.preferenceService.updatePreferences(req.user.id, dto);
  }
}
