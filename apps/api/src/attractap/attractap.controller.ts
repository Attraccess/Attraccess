import { Auth, AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';

import {
  Body,
  ClassSerializerInterceptor,
  Controller,
  Delete,
  Get,
  Inject,
  Logger,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Req,
  UseInterceptors,
  StreamableFile,
  Post,
} from '@nestjs/common';

import { ApiBody, ApiOperation, ApiParam, ApiResponse, ApiTags, ApiProduces } from '@nestjs/swagger';

import { LicenseModuleType } from '../license/license.service';

import { RequiresLicense } from '../license/require-license.decorator';

import { AttractapService } from './attractap.service';
import { isPaired } from './reader-pairing';

import { UpdateReaderResponseDto } from './dtos/update-reader-response.dto';

import { AttractapReaderDto, toReaderDto } from './dtos/reader.dto';

import { UpdateReaderDto } from './dtos/update-reader.dto';

import { AttractapGateway } from './websockets/websocket.gateway';

import { WebsocketService } from './websockets/websocket.service';
import { CardAccessService } from './card-access.service';
import { ResourceListVisibilityService } from '../resources/visibility/resource-list-visibility.service';
import type { AttractapReader } from '@attraccess/application-models';

import { AttractapCrashReportDto } from './dtos/crash-report.dto';

import { EnrollNfcCardResponseDto } from './dtos/enroll-rfid-card-response.dto';

import { EnrollNfcCardDto } from './dtos/enroll-rfid-card.dto';

import { ResetNfcCardResponseDto } from './dtos/reset-rfid-card-response.dto';

import { ResetNfcCardDto } from './dtos/reset-rfid-card.dto';

@ApiTags('Attractap')
@Controller('attractap/readers')
@UseInterceptors(ClassSerializerInterceptor)
@RequiresLicense(LicenseModuleType.ATTRACTAP)
export class AttractapController {
  public constructor(
    @Inject(AttractapGateway)
    protected readonly attractapGateway: AttractapGateway,
    @Inject(WebsocketService)
    protected readonly websocketService: WebsocketService,
    @Inject(AttractapService)
    protected readonly attractapService: AttractapService,
    protected readonly cardAccess: CardAccessService,
    protected readonly listVisibility: ResourceListVisibilityService,
  ) {}

  protected readonly logger = new Logger(AttractapController.name);

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
    this.logger.debug(`Updating reader ${readerId} (fields: ${Object.keys(updateData ?? {}).join(', ')})`);
    // No rename and no resource assignment for a reader whose pairing was removed.
    await this.requirePairedReader(readerId);
    try {
      const updatedReader = await this.attractapService.updateReader(readerId, updateData);

      return {
        message: 'Reader updated successfully',
        reader: toReaderDto(updatedReader),
      };
    } catch (error) {
      if (error.message?.includes('not found')) {
        throw new NotFoundException(`Reader with ID ${readerId} not found`);
      }
      throw error;
    }
  }

  @Get()
  @Auth()
  @ApiOperation({ summary: 'Get all readers', operationId: 'getReaders' })
  @ApiResponse({
    status: 200,
    description: 'The list of readers',
    type: [AttractapReaderDto],
  })
  async getReaders(@Req() req: AuthenticatedRequest): Promise<AttractapReaderDto[]> {
    // `resources` is a plain ManyToMany with no eager loading, so without this the relation is
    // absent from the response entirely. Callers that group readers by resource — the supervised
    // start popup (ATT-816) — silently see every reader as unattached.
    // Readers whose pairing was removed are listed by GET /attractap/readers/to-pair, for the pairing session only.
    const readers = await this.attractapService.getPairedReaders({ withResources: true });
    return (await this.visibleReaders(req.user, readers)).map(toReaderDto);
  }

  /**
   * Machine list visibility (ATT-843): a narrowed viewer sees only the linked machines they may see, and only the
   * readers that serve at least one of them, so the reader list cannot be used to read the equipment list.
   */
  private async visibleReaders(user: AuthenticatedRequest['user'], readers: AttractapReader[]) {
    if ((await this.listVisibility.scopeOf(user)) === 'all') return readers;
    const visible = new Set(
      await this.listVisibility.filterVisible(
        user,
        readers.flatMap((reader) => (reader.resources ?? []).map((resource) => resource.id)),
      ),
    );
    return readers
      .map((reader) => ({
        ...reader,
        resources: (reader.resources ?? []).filter((resource) => visible.has(resource.id)),
      }))
      .filter((reader) => reader.resources.length > 0);
  }

  @Get('to-pair')
  @Auth('resources.update')
  @ApiOperation({
    summary: 'Readers whose pairing was removed (pairing session only)',
    operationId: 'getReadersToPair',
  })
  @ApiResponse({
    status: 200,
    description: 'Readers whose pairing was removed and that have to be paired again',
    type: [AttractapReaderDto],
  })
  async getReadersToPair(): Promise<AttractapReaderDto[]> {
    return (await this.attractapService.getReadersToPair()).map(toReaderDto);
  }

  @Get(':readerId')
  @Auth()
  @ApiOperation({ summary: 'Get a reader by ID', operationId: 'getReaderById' })
  @ApiParam({ name: 'readerId', description: 'The ID of the reader to get', example: 1 })
  @ApiResponse({
    status: 200,
    description: 'The reader',
    type: AttractapReaderDto,
  })
  @ApiResponse({ status: 404, description: 'Reader not found' })
  async getReaderById(
    @Param('readerId', ParseIntPipe) readerId: number,
    @Req() req: AuthenticatedRequest,
  ): Promise<AttractapReaderDto> {
    const [reader] = await this.visibleReaders(req.user, [await this.requirePairedReader(readerId)]);
    if (!reader) throw new NotFoundException(`Reader with ID ${readerId} not found`);
    return toReaderDto(reader);
  }

  /** A reader whose pairing was removed is not visible outside the pairing session. */
  private async requirePairedReader(readerId: number) {
    const reader = await this.attractapService.findReaderById(readerId);
    if (!reader || !isPaired(reader)) throw new NotFoundException(`Reader with ID ${readerId} not found`);
    return reader;
  }

  @Delete(':readerId')
  @Auth('resources.delete')
  @ApiOperation({ summary: 'Delete a reader', operationId: 'deleteReader' })
  @ApiParam({ name: 'readerId', description: 'The ID of the reader to delete', example: 1 })
  @ApiResponse({ status: 200, description: 'Reader deleted successfully' })
  public async deleteReader(
    @Param('readerId', ParseIntPipe) readerId: number,
    @Req() req: AuthenticatedRequest,
  ): Promise<void> {
    const deleted = await this.attractapService.deleteReader(readerId);
    if (deleted) {
      await this.attractapService.recordReaderDeregistration(readerId, {
        userId: req.user.id,
        authenticationMethod: req.user.authenticationMethod ?? 'session',
        ...(req.user.authenticationMethod === 'api-token' ? { apiTokenId: req.user.apiTokenId } : {}),
      });
    }
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
    await this.requirePairedReader(readerId);
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
    await this.requirePairedReader(readerId);
    const result = await this.attractapService.getCrashReportCoredump(readerId, reportId);

    if (!result) {
      throw new NotFoundException(`No coredump found for crash report ${reportId} of reader ${readerId}`);
    }

    return new StreamableFile(result.coredump, {
      type: 'application/octet-stream',
      disposition: `attachment; filename="${result.filename}"`,
    });
  }

  @Post('enroll-nfc-card')
  @Auth()
  @ApiOperation({ summary: 'Enroll a new NFC card', operationId: 'enrollNfcCard' })
  @ApiBody({ type: EnrollNfcCardDto })
  @ApiResponse({
    status: 200,
    description: 'Enrollment initiated, continue on Reader',
    type: EnrollNfcCardResponseDto,
  })
  public async enrollNfcCard(
    @Body() enrollData: EnrollNfcCardDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<EnrollNfcCardResponseDto> {
    const userId = await this.cardAccess.resolveUserId(req.user, enrollData.userId);
    await this.attractapGateway.startEnrollOfNewNfcCard({
      readerId: enrollData.readerId,
      userId,
      actorId: req.user.id,
      authenticationMethod: req.user.authenticationMethod ?? 'session',
      ...(req.user.authenticationMethod === 'api-token' ? { apiTokenId: req.user.apiTokenId } : {}),
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
  public async resetNfcCard(
    @Body() resetData: ResetNfcCardDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<ResetNfcCardResponseDto> {
    await this.cardAccess.getCardForManagement(resetData.cardId, req.user);
    await this.attractapGateway.startResetOfNfcCard({
      readerId: resetData.readerId,
      cardId: resetData.cardId,
      userId: req.user.id,
      authenticationMethod: req.user.authenticationMethod ?? 'session',
      ...(req.user.authenticationMethod === 'api-token' ? { apiTokenId: req.user.apiTokenId } : {}),
    });

    return {
      message: 'Reset initiated, continue on Reader',
    };
  }
}
