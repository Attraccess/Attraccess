import { BadRequestException, Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Auth } from '@attraccess/plugins-backend-sdk';
import { ResourceOperatingAttributionSummary } from './resource-operating-attribution.service';
import { ResourceOperatingDiagnosticsService } from './resource-operating-diagnostics.service';
import { OperatingDiagnosticsPageQueryDto, OperatingDiagnosticsRangeQueryDto } from './dtos/operating-diagnostics-query.dto';
import {
  OperatingDataQualityReportDto,
  OperatingStateDto,
  OperatingTimelineVerificationDto,
  OperatingTransitionPageDto,
  OperatingUnattributedSummaryDto,
} from './dtos/operating-diagnostics-response.dto';

/**
 * Admin-facing diagnostics over the machine operating timeline (ATT-1024). Gated on
 * `resources.update`, the same resource-administration permission the sibling operating-attribution
 * endpoint uses.
 */
@ApiTags('Resources')
@Controller('resources/:resourceId/operating-diagnostics')
export class ResourceOperatingDiagnosticsController {
  constructor(private readonly diagnosticsService: ResourceOperatingDiagnosticsService) {}

  @Get('state')
  @Auth('resources.update')
  @ApiOperation({
    summary: 'Get the current operating state and open interval of a resource',
    operationId: 'resourceOperatingDiagnosticsGetState',
  })
  @ApiResponse({ status: 200, description: 'Current operating state retrieved successfully.', type: OperatingStateDto })
  getState(@Param('resourceId', ParseIntPipe) resourceId: number): Promise<OperatingStateDto> {
    return this.diagnosticsService.getCurrentState(resourceId);
  }

  @Get('transitions')
  @Auth('resources.update')
  @ApiOperation({
    summary: 'List recent operating-timeline transitions, newest first, paginated by interval row',
    operationId: 'resourceOperatingDiagnosticsGetTransitions',
  })
  @ApiResponse({ status: 200, description: 'Transition history retrieved successfully.', type: OperatingTransitionPageDto })
  getTransitions(
    @Param('resourceId', ParseIntPipe) resourceId: number,
    @Query() query: OperatingDiagnosticsPageQueryDto,
  ): Promise<OperatingTransitionPageDto> {
    return this.diagnosticsService.getTransitionHistory(resourceId, query.page ?? 1, query.limit ?? 20);
  }

  @Get('unattributed')
  @Auth('resources.update')
  @ApiOperation({
    summary: 'Summarize unattributed operating duration for a resource over a date range',
    operationId: 'resourceOperatingDiagnosticsGetUnattributed',
  })
  @ApiResponse({
    status: 200,
    description: 'Unattributed operating summary retrieved successfully.',
    type: OperatingUnattributedSummaryDto,
  })
  async getUnattributed(
    @Param('resourceId', ParseIntPipe) resourceId: number,
    @Query() query: OperatingDiagnosticsRangeQueryDto,
  ): Promise<OperatingUnattributedSummaryDto> {
    const { from, to } = this.resolveRange(query);
    const summary: ResourceOperatingAttributionSummary = await this.diagnosticsService.getUnattributedSummary(
      resourceId,
      from,
      to,
    );
    return {
      asOf: summary.asOf,
      windowStart: summary.windowStart ?? from,
      operatingDurationMs: summary.operatingDurationMs,
      attributedOperatingDurationMs: summary.attributedOperatingDurationMs,
      unattributedOperatingDurationMs: summary.unattributedOperatingDurationMs,
      isProvisional: summary.isProvisional,
      attributionCount: summary.attributions.length,
    };
  }

  @Get('data-quality')
  @Auth('resources.update')
  @ApiOperation({
    summary: 'Report operating-timeline data-quality failures for a resource',
    operationId: 'resourceOperatingDiagnosticsGetDataQuality',
  })
  @ApiResponse({ status: 200, description: 'Data-quality report retrieved successfully.', type: OperatingDataQualityReportDto })
  getDataQuality(
    @Param('resourceId', ParseIntPipe) resourceId: number,
    @Query() query: OperatingDiagnosticsRangeQueryDto,
  ): Promise<OperatingDataQualityReportDto> {
    const { to } = this.resolveRange(query);
    return this.diagnosticsService.getDataQualityReport(resourceId, to);
  }

  @Get('verification')
  @Auth('resources.update')
  @ApiOperation({
    summary: 'Recompute derived operating durations from the authoritative timeline and compare',
    operationId: 'resourceOperatingDiagnosticsVerifyTimeline',
  })
  @ApiResponse({ status: 200, description: 'Timeline verification completed successfully.', type: OperatingTimelineVerificationDto })
  verifyTimeline(
    @Param('resourceId', ParseIntPipe) resourceId: number,
    @Query() query: OperatingDiagnosticsRangeQueryDto,
  ): Promise<OperatingTimelineVerificationDto> {
    const { from, to } = this.resolveRange(query);
    return this.diagnosticsService.verifyTimeline(resourceId, from, to);
  }

  private resolveRange(query: OperatingDiagnosticsRangeQueryDto): { from: Date; to: Date } {
    const to = query.to ? new Date(query.to) : new Date();
    const from = query.from ? new Date(query.from) : new Date(to.getTime() - 31 * 24 * 60 * 60_000);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw new BadRequestException('Invalid operating diagnostics time range');
    }
    if (from >= to) {
      throw new BadRequestException('Range start must be before range end');
    }
    return { from, to };
  }
}
