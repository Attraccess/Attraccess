import {
  Controller,
  Get,
  Inject,
  Param,
  ParseIntPipe,
  Post,
  Req,
  Patch,
  Body,
  NotFoundException,
  Logger,
  ClassSerializerInterceptor,
  UseInterceptors,
  Delete,
  StreamableFile,
} from '@nestjs/common';
import { AttractapGateway } from './websockets/websocket.gateway';
import { AuthenticatedRequest, Auth, Attractap } from '@attraccess/plugins-backend-sdk';
import { ApiOperation, ApiResponse, ApiParam, ApiTags, ApiBody, ApiProduces } from '@nestjs/swagger';
import { WebsocketService } from './websockets/websocket.service';
import { AttractapService } from './attractap.service';
import { EnrollNfcCardDto } from './dtos/enroll-nfc-card.dto';
import { ResetNfcCardDto } from './dtos/reset-nfc-card.dto';
import { UpdateReaderResponseDto } from './dtos/update-reader-response.dto';
import { EnrollNfcCardResponseDto } from './dtos/enroll-nfc-card-response.dto';
import { ResetNfcCardResponseDto } from './dtos/reset-nfc-card-response.dto';
import { UpdateReaderDto } from './dtos/update-reader.dto';
import { AttractapCrashReportDto } from './dtos/crash-report.dto';
import { BleProxyCommandDto, BleProxyResult } from './dtos/ble-proxy.dto';
import { RequiresLicense } from '../license/require-license.decorator';
import { LicenseModuleType } from '../license/license.service';

@ApiTags('Attractap')
@Controller('attractap/readers')
@UseInterceptors(ClassSerializerInterceptor)
@RequiresLicense(LicenseModuleType.ATTRACTAP)
export class AttractapController {
  private readonly logger = new Logger(AttractapController.name);

  public constructor(
    @Inject(AttractapGateway)
    private readonly attractapGateway: AttractapGateway,
    @Inject(WebsocketService)
    private readonly websocketService: WebsocketService,
    @Inject(AttractapService)
    private readonly attractapService: AttractapService,
  ) {}

  @Post('enroll-nfc-card')
  @Auth()
  @ApiOperation({ summary: 'Enroll a new NFC card', operationId: 'enrollNfcCard' })
  @ApiBody({ type: EnrollNfcCardDto })
  @ApiResponse({
    status: 200,
    description: 'Enrollment initiated, continue on Reader',
    type: EnrollNfcCardResponseDto,
  })
  async enrollNfcCard(
    @Body() enrollData: EnrollNfcCardDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<EnrollNfcCardResponseDto> {
    await this.attractapGateway.startEnrollOfNewNfcCard({
      readerId: enrollData.readerId,
      userId: req.user.id,
    });

    return {
      message: 'Enrollment initiated, continue on Reader',
    };
  }

  @Post('reset-nfc-card')
  @Auth()
  @ApiOperation({ summary: 'Reset an NFC card', operationId: 'resetNfcCard' })
  @ApiBody({ type: ResetNfcCardDto })
  @ApiResponse({
    status: 200,
    description: 'Reset initiated, continue on Reader',
    type: ResetNfcCardResponseDto,
  })
  async resetNfcCard(
    @Body() resetData: ResetNfcCardDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<ResetNfcCardResponseDto> {
    await this.attractapGateway.startResetOfNfcCard({
      readerId: resetData.readerId,
      cardId: resetData.cardId,
      userId: req.user.id,
    });

    return {
      message: 'Reset initiated, continue on Reader',
    };
  }

  @Patch(':readerId')
  @Auth('resources.update')
  @ApiOperation({ summary: 'Update reader name and connected resources', operationId: 'updateReader' })
  @ApiParam({ name: 'readerId', description: 'The ID of the reader to update', example: 1 })
  @ApiBody({ type: UpdateReaderDto })
  @ApiResponse({
    status: 200,
    description: 'Reader updated successfully',
    type: UpdateReaderResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Reader not found' })
  async updateReader(
    @Param('readerId', ParseIntPipe) readerId: number,
    @Body() updateData: UpdateReaderDto,
  ): Promise<UpdateReaderResponseDto> {
    this.logger.debug(`Updating reader ${readerId} with data: ${JSON.stringify(updateData)}`);
    try {
      const updatedReader = await this.attractapService.updateReader(readerId, updateData);

      return {
        message: 'Reader updated successfully',
        reader: updatedReader,
      };
    } catch (error) {
      if (error.message?.includes('not found')) {
        throw new NotFoundException(`Reader with ID ${readerId} not found`);
      }
      throw error;
    }
  }

  @Post(':readerId/ble-proxy')
  @Auth('resources.update')
  @ApiOperation({ summary: 'ATT-1031 prototype: execute a raw BLE GATT operation', operationId: 'bleProxyCommand' })
  @ApiParam({
    name: 'readerId',
    description: 'The connected reader which should perform the BLE operation',
    example: 1,
  })
  @ApiBody({ type: BleProxyCommandDto })
  async bleProxyCommand(
    @Param('readerId', ParseIntPipe) readerId: number,
    @Body() command: BleProxyCommandDto,
  ): Promise<BleProxyResult> {
    return await this.attractapGateway.sendBleProxyCommand(readerId, command);
  }

  @Get()
  @Auth()
  @ApiOperation({ summary: 'Get all readers', operationId: 'getReaders' })
  @ApiResponse({
    status: 200,
    description: 'The list of readers',
    type: [Attractap],
  })
  async getReaders(): Promise<Attractap[]> {
    // `resources` is a plain ManyToMany with no eager loading, so without this the relation is
    // absent from the response entirely. Callers that group readers by resource — the supervised
    // start popup (ATT-816) — silently see every reader as unattached.
    return await this.attractapService.getAllReaders({ relations: ['resources'] });
  }

  @Get(':readerId')
  @Auth()
  @ApiOperation({ summary: 'Get a reader by ID', operationId: 'getReaderById' })
  @ApiParam({ name: 'readerId', description: 'The ID of the reader to get', example: 1 })
  @ApiResponse({
    status: 200,
    description: 'The reader',
    type: Attractap,
  })
  @ApiResponse({ status: 404, description: 'Reader not found' })
  async getReaderById(@Param('readerId', ParseIntPipe) readerId: number): Promise<Attractap> {
    return await this.attractapService.findReaderById(readerId);
  }

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

  @Delete(':readerId')
  @Auth('resources.delete')
  @ApiOperation({ summary: 'Delete a reader', operationId: 'deleteReader' })
  @ApiParam({ name: 'readerId', description: 'The ID of the reader to delete', example: 1 })
  @ApiResponse({ status: 200, description: 'Reader deleted successfully' })
  async deleteReader(@Param('readerId', ParseIntPipe) readerId: number): Promise<void> {
    await this.attractapService.deleteReader(readerId);
  }
}
