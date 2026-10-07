import { Auth, AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import { Body, Post, Req } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AttractapControllerRouteContext } from './attractap.controller.route-context';
import { EnrollNfcCardResponseDto } from './dtos/enroll-rfid-card-response.dto';
import { EnrollNfcCardDto } from './dtos/enroll-rfid-card.dto';
import { ResetNfcCardResponseDto } from './dtos/reset-rfid-card-response.dto';
import { ResetNfcCardDto } from './dtos/reset-rfid-card.dto';
export abstract class AttractapCardRoutes extends AttractapControllerRouteContext {
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
