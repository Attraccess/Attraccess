import {
  recordAdministrationSafely,
  auditSubjectKeyId,
  PreviousAuditSettings,
} from '../audit/audit-administration-policy';
import { AuditSettingsDto, UpdateAuditSettingsDto } from './dto/audit-settings.dto';
import { Body, Controller, Delete, ForbiddenException, Get, Patch, Post, Req } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Auth, AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import { AuditService } from '../audit/audit.service';
import { safeAuditOrigin, safeAuditHost, safeAuditSender, SETTING_KEYS } from '../audit/audit-administration-policy';
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
  constructor(
    private readonly settingsService: SettingsService,
    private readonly audit: AuditService,
  ) {}

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
    const before = await this.settingsService.getAuditSettings();
    const after = await this.settingsService.updateAuditSettings(body);
    await this.recordChanges(req, 'audit', before, after, before);
    return after;
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
    const before = await this.settingsService.getSystemSettings();
    const after = await this.settingsService.updateSystemSettings(body);
    for (const [key, oldValue, newValue] of systemSettingChanges(before, after)) {
      await this.recordSetting(req, key, oldValue, newValue);
    }
    if (before.smtp.user !== after.smtp.user) await this.recordSetting(req, 'smtp.userChanged', 'false', 'true');
    // Record credential rotation without retaining either credential value.
    if (body.app?.licenseKey !== undefined) await this.recordSetting(req, 'app.licenseKeyChanged', 'false', 'true');
    if (body.smtp?.pass !== undefined) await this.recordSetting(req, 'smtp.passwordChanged', 'false', 'true');
    return after;
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
  async updateMetricsSettings(
    @Body() body: UpdateMetricsSettingsDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<MetricsSettingsDto> {
    const before = await this.buildMetricsSettings();
    if (body.toggles) {
      await this.settingsService.updateMetricsToggles(body.toggles);
    }
    if (body.slowQueryThresholdSeconds !== undefined) {
      await this.settingsService.setMetricsSlowQueryThresholdSeconds(body.slowQueryThresholdSeconds);
    }
    const after = await this.buildMetricsSettings();
    await this.recordChanges(req, 'metrics', before, after);
    await this.recordChanges(req, 'metrics.toggles', before.toggles, after.toggles);
    return after;
  }

  @Post('metrics/generate-api-key')
  @Auth('system.settings.manage')
  @ApiOperation({ summary: 'Generate a new metrics API key', operationId: 'generateMetricsApiKey' })
  @ApiResponse({ status: 201, description: 'Metrics API key generated.', type: GenerateMetricsApiKeyResponseDto })
  async generateMetricsApiKey(@Req() req: AuthenticatedRequest): Promise<GenerateMetricsApiKeyResponseDto> {
    const { apiKey } = await this.settingsService.generateMetricsApiKey();
    await this.recordKey(req, 'settings.api_key.generated', 1);
    return { apiKeyConfigured: true, apiKey };
  }

  @Delete('metrics/api-key')
  @Auth('system.settings.manage')
  @ApiOperation({ summary: 'Remove the metrics API key', operationId: 'deleteMetricsApiKey' })
  @ApiResponse({ status: 200, description: 'Metrics API key removed.', type: MetricsSettingsDto })
  async deleteMetricsApiKey(@Req() req: AuthenticatedRequest): Promise<MetricsSettingsDto> {
    await this.settingsService.setMetricsApiKey(null);
    await this.recordKey(req, 'settings.api_key.deleted', 0);
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

  private async recordChanges(
    req: AuthenticatedRequest,
    prefix: string,
    before: object,
    after: object,
    previousAuditSettings?: PreviousAuditSettings,
  ) {
    for (const key of SETTING_KEYS.filter((key) => key.startsWith(`${prefix}.`))) {
      const field = key.slice(prefix.length + 1);
      if (field.includes('.')) continue;
      const oldValue = Object.getOwnPropertyDescriptor(before, field)?.value;
      const newValue = Object.getOwnPropertyDescriptor(after, field)?.value;
      if (oldValue === undefined || newValue === undefined) continue;
      const oldText = Array.isArray(oldValue) ? oldValue.join(',') : String(oldValue);
      const newText = Array.isArray(newValue) ? newValue.join(',') : String(newValue);
      if (oldText !== newText) await this.recordSetting(req, key, oldText, newText, previousAuditSettings);
    }
  }

  private async recordSetting(
    req: AuthenticatedRequest,
    key: string,
    before: string,
    after: string,
    previousAuditSettings?: PreviousAuditSettings,
  ) {
    await recordAdministrationSafely(
      this.audit,
      {
        action: 'settings.updated',
        actorId: req.user.id,
        authenticationMethod: req.user.authenticationMethod,
        apiTokenId: req.user.apiTokenId,
        subjectType: 'setting',
        subjectId: auditSubjectKeyId(key),
        details: { settingKey: key, before, after },
      },
      previousAuditSettings,
    );
  }

  private async recordKey(req: AuthenticatedRequest, action: string, configured: number) {
    await recordAdministrationSafely(this.audit, {
      action,
      actorId: req.user.id,
      authenticationMethod: req.user.authenticationMethod,
      apiTokenId: req.user.apiTokenId,
      subjectType: 'setting',
      subjectId: auditSubjectKeyId('metrics.apiKeyConfigured'),
      details: { settingKey: 'metrics.apiKeyConfigured', configured },
    });
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

function systemSettingChanges(before: SystemSettingsDto, after: SystemSettingsDto): Array<[string, string, string]> {
  const values = [
    ['app.url', safeAuditOrigin(before.app.url ?? ''), safeAuditOrigin(after.app.url ?? '')],
    [
      'app.publicInternetUrl',
      safeAuditOrigin(before.app.publicInternetUrl ?? ''),
      safeAuditOrigin(after.app.publicInternetUrl ?? ''),
    ],
    ['app.licenseKeyConfigured', before.app.licenseKeyConfigured, after.app.licenseKeyConfigured],
    ['app.attractapLanguage', before.app.attractapLanguage, after.app.attractapLanguage],
    ['smtp.service', before.smtp.service, after.smtp.service],
    ['smtp.host', safeAuditHost(before.smtp.host ?? ''), safeAuditHost(after.smtp.host ?? '')],
    ['smtp.port', before.smtp.port, after.smtp.port],
    ['smtp.secure', before.smtp.secure, after.smtp.secure],
    ['smtp.from', safeAuditSender(before.smtp.from ?? ''), safeAuditSender(after.smtp.from ?? '')],
    ['smtp.userConfigured', !!before.smtp.user, !!after.smtp.user],
    ['smtp.passConfigured', before.smtp.passConfigured, after.smtp.passConfigured],
  ] as const;
  return values
    .filter(
      ([key, oldValue, newValue]) =>
        oldValue !== newValue ||
        (key === 'app.url' && before.app.url !== after.app.url) ||
        (key === 'app.publicInternetUrl' && before.app.publicInternetUrl !== after.app.publicInternetUrl),
    )
    .map(([key, oldValue, newValue]) => [key, String(oldValue ?? ''), String(newValue ?? '')]);
}
