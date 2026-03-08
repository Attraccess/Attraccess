import { BadRequestException, Body, Controller, ForbiddenException, Get, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Auth } from '@attraccess/plugins-backend-sdk';
import { SettingsService } from './settings.service';
import { FirstTimeSetupStatusDto } from './dto/first-time-setup-status.dto';
import { SystemSettingsDto } from './dto/system-settings.dto';
import { UpdateSystemSettingsDto } from './dto/update-system-settings.dto';
import { UpdateSmtpSettingsDto } from './dto/update-smtp-settings.dto';

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

  @Post('test-email')
  @Auth('canManageSystemConfiguration')
  @ApiOperation({
    summary: 'Test SMTP settings by sending a test email',
    operationId: 'testSmtpSettings',
    description: 'Sends a test email to the configured FROM address to verify that SMTP settings are correct and the server is reachable.',
  })
  @ApiResponse({ status: 200, description: 'Test email sent successfully.' })
  @ApiResponse({ status: 400, description: 'SMTP connection or email sending failed.' })
  async testSmtpSettings(@Body() body: UpdateSmtpSettingsDto): Promise<void> {
    try {
      await this.settingsService.testSmtpConnection(body);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'SMTP test failed');
    }
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
