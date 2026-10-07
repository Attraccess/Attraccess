import { Auth, AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import { Body, Delete, Get, Patch, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';
import { GenerateMetricsApiKeyResponseDto } from './dto/generate-metrics-api-key-response.dto';
import { MetricsSettingsDto } from './dto/metrics-settings.dto';
import { UpdateMetricsSettingsDto } from './dto/update-metrics-settings.dto';
import { SettingsRateLimitRoutes } from './settings-rate-limit.routes';
export abstract class SettingsMetricsRoutes extends SettingsRateLimitRoutes {
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

  protected async buildMetricsSettings(): Promise<MetricsSettingsDto> {
    const [{ configured }, toggles, slowQueryThresholdSeconds] = await Promise.all([
      this.settingsService.getMetricsApiKey(),
      this.settingsService.getMetricsToggles(),
      this.settingsService.getMetricsSlowQueryThresholdSeconds(),
    ]);
    return { apiKeyConfigured: configured, toggles, slowQueryThresholdSeconds };
  }
}
