import { Body, Controller, Get, NotFoundException, Param, ParseIntPipe, Post, Put, Req } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Auth, AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import { LicenseModuleType } from '../license/license.service';
import { RequiresLicense } from '../license/require-license.decorator';
import { ResourcesService } from '../resources/resources.service';
import { AttractapService } from './attractap.service';
import { ReaderUiAlertsService } from '../plugin-system/reader-ui/reader-ui-alerts.service';
import { ReaderUiSettingsService } from '../plugin-system/reader-ui/reader-ui-settings.service';
import {
  ReaderReaderUiSettingsDto,
  ReaderUiAlertDto,
  ReaderUiContributionStatusDto,
  ResourceReaderUiSettingsDto,
} from './dtos/reader-ui-settings.dto';
import { UiSlotService } from './websockets/handlers/ui/ui-slot.service';

/** Admin side of the reader UI: settings, contribution status and alerts (ATT-1187 phase A). */
@ApiTags('Attractap')
@Controller()
@RequiresLicense(LicenseModuleType.ATTRACTAP)
export class ReaderUiAdminController {
  constructor(
    private readonly settings: ReaderUiSettingsService,
    private readonly alerts: ReaderUiAlertsService,
    private readonly slots: UiSlotService,
    private readonly resources: ResourcesService,
    private readonly readers: AttractapService,
  ) {}

  private async requireResource(resourceId: number): Promise<void> {
    // Throws ResourceNotFoundException (404) for an unknown id.
    await this.resources.getResourceById(resourceId);
  }

  private async requireReader(readerId: number): Promise<void> {
    if (!(await this.readers.findReaderById(readerId))) throw new NotFoundException(`Reader ${readerId} not found`);
  }

  @Get('resources/:resourceId/reader-ui-settings')
  @Auth('resources.update')
  @ApiOperation({ summary: 'Reader UI settings of a resource', operationId: 'getResourceReaderUiSettings' })
  @ApiResponse({ status: 200, type: ResourceReaderUiSettingsDto })
  async getResourceSettings(
    @Param('resourceId', ParseIntPipe) resourceId: number,
  ): Promise<ResourceReaderUiSettingsDto> {
    await this.requireResource(resourceId);
    return this.settings.getResource(resourceId);
  }

  @Put('resources/:resourceId/reader-ui-settings')
  @Auth('resources.update')
  @ApiOperation({ summary: 'Update reader UI settings of a resource', operationId: 'updateResourceReaderUiSettings' })
  @ApiResponse({ status: 200, type: ResourceReaderUiSettingsDto })
  async updateResourceSettings(
    @Param('resourceId', ParseIntPipe) resourceId: number,
    @Body() dto: ResourceReaderUiSettingsDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<ResourceReaderUiSettingsDto> {
    await this.requireResource(resourceId);
    await this.settings.setResource(resourceId, dto, req.user.id);
    this.slots.syncReader(undefined);
    return this.settings.getResource(resourceId);
  }

  @Get('attractap/readers/:readerId/reader-ui-settings')
  @Auth('resources.update')
  @ApiOperation({ summary: 'Reader UI settings of a reader', operationId: 'getReaderReaderUiSettings' })
  @ApiResponse({ status: 200, type: ReaderReaderUiSettingsDto })
  async getReaderSettings(@Param('readerId', ParseIntPipe) readerId: number): Promise<ReaderReaderUiSettingsDto> {
    await this.requireReader(readerId);
    return this.settings.getReader(readerId);
  }

  @Put('attractap/readers/:readerId/reader-ui-settings')
  @Auth('resources.update')
  @ApiOperation({ summary: 'Update reader UI settings of a reader', operationId: 'updateReaderReaderUiSettings' })
  @ApiResponse({ status: 200, type: ReaderReaderUiSettingsDto })
  async updateReaderSettings(
    @Param('readerId', ParseIntPipe) readerId: number,
    @Body() dto: ReaderReaderUiSettingsDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<ReaderReaderUiSettingsDto> {
    await this.requireReader(readerId);
    await this.settings.setReader(readerId, dto.widgetsEnabled, req.user.id);
    this.slots.syncReader(readerId);
    return this.settings.getReader(readerId);
  }

  @Get('attractap/readers/:readerId/reader-ui/contributions')
  @Auth('resources.update')
  @ApiOperation({
    summary: 'What each plugin contribution did on a reader: rendered, degraded or skipped with a reason',
    operationId: 'getReaderUiContributions',
  })
  @ApiResponse({ status: 200, type: [ReaderUiContributionStatusDto] })
  async getContributions(@Param('readerId', ParseIntPipe) readerId: number): Promise<ReaderUiContributionStatusDto[]> {
    await this.requireReader(readerId);
    return this.slots.contributionsOf(readerId);
  }

  @Get('reader-ui/alerts')
  @Auth('resources.update')
  @ApiOperation({ summary: 'Open reader UI alerts', operationId: 'getReaderUiAlerts' })
  @ApiResponse({ status: 200, type: [ReaderUiAlertDto] })
  getAlerts(): Promise<ReaderUiAlertDto[]> {
    return this.alerts.listOpen();
  }

  @Post('reader-ui/alerts/:alertId/clear')
  @Auth('resources.update')
  @ApiOperation({
    summary: 'Clear a reader UI alert (resets a circuit breaker or a crash-loop suspension)',
    operationId: 'clearReaderUiAlert',
  })
  @ApiResponse({ status: 200, type: ReaderUiAlertDto })
  async clearAlert(
    @Param('alertId', ParseIntPipe) alertId: number,
    @Req() req: AuthenticatedRequest,
  ): Promise<ReaderUiAlertDto> {
    const cleared = await this.alerts.clear(alertId, req.user.id);
    if (!cleared) throw new NotFoundException('Alert not found or already cleared');
    return cleared;
  }
}
