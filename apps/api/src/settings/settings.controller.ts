import { Auth, AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';

import { Body, Controller, ForbiddenException, Get, Patch, Post, Req, Delete } from '@nestjs/common';

import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { auditActorOf } from '../audit/recorder/audit-event';

import { SettingsAdministrationService } from './settings-administration.service';
import { AuditSettingsDto, UpdateAuditSettingsDto } from './dto/audit-settings.dto';

import { FirstTimeSetupStatusDto } from './dto/first-time-setup-status.dto';

import { SystemSettingsDto } from './dto/system-settings.dto';
import { SystemLanguageDto } from './dto/system-language.dto';

import { UpdateSystemSettingsDto } from './dto/update-system-settings.dto';

import { SettingsService } from './settings.service';
import { GenerateMetricsApiKeyResponseDto } from './dto/generate-metrics-api-key-response.dto';

import { MetricsSettingsDto } from './dto/metrics-settings.dto';

import { UpdateMetricsSettingsDto } from './dto/update-metrics-settings.dto';

import { AuthRateLimitSettingsDto } from './dto/auth-rate-limit-settings.dto';

import { MessagingRateLimitSettingsDto } from './dto/messaging-rate-limit-settings.dto';

import { UpdateAuthRateLimitSettingsDto } from './dto/update-auth-rate-limit-settings.dto';

import { UpdateMessagingRateLimitSettingsDto } from './dto/update-messaging-rate-limit-settings.dto';

import { ResourceVisibilitySettingsDto } from './dto/resource-visibility-settings.dto';

import { UpdateResourceVisibilitySettingsDto } from './dto/update-resource-visibility-settings.dto';

@ApiTags('Settings')
@Controller('settings')
export class SettingsController {
  constructor(
    protected readonly settingsService: SettingsService,
    protected readonly administration: SettingsAdministrationService,
  ) {}

  @Get('language')
  @ApiOperation({ summary: 'Get the public system default language', operationId: 'getSystemLanguage' })
  @ApiResponse({ status: 200, type: SystemLanguageDto })
  async getSystemLanguage(): Promise<SystemLanguageDto> {
    return this.settingsService.getSystemLanguage();
  }

  @Get('audit')
  @Auth('system.settings.manage')
  @ApiResponse({ status: 200, type: AuditSettingsDto })
  getAuditSettings(): Promise<AuditSettingsDto> {
    return this.settingsService.getAuditSettings();
  }

  @Patch('audit')
  @Auth('system.settings.manage')
  @ApiBody({ type: UpdateAuditSettingsDto })
  @ApiResponse({ status: 200, type: AuditSettingsDto })
  // Keep raw JSON for strict schema validation: global implicit conversion coerces "false" to true.
  async updateAuditSettings(@Body() body: unknown, @Req() req: AuthenticatedRequest): Promise<AuditSettingsDto> {
    return this.administration.updateAuditSettings(body, auditActorOf(req.user));
  }

  @Get()
  @Auth('system.settings.manage')
  @ApiOperation({ summary: 'Get system settings', operationId: 'getSystemSettings' })
  @ApiResponse({ status: 200, description: 'Current system settings.', type: SystemSettingsDto })
  async getSystemSettings(): Promise<SystemSettingsDto> {
    return this.settingsService.getSystemSettings();
  }

  @Patch()
  @Auth('system.settings.manage')
  @ApiOperation({ summary: 'Update system settings', operationId: 'updateSystemSettings' })
  @ApiResponse({ status: 200, description: 'System settings updated.', type: SystemSettingsDto })
  async updateSystemSettings(
    @Body() body: UpdateSystemSettingsDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<SystemSettingsDto> {
    return this.administration.updateSystemSettings(body, auditActorOf(req.user));
  }

  @Get('first-time-setup')
  @ApiOperation({
    summary: 'Get first-time setup status',
    operationId: 'getFirstTimeSetupStatus',
    description:
      'Returns whether first-time setup is available and which wizard steps are already completed. Unauthenticated.',
  })
  @ApiResponse({
    status: 200,
    description: 'First-time setup status and steps completed.',
    type: FirstTimeSetupStatusDto,
  })
  async getFirstTimeSetupStatus(): Promise<FirstTimeSetupStatusDto> {
    return this.settingsService.getFirstTimeSetupStatus();
  }

  @Post('first-time-setup')
  @ApiOperation({ summary: 'Apply first-time setup settings', operationId: 'applyFirstTimeSetupSettings' })
  @ApiResponse({ status: 200, description: 'System settings updated.', type: SystemSettingsDto })
  @ApiResponse({ status: 403, description: 'First-time setup is not available.' })
  async applyFirstTimeSetupSettings(@Body() body: UpdateSystemSettingsDto): Promise<SystemSettingsDto> {
    const available = await this.settingsService.isFirstTimeSetupAvailable();
    if (!available) {
      throw new ForbiddenException('First-time setup is no longer available');
    }
    return this.settingsService.updateSystemSettings(body);
  }

  @Get('metrics')
  @Auth('system.settings.manage')
  @ApiOperation({ summary: 'Get metrics settings', operationId: 'getMetricsSettings' })
  @ApiResponse({ status: 200, description: 'Current metrics settings.', type: MetricsSettingsDto })
  async getMetricsSettings(): Promise<MetricsSettingsDto> {
    return this.administration.metricsSettings();
  }

  @Patch('metrics')
  @Auth('system.settings.manage')
  @ApiOperation({ summary: 'Update metrics settings', operationId: 'updateMetricsSettings' })
  @ApiResponse({ status: 200, description: 'Metrics settings updated.', type: MetricsSettingsDto })
  async updateMetricsSettings(
    @Body() body: UpdateMetricsSettingsDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<MetricsSettingsDto> {
    return this.administration.updateMetricsSettings(body, auditActorOf(req.user));
  }

  @Post('metrics/generate-api-key')
  @Auth('system.settings.manage')
  @ApiOperation({ summary: 'Generate a new metrics API key', operationId: 'generateMetricsApiKey' })
  @ApiResponse({ status: 201, description: 'Metrics API key generated.', type: GenerateMetricsApiKeyResponseDto })
  async generateMetricsApiKey(@Req() req: AuthenticatedRequest): Promise<GenerateMetricsApiKeyResponseDto> {
    return this.administration.generateMetricsApiKey(auditActorOf(req.user));
  }

  @Delete('metrics/api-key')
  @Auth('system.settings.manage')
  @ApiOperation({ summary: 'Remove the metrics API key', operationId: 'deleteMetricsApiKey' })
  @ApiResponse({ status: 200, description: 'Metrics API key removed.', type: MetricsSettingsDto })
  async deleteMetricsApiKey(@Req() req: AuthenticatedRequest): Promise<MetricsSettingsDto> {
    return this.administration.deleteMetricsApiKey(auditActorOf(req.user));
  }

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
    return this.administration.updateAuthRateLimitSettings(body, auditActorOf(req.user));
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
    return this.administration.updateMessagingRateLimitSettings(body, auditActorOf(req.user));
  }

  @Get('resources/visibility')
  @Auth('system.settings.manage')
  @ApiOperation({ summary: 'Get resource activity visibility settings', operationId: 'getResourceVisibilitySettings' })
  @ApiResponse({ status: 200, description: 'Current visibility settings.', type: ResourceVisibilitySettingsDto })
  async getResourceVisibilitySettings(): Promise<ResourceVisibilitySettingsDto> {
    return this.settingsService.getResourceVisibilitySettings();
  }

  @Patch('resources/visibility')
  @Auth('system.settings.manage')
  @ApiOperation({
    summary: 'Update resource activity visibility settings',
    operationId: 'updateResourceVisibilitySettings',
  })
  @ApiResponse({ status: 200, description: 'Visibility settings updated.', type: ResourceVisibilitySettingsDto })
  async updateResourceVisibilitySettings(
    @Body() body: UpdateResourceVisibilitySettingsDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<ResourceVisibilitySettingsDto> {
    return this.administration.updateResourceVisibilitySettings(body, auditActorOf(req.user));
  }
}
