import { Auth, AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import { Body, Get, Patch, Req } from '@nestjs/common';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AuthRateLimitSettingsDto } from './dto/auth-rate-limit-settings.dto';
import { MessagingRateLimitSettingsDto } from './dto/messaging-rate-limit-settings.dto';
import { UpdateAuthRateLimitSettingsDto } from './dto/update-auth-rate-limit-settings.dto';
import { UpdateMessagingRateLimitSettingsDto } from './dto/update-messaging-rate-limit-settings.dto';
import { SettingsControllerRouteContext } from './settings.controller.route-context';
export abstract class SettingsRateLimitRoutes extends SettingsControllerRouteContext {
  @Get('auth/rate-limit')
  @Auth('system.settings.manage')
  @ApiOperation({ summary: 'Get auth rate-limit settings', operationId: 'getAuthRateLimitSettings' })
  @ApiResponse({ status: 200, description: 'Current auth rate-limit settings.', type: AuthRateLimitSettingsDto })
  async getAuthRateLimitSettings(): Promise<AuthRateLimitSettingsDto> {
    return this.settingsService.getAuthRateLimitSettings();
  }

  @Patch('auth/rate-limit')
  @Auth('system.settings.manage')
  @ApiOperation({ summary: 'Update auth rate-limit settings', operationId: 'updateAuthRateLimitSettings' })
  @ApiResponse({ status: 200, description: 'Auth rate-limit settings updated.', type: AuthRateLimitSettingsDto })
  async updateAuthRateLimitSettings(
    @Body() body: UpdateAuthRateLimitSettingsDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<AuthRateLimitSettingsDto> {
    const before = await this.settingsService.getAuthRateLimitSettings();
    const after = await this.settingsService.updateAuthRateLimitSettings(body);
    await this.recordChanges(req, 'auth.rateLimit', before, after);
    return after;
  }

  @Get('messaging/rate-limit')
  @Auth('system.settings.manage')
  @ApiOperation({ summary: 'Get messaging rate-limit settings', operationId: 'getMessagingRateLimitSettings' })
  @ApiResponse({
    status: 200,
    description: 'Current messaging rate-limit settings.',
    type: MessagingRateLimitSettingsDto,
  })
  async getMessagingRateLimitSettings(): Promise<MessagingRateLimitSettingsDto> {
    return this.settingsService.getMessagingRateLimitSettings();
  }

  @Patch('messaging/rate-limit')
  @Auth('system.settings.manage')
  @ApiOperation({ summary: 'Update messaging rate-limit settings', operationId: 'updateMessagingRateLimitSettings' })
  @ApiResponse({
    status: 200,
    description: 'Messaging rate-limit settings updated.',
    type: MessagingRateLimitSettingsDto,
  })
  async updateMessagingRateLimitSettings(
    @Body() body: UpdateMessagingRateLimitSettingsDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<MessagingRateLimitSettingsDto> {
    const before = await this.settingsService.getMessagingRateLimitSettings();
    const after = await this.settingsService.updateMessagingRateLimitSettings(body);
    await this.recordChanges(req, 'messaging.rateLimit', before, after);
    return after;
  }
}
