import { Controller, Get, Inject, Post, Req, Body, Patch, Param } from '@nestjs/common';
import { Auth, AuthenticatedRequest, NFCCard } from '@attraccess/plugins-backend-sdk';
import { ApiOperation, ApiResponse, ApiTags, ApiBody } from '@nestjs/swagger';
import { AttractapService } from './attractap.service';
import { AppKeyRequestDto } from './dtos/app-key-request.dto';
import { AppKeyResponseDto } from './dtos/app-key-response.dto';
import { NfcCardSetActiveStateDto } from './dtos/nfc-card-set-active-state.dto';

@ApiTags('Attractap')
@Controller('attractap/cards')
export class AttractapNfcCardsController {
  public constructor(
    @Inject(AttractapService)
    private readonly attractapService: AttractapService
  ) {}

  @Post('keys')
  @Auth('canManageUsers')
  @ApiOperation({ summary: 'Get the app key for a card by UID', operationId: 'getAppKeyByUid' })
  @ApiBody({ type: AppKeyRequestDto })
  @ApiResponse({
    status: 200,
    description: 'The app key for the card',
    type: AppKeyResponseDto,
  })
  async getAppKeyByUid(
    @Body() appKeyRequest: AppKeyRequestDto,
    @Req() req: AuthenticatedRequest
  ): Promise<AppKeyResponseDto> {
    const key = await this.attractapService.generateNTAG424Key({
      keyNo: appKeyRequest.keyNo,
      cardUID: appKeyRequest.cardUID,
      userId: req.user.id,
    });

    return {
      key: this.attractapService.uint8ArrayToHexString(key),
    };
  }

  @Get()
  @Auth()
  @ApiOperation({ summary: 'Get all of your cards', operationId: 'getAllCards' })
  @ApiResponse({
    status: 200,
    description: 'The list of all cards',
    type: [NFCCard],
  })
  async getCards(@Req() req: AuthenticatedRequest): Promise<NFCCard[]> {
    return await this.attractapService.getNFCCardsByUserId(req.user.id);
  }

  @Patch('/:id/active')
  @Auth()
  @ApiOperation({ summary: 'Activate or deactivate an NFC card', operationId: 'toggleCardActive' })
  @ApiResponse({
    status: 200,
    description: 'The updated NFC card',
    type: NFCCard,
  })
  async toggleCardActive(@Param('id') id: number, @Body() data: NfcCardSetActiveStateDto): Promise<NFCCard> {
    if (data.active) {
      return await this.attractapService.activateNFCCard(id);
    } else {
      return await this.attractapService.deactivateNFCCard(id);
    }
  }
}
