import { Auth } from '@attraccess/plugins-backend-sdk';
import { Get, NotFoundException, Param, ParseIntPipe, StreamableFile } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiProduces, ApiResponse } from '@nestjs/swagger';
import { AttractapCardRoutes } from './attractap-card.routes';
import { AttractapCrashReportDto } from './dtos/crash-report.dto';
export abstract class AttractapCrashReportRoutes extends AttractapCardRoutes {
  @Get(':readerId/crash-reports')
  @Auth('resources.update')
  @ApiOperation({ summary: 'Get crash reports for a reader', operationId: 'getReaderCrashReports' })
  @ApiParam({ name: 'readerId', description: 'The ID of the reader', example: 1 })
  @ApiResponse({
    status: 200,
    description: 'The list of crash reports for the reader, newest first',
    type: [AttractapCrashReportDto],
  })
  async getReaderCrashReports(@Param('readerId', ParseIntPipe) readerId: number): Promise<AttractapCrashReportDto[]> {
    return await this.attractapService.getCrashReportsForReader(readerId);
  }

  @Get(':readerId/crash-reports/:reportId/coredump')
  @Auth('resources.update')
  @ApiOperation({
    summary: 'Download the coredump blob of a crash report',
    operationId: 'getReaderCrashReportCoredump',
  })
  @ApiParam({ name: 'readerId', description: 'The ID of the reader', example: 1 })
  @ApiParam({ name: 'reportId', description: 'The ID of the crash report', example: 1 })
  @ApiProduces('application/octet-stream')
  @ApiResponse({ status: 200, description: 'The coredump binary blob' })
  @ApiResponse({ status: 404, description: 'Crash report or coredump not found' })
  async getReaderCrashReportCoredump(
    @Param('readerId', ParseIntPipe) readerId: number,
    @Param('reportId', ParseIntPipe) reportId: number,
  ): Promise<StreamableFile> {
    const result = await this.attractapService.getCrashReportCoredump(readerId, reportId);

    if (!result) {
      throw new NotFoundException(`No coredump found for crash report ${reportId} of reader ${readerId}`);
    }

    return new StreamableFile(result.coredump, {
      type: 'application/octet-stream',
      disposition: `attachment; filename="${result.filename}"`,
    });
  }
}
