import { Auth, AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import { Body, Controller, ForbiddenException, Get, Patch, Post, Req } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  auditSubjectKeyId,
  PreviousAuditSettings,
  recordAdministrationSafely,
  SETTING_KEYS,
} from '../audit/audit-administration-policy';
import { AuditService } from '../audit/audit.service';
import { installInheritedMethods } from '../common/inherited-implementation';
import { AuditSettingsDto, UpdateAuditSettingsDto } from './dto/audit-settings.dto';
import { FirstTimeSetupStatusDto } from './dto/first-time-setup-status.dto';
import { SystemSettingsDto } from './dto/system-settings.dto';
import { UpdateSystemSettingsDto } from './dto/update-system-settings.dto';
import { SettingsMetricsRoutes } from './settings-metrics.routes';
import { SettingsService } from './settings.service';
import { systemSettingChanges } from './system-setting-changes';

@ApiTags('Settings')
@Controller('settings')
export class SettingsController extends SettingsMetricsRoutes {
  constructor(
    protected readonly settingsService: SettingsService,
    protected readonly audit: AuditService,
  ) {
    super();
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

  protected async recordChanges(
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

  protected async recordSetting(
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

  protected async recordKey(req: AuthenticatedRequest, action: string, configured: number) {
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

installInheritedMethods(SettingsController, [
  'getAuditSettings',
  'updateAuditSettings',
  'getSystemSettings',
  'updateSystemSettings',
  'getFirstTimeSetupStatus',
  'getMetricsSettings',
  'updateMetricsSettings',
  'generateMetricsApiKey',
  'deleteMetricsApiKey',
  'buildMetricsSettings',
  'getAuthRateLimitSettings',
  'updateAuthRateLimitSettings',
  'getMessagingRateLimitSettings',
  'updateMessagingRateLimitSettings',
  'recordChanges',
  'recordSetting',
  'recordKey',
  'applyFirstTimeSetupSettings',
]);
