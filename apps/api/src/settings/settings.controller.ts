import { AuditSettingsDto, UpdateAuditSettingsDto } from './dto/audit-settings.dto';
import { Body, Controller, Delete, ForbiddenException, Get, Patch, Post } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Auth } from '@attraccess/plugins-backend-sdk';
import { SettingsService } from './settings.service';
import { FirstTimeSetupStatusDto } from './dto/first-time-setup-status.dto';
import { SystemSettingsDto } from './dto/system-settings.dto';
import { UpdateSystemSettingsDto } from './dto/update-system-settings.dto';
import { MetricsSettingsDto } from './dto/metrics-settings.dto';
import { UpdateMetricsSettingsDto } from './dto/update-metrics-settings.dto';
import { GenerateMetricsApiKeyResponseDto } from './dto/generate-metrics-api-key-response.dto';
import { AuthRateLimitSettingsDto } from './dto/auth-rate-limit-settings.dto';
import { UpdateAuthRateLimitSettingsDto } from './dto/update-auth-rate-limit-settings.dto';
import { MessagingRateLimitSettingsDto } from './dto/messaging-rate-limit-settings.dto';
import { UpdateMessagingRateLimitSettingsDto } from './dto/update-messaging-rate-limit-settings.dto';

@ApiTags('Settings')
@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

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
  updateAuditSettings(@Body() body: unknown): Promise<AuditSettingsDto> {
    return this.settingsService.updateAuditSettings(body);
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
  async updateSystemSettings(@Body() body: UpdateSystemSettingsDto): Promise<SystemSettingsDto> {
    return this.settingsService.updateSystemSettings(body);
  }

  @Get('first-time-setup')
  @ApiOperation({
    summary: 'Get first-time setup status',
    operationId: 'getFirstTimeSetupStatus',
    description:
      'Returns whether first-time setup is available and which wizard steps are already completed. Unauthenticated.',
  })
  @ApiResponse({ status: 200, description: 'First-time setup status and steps completed.', type: FirstTimeSetupStatusDto })
  async getFirstTimeSetupStatus(): Promise<FirstTimeSetupStatusDto> {
    return this.settingsService.getFirstTimeSetupStatus();
  }

  @Get('metrics')
  @Auth('system.settings.manage')
  @ApiOperation({ summary: 'Get metrics settings', operationId: 'getMetricsSettings' })
  @ApiResponse({ status: 200, description: 'Current metrics settings.', type: MetricsSettingsDto })
  async getMetricsSettings(): Promise<MetricsSettingsDto> {
    return this.buildMetricsSettings();
  }

  @Patch('metrics')
  @Auth('system.settings.manage')
  @ApiOperation({ summary: 'Update metrics settings', operationId: 'updateMetricsSettings' })
  @ApiResponse({ status: 200, description: 'Metrics settings updated.', type: MetricsSettingsDto })
  async updateMetricsSettings(@Body() body: UpdateMetricsSettingsDto): Promise<MetricsSettingsDto> {
    if (body.toggles) {
      await this.settingsService.updateMetricsToggles(body.toggles);
    }
    if (body.slowQueryThresholdSeconds !== undefined) {
      await this.settingsService.setMetricsSlowQueryThresholdSeconds(body.slowQueryThresholdSeconds);
    }
    return this.buildMetricsSettings();
  }

  @Post('metrics/generate-api-key')
  @Auth('system.settings.manage')
  @ApiOperation({ summary: 'Generate a new metrics API key', operationId: 'generateMetricsApiKey' })
  @ApiResponse({ status: 201, description: 'Metrics API key generated.', type: GenerateMetricsApiKeyResponseDto })
  async generateMetricsApiKey(): Promise<GenerateMetricsApiKeyResponseDto> {
    const { apiKey } = await this.settingsService.generateMetricsApiKey();
    return { apiKeyConfigured: true, apiKey };
  }

  @Delete('metrics/api-key')
  @Auth('system.settings.manage')
  @ApiOperation({ summary: 'Remove the metrics API key', operationId: 'deleteMetricsApiKey' })
  @ApiResponse({ status: 200, description: 'Metrics API key removed.', type: MetricsSettingsDto })
  async deleteMetricsApiKey(): Promise<MetricsSettingsDto> {
    await this.settingsService.setMetricsApiKey(null);
    return this.buildMetricsSettings();
  }

  private async buildMetricsSettings(): Promise<MetricsSettingsDto> {
    const [{ configured }, toggles, slowQueryThresholdSeconds] = await Promise.all([
      this.settingsService.getMetricsApiKey(),
      this.settingsService.getMetricsToggles(),
      this.settingsService.getMetricsSlowQueryThresholdSeconds(),
    ]);
    return { apiKeyConfigured: configured, toggles, slowQueryThresholdSeconds };
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
  ): Promise<AuthRateLimitSettingsDto> {
    return this.settingsService.updateAuthRateLimitSettings(body);
  }

  @Get('messaging/rate-limit')
  @Auth('system.settings.manage')
  @ApiOperation({ summary: 'Get messaging rate-limit settings', operationId: 'getMessagingRateLimitSettings' })
  @ApiResponse({ status: 200, description: 'Current messaging rate-limit settings.', type: MessagingRateLimitSettingsDto })
  async getMessagingRateLimitSettings(): Promise<MessagingRateLimitSettingsDto> {
    return this.settingsService.getMessagingRateLimitSettings();
  }

  @Patch('messaging/rate-limit')
  @Auth('system.settings.manage')
  @ApiOperation({ summary: 'Update messaging rate-limit settings', operationId: 'updateMessagingRateLimitSettings' })
  @ApiResponse({ status: 200, description: 'Messaging rate-limit settings updated.', type: MessagingRateLimitSettingsDto })
  async updateMessagingRateLimitSettings(
    @Body() body: UpdateMessagingRateLimitSettingsDto,
  ): Promise<MessagingRateLimitSettingsDto> {
    return this.settingsService.updateMessagingRateLimitSettings(body);
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
}
