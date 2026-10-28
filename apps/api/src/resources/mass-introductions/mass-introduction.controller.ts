import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import { ApiExtraModels, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Auth, AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import { MassIntroductionService } from './mass-introduction.service';
import { StartMassIntroductionDto } from './dtos/startMassIntroduction.dto';
import { MassIntroductionSessionDto } from './dtos/massIntroductionSession.dto';
import { RedeemMassIntroductionDto, RedeemMassIntroductionResponseDto } from './dtos/redeemMassIntroduction.dto';
import { MassIntroductionLiveEventDto } from './dtos/massIntroductionLiveEvent.dto';
import { ClaimMassIntroductionDto, MassIntroductionTicketDto } from './dtos/claimMassIntroduction.dto';

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

  @Post('claim')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Exchange a scanned mass-introduction QR code for a ticket (no sign-in required)',
    description:
      'QR codes change every 15 seconds. Claiming one right after the scan yields a single-use ticket ' +
      'that survives signing in, which usually takes longer than a code is valid.',
    operationId: 'massIntroductionClaim',
  })
  @ApiResponse({ status: 200, type: MassIntroductionTicketDto })
  @ApiResponse({ status: 404, description: 'The QR code is invalid or has expired' })
  @ApiResponse({ status: 429, description: 'Too many invalid codes for this mass introduction' })
  claim(@Body() dto: ClaimMassIntroductionDto): MassIntroductionTicketDto {
    return this.massIntroductionService.claim(dto.token);
  }

  @Post('redeem')
  @Auth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get introduced with a ticket from a scanned mass-introduction QR code',
    operationId: 'massIntroductionRedeem',
  })
  @ApiResponse({ status: 200, type: RedeemMassIntroductionResponseDto })
  @ApiResponse({ status: 404, description: 'The ticket is invalid, used or expired' })
  redeem(
    @Body() dto: RedeemMassIntroductionDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<RedeemMassIntroductionResponseDto> {
    return this.massIntroductionService.redeemTicket(dto.ticket, req.user);
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
