import {
  Controller,
  Get,
  Inject,
  Req,
  Body,
  Patch,
  Delete,
  BadRequestException,
  NotFoundException,
  HttpCode,
  Param,
  Query,
  ParseIntPipe,
  UseInterceptors,
  ClassSerializerInterceptor,
} from '@nestjs/common';
import { Auth, AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import { ApiOperation, ApiResponse, ApiTags, ApiQuery } from '@nestjs/swagger';
import { AttractapService } from './attractap.service';
import { NfcCardDto, toNfcCardDto } from './dtos/nfc-card.dto';
import { NfcCardSetActiveStateDto } from './dtos/rfid-card-set-active-state.dto';
import { RequiresLicense } from '../license/require-license.decorator';
import { LicenseModuleType } from '../license/license.service';
import { CardAccessService } from './card-access.service';
import { CardOperationsService } from './websockets/card-operations.service';

@ApiTags('Attractap')
@Controller('attractap/cards')
@RequiresLicense(LicenseModuleType.ATTRACTAP)
@UseInterceptors(ClassSerializerInterceptor)
export class AttractapNfcCardsController {
  public constructor(
    @Inject(AttractapService)
    private readonly attractapService: AttractapService,
    private readonly cardAccess: CardAccessService,
    private readonly cardOperations: CardOperationsService,
  ) {}

  @Get()
  @Auth()
  @ApiOperation({ summary: "Get your cards or manage another user's cards", operationId: 'getAllCards' })
  @ApiQuery({
    name: 'userId',
    required: false,
    type: Number,
    description: 'Card owner; defaults to yourself. Requires users.rfid-cards.manage for another user.',
  })
  @ApiResponse({
    status: 200,
    description: 'The list of all cards',
    type: [NfcCardDto],
  })
  async getCards(
    @Req() req: AuthenticatedRequest,
    @Query('userId', new ParseIntPipe({ optional: true })) userId?: number,
  ): Promise<NfcCardDto[]> {
    const ownerId = await this.cardAccess.resolveUserId(req.user, userId);
    return (await this.attractapService.getNFCCardsByUserId(ownerId)).map(toNfcCardDto);
  }

  @Patch('/:id/active')
  @Auth()
  @ApiOperation({ summary: 'Activate or deactivate an NFC card', operationId: 'toggleCardActive' })
  @ApiResponse({
    status: 200,
    description: 'The updated NFC card',
    type: NfcCardDto,
  })
  async toggleCardActive(
    @Param('id', ParseIntPipe) id: number,
    @Body() data: NfcCardSetActiveStateDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<NfcCardDto> {
    await this.cardAccess.getCardForManagement(id, req.user);
    if (data.active) {
      return toNfcCardDto(await this.attractapService.activateNFCCard(id));
    } else {
      return toNfcCardDto(await this.attractapService.deactivateNFCCard(id));
    }
  }

  @Delete('/:id')
  @Auth()
  @HttpCode(204)
  @ApiOperation({
    summary: 'Delete a UID-only card',
    description:
      'A UID-only card has nothing written on it, so it is removed without a reader. Secure cards are reset through a reader instead.',
    operationId: 'deleteUidOnlyCard',
  })
  @ApiResponse({ status: 204, description: 'The card was deleted' })
  @ApiResponse({ status: 400, description: 'CARD_NOT_UID_ONLY: a secure card is reset through a reader instead' })
  @ApiResponse({ status: 403, description: 'The card belongs to another user' })
  @ApiResponse({ status: 404, description: 'The card does not exist' })
  async deleteUidOnlyCard(@Param('id', ParseIntPipe) id: number, @Req() req: AuthenticatedRequest): Promise<void> {
    const card = await this.cardAccess.getCardForManagement(id, req.user);
    const outcome = await this.cardOperations.deleteUidOnlyCard(card, {
      userId: req.user.id,
      authenticationMethod: req.user.authenticationMethod ?? 'session',
      ...(req.user.authenticationMethod === 'api-token' ? { apiTokenId: req.user.apiTokenId } : {}),
    });
    if (outcome.ok) return;
    if (outcome.error === 'CARD_NOT_FOUND') throw new NotFoundException(`RFID card ${id} not found`);
    throw new BadRequestException(outcome.error);
  }
}
