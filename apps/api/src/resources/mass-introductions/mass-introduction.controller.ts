import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiExtraModels, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Auth, AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import { MassIntroductionService } from './mass-introduction.service';
import { StartMassIntroductionDto } from './dtos/startMassIntroduction.dto';
import { MassIntroductionSessionDto } from './dtos/massIntroductionSession.dto';
import { RedeemMassIntroductionDto, RedeemMassIntroductionResponseDto } from './dtos/redeemMassIntroduction.dto';
import { MassIntroductionLiveEventDto } from './dtos/massIntroductionLiveEvent.dto';
import { MassIntroductionReadersQueryDto } from './dtos/massIntroductionReaders.dto';

@ApiTags('Access Control')
// Delivered over the bundled live-updates stream, which is not in the OpenAPI document.
@ApiExtraModels(MassIntroductionLiveEventDto)
@Controller('mass-introductions')
export class MassIntroductionController {
  constructor(private readonly massIntroductionService: MassIntroductionService) {}

  @Post()
  @Auth()
  @ApiOperation({
    summary: 'Start a 15-minute mass introduction for a resource or resource group',
    operationId: 'massIntroductionStart',
  })
  @ApiResponse({ status: 201, type: MassIntroductionSessionDto })
  @ApiResponse({ status: 400, description: 'Invalid target, or the reader is offline or unsupported' })
  @ApiResponse({ status: 403, description: 'The user is not an introducer for the target' })
  @ApiResponse({ status: 404, description: 'Target or reader not found' })
  @ApiResponse({ status: 409, description: 'The reader is busy' })
  start(@Body() dto: StartMassIntroductionDto, @Req() req: AuthenticatedRequest): Promise<MassIntroductionSessionDto> {
    return this.massIntroductionService.start(req.user, dto);
  }

  @Get('readers')
  @Auth()
  @ApiOperation({
    summary: 'List the readers a mass introduction for this resource or group may use',
    description: 'Only readers linked to the resource (or to a resource of the group) can show the scan screen.',
    operationId: 'massIntroductionEligibleReaders',
  })
  @ApiResponse({ status: 200, type: [Number], description: 'Reader ids' })
  @ApiResponse({ status: 403, description: 'The user is not an introducer for the target' })
  eligibleReaders(
    @Query() query: MassIntroductionReadersQueryDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<number[]> {
    return this.massIntroductionService.eligibleReaderIds(req.user, query);
  }

  @Post('redeem')
  @Auth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Join a mass introduction with the code shown next to its QR code',
    operationId: 'massIntroductionRedeem',
  })
  @ApiResponse({ status: 200, type: RedeemMassIntroductionResponseDto })
  @ApiResponse({ status: 400, description: 'Wrong or expired code' })
  @ApiResponse({ status: 404, description: 'The mass introduction has ended' })
  @ApiResponse({ status: 429, description: 'Too many wrong codes from this user in the last minute' })
  redeem(
    @Body() dto: RedeemMassIntroductionDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<RedeemMassIntroductionResponseDto> {
    return this.massIntroductionService.redeem(dto.publicId, dto.code, req.user);
  }

  @Get(':sessionId')
  @Auth()
  @ApiOperation({ summary: 'Get one of your running mass introductions', operationId: 'massIntroductionGet' })
  @ApiResponse({ status: 200, type: MassIntroductionSessionDto })
  @ApiResponse({ status: 404, description: 'Not found, ended, or started by someone else' })
  get(
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Req() req: AuthenticatedRequest,
  ): MassIntroductionSessionDto {
    return this.massIntroductionService.get(sessionId, req.user.id);
  }

  @Delete(':sessionId')
  @Auth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'End one of your running mass introductions', operationId: 'massIntroductionCancel' })
  @ApiResponse({ status: 204, description: 'Ended; the QR code and reader stop accepting participants' })
  @ApiResponse({ status: 404, description: 'Not found, ended, or started by someone else' })
  cancel(@Param('sessionId', ParseUUIDPipe) sessionId: string, @Req() req: AuthenticatedRequest): void {
    this.massIntroductionService.cancel(sessionId, req.user.id);
  }
}
