import { Body, Controller, ForbiddenException, Get, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Auth } from '@attraccess/plugins-backend-sdk';
import { SettingsService } from './settings.service';
import { FirstTimeSetupStatusDto } from './dto/first-time-setup-status.dto';
import { SystemSettingsDto } from './dto/system-settings.dto';
import { UpdateSystemSettingsDto } from './dto/update-system-settings.dto';
import { MetricsSettingsDto } from './dto/metrics-settings.dto';
import { UpdateMetricsSettingsDto } from './dto/update-metrics-settings.dto';

@ApiTags('Settings')
@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  @Auth('canManageSystemConfiguration')
  @ApiOperation({ summary: 'Get system settings', operationId: 'getSystemSettings' })
  @ApiResponse({ status: 200, description: 'Current system settings.', type: SystemSettingsDto })
  async getSystemSettings(): Promise<SystemSettingsDto> {
    return this.settingsService.getSystemSettings();
  }

  @Patch()
  @Auth('canManageSystemConfiguration')
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
  @Auth('canManageSystemConfiguration')
  @ApiOperation({ summary: 'Get metrics settings', operationId: 'getMetricsSettings' })
  @ApiResponse({ status: 200, description: 'Current metrics settings.', type: MetricsSettingsDto })
  async getMetricsSettings(): Promise<MetricsSettingsDto> {
    const { configured } = await this.settingsService.getMetricsApiKey();
    return { apiKeyConfigured: configured };
  }

  @Patch('metrics')
  @Auth('canManageSystemConfiguration')
  @ApiOperation({ summary: 'Update metrics settings', operationId: 'updateMetricsSettings' })
  @ApiResponse({ status: 200, description: 'Metrics settings updated.', type: MetricsSettingsDto })
  async updateMetricsSettings(@Body() body: UpdateMetricsSettingsDto): Promise<MetricsSettingsDto> {
    await this.settingsService.setMetricsApiKey(body.apiKey || null);
    const { configured } = await this.settingsService.getMetricsApiKey();
    return { apiKeyConfigured: configured };
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
